import React from "react";
import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";

const TITLE = "Laptop Bundle Discount";
const NAMESPACE = "$app:bundle-discount";
const KEY = "function-configuration";

/**
 * Match this to the discount type title your function exposes.
 * If needed, adjust after checking appDiscountTypes in GraphiQL.
 */
const DISCOUNT_TYPE_TITLE = "SKU Price Lock";

const GET_APP_DISCOUNT_TYPES_QUERY = `#graphql
query GetAppDiscountTypes {
  appDiscountTypes {
    title
    functionId
    appKey
  }
}
`;

const FIND_QUERY = `#graphql
query FindBundleDiscounts {
  discountNodes(first: 50, query: "type:app") {
    nodes {
      id
      metafield(namespace: "${NAMESPACE}", key: "${KEY}") {
        jsonValue
      }
      discount {
        __typename
        ... on DiscountAutomaticApp {
          title
          status
        }
      }
    }
  }
}
`;

const CREATE_MUTATION = `#graphql
mutation CreateBundleDiscount($input: DiscountAutomaticAppInput!) {
  discountAutomaticAppCreate(automaticAppDiscount: $input) {
    automaticAppDiscount {
      discountId
      title
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

const UPDATE_MUTATION = `#graphql
mutation UpdateBundleDiscount($id: ID!, $input: DiscountAutomaticAppInput!) {
  discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $input) {
    automaticAppDiscount {
      discountId
      title
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

function emptyAccessory() {
  return {
    sku: "",
    discountAmount: "",
    label: "",
  };
}

function emptyRule() {
  return {
    name: "",
    active: true,
    triggerSku: "",
    ratio: 1,
    message: "Laptop bundle discount",
    accessories: [emptyAccessory()],
  };
}

function normalizeConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object" || !Array.isArray(rawConfig.rules)) {
    return { rules: [] };
  }

  return {
    rules: rawConfig.rules.map((rule) => ({
      name: String(rule?.name || ""),
      active: Boolean(rule?.active ?? true),
      triggerSku: String(rule?.triggerSku || ""),
      ratio: Number(rule?.ratio || 1),
      message: String(rule?.message || "Laptop bundle discount"),
      accessories:
        Array.isArray(rule?.accessories) && rule.accessories.length > 0
          ? rule.accessories.map((accessory) => ({
              sku: String(accessory?.sku || ""),
              discountAmount:
                accessory?.discountAmount === 0 || accessory?.discountAmount
                  ? String(accessory.discountAmount)
                  : "",
              label: String(accessory?.label || ""),
            }))
          : [emptyAccessory()],
    })),
  };
}

function sanitizeConfig(rawConfig) {
  const config = normalizeConfig(rawConfig);

  return {
    rules: config.rules
      .map((rule) => ({
        name: rule.name.trim(),
        active: Boolean(rule.active),
        triggerSku: rule.triggerSku.trim(),
        ratio: Math.max(1, parseInt(rule.ratio, 10) || 1),
        message: rule.message.trim(),
        accessories: (rule.accessories || [])
          .map((accessory) => ({
            sku: String(accessory.sku || "").trim(),
            discountAmount: parseFloat(
              String(accessory.discountAmount || "").replace(",", "."),
            ),
            label: String(accessory.label || "").trim(),
          }))
          .filter(
            (accessory) =>
              accessory.sku &&
              Number.isFinite(accessory.discountAmount) &&
              accessory.discountAmount > 0,
          ),
      }))
      .filter(
        (rule) => rule.name && rule.triggerSku && rule.accessories.length > 0,
      ),
  };
}

async function getCurrentStoreFunctionId(admin) {
  const res = await admin.graphql(GET_APP_DISCOUNT_TYPES_QUERY);
  const json = await res.json();

  const types = json?.data?.appDiscountTypes || [];

  const exactTitleMatch = types.find(
    (item) => item?.title === DISCOUNT_TYPE_TITLE && item?.functionId,
  );

  if (exactTitleMatch?.functionId) {
    return exactTitleMatch.functionId;
  }

  if (types.length === 1 && types[0]?.functionId) {
    return types[0].functionId;
  }

  const anyFunctionMatch = types.find((item) => item?.functionId);
  if (anyFunctionMatch?.functionId) {
    return anyFunctionMatch.functionId;
  }

  throw new Error(
    `Could not find a functionId for this store. Check appDiscountTypes and confirm the title "${DISCOUNT_TYPE_TITLE}".`,
  );
}

async function findOrCreateBundleDiscount(admin) {
  const res = await admin.graphql(FIND_QUERY);
  const json = await res.json();

  const nodes = json?.data?.discountNodes?.nodes || [];

  for (const node of nodes) {
    const discount = node?.discount;

    if (
      discount?.__typename === "DiscountAutomaticApp" &&
      discount.title === TITLE
    ) {
      return {
        id: node.id,
        title: discount.title,
        status: discount.status || "",
        config: normalizeConfig(node.metafield?.jsonValue),
      };
    }
  }

  const functionId = await getCurrentStoreFunctionId(admin);

  const createRes = await admin.graphql(CREATE_MUTATION, {
    variables: {
      input: {
        title: TITLE,
        functionId,
        startsAt: new Date().toISOString(),
        discountClasses: ["PRODUCT"],
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: true,
        },
        metafields: [
          {
            namespace: NAMESPACE,
            key: KEY,
            type: "json",
            value: JSON.stringify({ rules: [] }),
          },
        ],
      },
    },
  });

  const createJson = await createRes.json();
  const createPayload = createJson?.data?.discountAutomaticAppCreate;
  const userErrors = createPayload?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  const newDiscountId = createPayload?.automaticAppDiscount?.discountId;

  if (!newDiscountId) {
    throw new Error("Bundle discount was not created.");
  }

  return {
    id: newDiscountId,
    title: TITLE,
    status: createPayload?.automaticAppDiscount?.status || "",
    config: { rules: [] },
  };
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    const discount = await findOrCreateBundleDiscount(admin);

    return {
      ok: true,
      error: null,
      title: discount.title,
      status: discount.status,
      config: discount.config,
    };
  } catch (err) {
    console.error("Bundle discount loader error", err);

    return {
      ok: false,
      error: err.message || "Failed to load bundle discount settings.",
      title: TITLE,
      status: "",
      config: { rules: [] },
    };
  }
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("_action") || "").trim();

  try {
    if (intent !== "save") {
      return { ok: false, error: "Unknown action." };
    }

    const configJson = String(formData.get("config") || "{}");

    let parsed;
    try {
      parsed = JSON.parse(configJson);
    } catch {
      return { ok: false, error: "Invalid configuration payload." };
    }

    const cleanConfig = sanitizeConfig(parsed);
    const discount = await findOrCreateBundleDiscount(admin);

    const updateRes = await admin.graphql(UPDATE_MUTATION, {
      variables: {
        id: discount.id,
        input: {
          metafields: [
            {
              namespace: NAMESPACE,
              key: KEY,
              type: "json",
              value: JSON.stringify(cleanConfig),
            },
          ],
        },
      },
    });

    const updateJson = await updateRes.json();
    const payload = updateJson?.data?.discountAutomaticAppUpdate;
    const userErrors = payload?.userErrors || [];

    if (userErrors.length > 0) {
      return {
        ok: false,
        error: userErrors.map((e) => e.message).join(", "),
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("Bundle discount action error", err);
    return { ok: false, error: err.message || "Unexpected server error." };
  }
}

export default function BundleDiscountsPage() {
  const { title, status, config } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const configJson = JSON.stringify(config);

  return (
    <s-page heading="Bundle Discount Rules">
      {actionData?.error && (
        <s-section>
          <s-box padding="base" background="bg-critical-strong" borderRadius="loose">
            <s-text as="p">Error: {actionData.error}</s-text>
          </s-box>
        </s-section>
      )}

      {actionData?.ok && !actionData.error && (
        <s-section>
          <s-box padding="base" background="bg-success-strong" borderRadius="loose">
            <s-text as="p">Bundle discount rules saved successfully.</s-text>
          </s-box>
        </s-section>
      )}

      <s-section>
        <s-paragraph>
          Manage laptop bundle rules for the automatic discount:{" "}
          <strong>{title}</strong>
          {status ? ` (${status})` : ""}
        </s-paragraph>

        <BundleRulesEditor initialConfig={config} isSubmitting={isSubmitting} />
      </s-section>

      <s-section>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            View current JSON config
          </summary>
          <pre
            style={{
              marginTop: "12px",
              background: "#f6f6f7",
              padding: "12px",
              borderRadius: "6px",
              overflowX: "auto",
              fontSize: "12px",
            }}
          >
            {configJson}
          </pre>
        </details>
      </s-section>
    </s-page>
  );
}

function BundleRulesEditor({ initialConfig, isSubmitting }) {
  const [config, setConfig] = React.useState(normalizeConfig(initialConfig));

  React.useEffect(() => {
    setConfig(normalizeConfig(initialConfig));
  }, [initialConfig]);

  function updateRule(ruleIndex, updates) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      next.rules[ruleIndex] = {
        ...next.rules[ruleIndex],
        ...updates,
      };
      return next;
    });
  }

  function addRule() {
    setConfig((prev) => ({
      ...prev,
      rules: [...prev.rules, emptyRule()],
    }));
  }

  function removeRule(ruleIndex) {
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, index) => index !== ruleIndex),
    }));
  }

  function updateAccessory(ruleIndex, accessoryIndex, updates) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      next.rules[ruleIndex].accessories[accessoryIndex] = {
        ...next.rules[ruleIndex].accessories[accessoryIndex],
        ...updates,
      };
      return next;
    });
  }

  function addAccessory(ruleIndex) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      next.rules[ruleIndex].accessories.push(emptyAccessory());
      return next;
    });
  }

  function removeAccessory(ruleIndex, accessoryIndex) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      next.rules[ruleIndex].accessories = next.rules[ruleIndex].accessories.filter(
        (_, index) => index !== accessoryIndex,
      );

      if (next.rules[ruleIndex].accessories.length === 0) {
        next.rules[ruleIndex].accessories.push(emptyAccessory());
      }

      return next;
    });
  }

  return (
    <Form method="post">
      <input type="hidden" name="_action" value="save" />
      <input type="hidden" name="config" value={JSON.stringify(config)} />

      <s-box display="flex" flexDirection="column" gap="base">
        {config.rules.length === 0 && (
          <s-box padding="base" background="bg-surface-secondary" borderRadius="loose">
            <s-text as="p">No bundle rules yet. Add your first laptop bundle below.</s-text>
          </s-box>
        )}

        {config.rules.map((rule, ruleIndex) => (
          <s-box
            key={`rule-${ruleIndex}`}
            padding="base"
            borderWidth="1"
            borderColor="border-subdued"
            borderRadius="loose"
          >
            <s-box display="flex" flexDirection="column" gap="base">
              <s-box display="flex" justifyContent="space-between" alignItems="center">
                <s-text as="h3" fontWeight="bold">
                  Rule {ruleIndex + 1}
                </s-text>

                <button
                  type="button"
                  onClick={() => removeRule(ruleIndex)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#b42318",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Remove rule
                </button>
              </s-box>

              <s-box display="flex" flexDirection="row" gap="base">
                <s-box flex="1">
                  <label>
                    <s-text as="p" fontWeight="medium">Rule name</s-text>
                    <input
                      value={rule.name}
                      onChange={(e) => updateRule(ruleIndex, { name: e.target.value })}
                      placeholder="e.g. ASUS Vivobook Bundle"
                      style={inputStyle}
                    />
                  </label>
                </s-box>

                <s-box flex="1">
                  <label>
                    <s-text as="p" fontWeight="medium">Trigger laptop SKU</s-text>
                    <input
                      value={rule.triggerSku}
                      onChange={(e) => updateRule(ruleIndex, { triggerSku: e.target.value })}
                      placeholder="e.g. M1605NAQ-716512S0W"
                      style={inputStyle}
                    />
                  </label>
                </s-box>
              </s-box>

              <s-box display="flex" flexDirection="row" gap="base">
                <s-box flex="1">
                  <label>
                    <s-text as="p" fontWeight="medium">Ratio</s-text>
                    <input
                      type="number"
                      min="1"
                      value={rule.ratio}
                      onChange={(e) => updateRule(ruleIndex, { ratio: e.target.value })}
                      placeholder="1"
                      style={inputStyle}
                    />
                  </label>
                </s-box>

                <s-box flex="2">
                  <label>
                    <s-text as="p" fontWeight="medium">Discount message</s-text>
                    <input
                      value={rule.message}
                      onChange={(e) => updateRule(ruleIndex, { message: e.target.value })}
                      placeholder="e.g. Laptop accessory bundle discount"
                      style={inputStyle}
                    />
                  </label>
                </s-box>

                <s-box flex="1">
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "24px" }}>
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onChange={(e) => updateRule(ruleIndex, { active: e.target.checked })}
                    />
                    <s-text as="span">Active</s-text>
                  </label>
                </s-box>
              </s-box>

              <s-box paddingBlockStart="base">
                <s-text as="h4" fontWeight="bold">Accessories</s-text>
              </s-box>

              {rule.accessories.map((accessory, accessoryIndex) => (
                <s-box
                  key={`rule-${ruleIndex}-accessory-${accessoryIndex}`}
                  padding="base"
                  background="bg-surface-secondary"
                  borderRadius="loose"
                >
                  <s-box display="flex" flexDirection="column" gap="base">
                    <s-box display="flex" justifyContent="space-between" alignItems="center">
                      <s-text as="p" fontWeight="medium">
                        Accessory {accessoryIndex + 1}
                      </s-text>

                      <button
                        type="button"
                        onClick={() => removeAccessory(ruleIndex, accessoryIndex)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#b42318",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Remove
                      </button>
                    </s-box>

                    <s-box display="flex" flexDirection="row" gap="base">
                      <s-box flex="1">
                        <label>
                          <s-text as="p" fontWeight="medium">Accessory SKU</s-text>
                          <input
                            value={accessory.sku}
                            onChange={(e) =>
                              updateAccessory(ruleIndex, accessoryIndex, { sku: e.target.value })
                            }
                            placeholder="e.g. T54"
                            style={inputStyle}
                          />
                        </label>
                      </s-box>

                      <s-box flex="1">
                        <label>
                          <s-text as="p" fontWeight="medium">Discount amount</s-text>
                          <input
                            value={accessory.discountAmount}
                            onChange={(e) =>
                              updateAccessory(ruleIndex, accessoryIndex, {
                                discountAmount: e.target.value,
                              })
                            }
                            placeholder="e.g. 30"
                            style={inputStyle}
                          />
                        </label>
                      </s-box>

                      <s-box flex="2">
                        <label>
                          <s-text as="p" fontWeight="medium">Label</s-text>
                          <input
                            value={accessory.label}
                            onChange={(e) =>
                              updateAccessory(ruleIndex, accessoryIndex, { label: e.target.value })
                            }
                            placeholder='e.g. Bag less R30'
                            style={inputStyle}
                          />
                        </label>
                      </s-box>
                    </s-box>
                  </s-box>
                </s-box>
              ))}

              <s-box>
                <s-button type="button" variant="secondary" onClick={() => addAccessory(ruleIndex)}>
                  Add accessory
                </s-button>
              </s-box>
            </s-box>
          </s-box>
        ))}

        <s-box display="flex" gap="base">
          <s-button type="button" variant="secondary" onClick={addRule}>
            Add rule
          </s-button>

          <s-button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save rules"}
          </s-button>
        </s-box>
      </s-box>
    </Form>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px",
  borderRadius: "4px",
  border: "1px solid #c4cdd5",
};