import React, { useMemo, useState, useEffect } from "react";
import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
} from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Checkbox,
  Button,
  InlineStack,
  BlockStack,
  Banner,
  Box,
  Badge,
  Divider,
  Select,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

const TITLE = "Laptop Bundle Discount";
const NAMESPACE = "$app:bundle-discount";
const EXPANDED_NAMESPACE = "app--299787976705--bundle-discount";
const KEY = "function-configuration";

const DISCOUNT_TYPE_TITLE = "Laptop Bundle Discount";

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
      expandedMetafield: metafield(namespace: "${EXPANDED_NAMESPACE}", key: "${KEY}") {
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

const METAFIELDS_SET_MUTATION = `#graphql
mutation SetBundleDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
      namespace
      key
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

    triggerDiscountMode: "NONE",
    triggerDiscountValue: "",
    triggerDiscountLabel: "",

    accessories: [emptyAccessory()],
  };
}

function normalizeConfig(rawConfig) {
  const rules = Array.isArray(rawConfig?.rules) ? rawConfig.rules : [];

  return {
    rules: rules.map((rule) => ({
      name: String(rule?.name || ""),
      active: Boolean(rule?.active ?? true),
      triggerSku: String(rule?.triggerSku || ""),
      ratio: Number(rule?.ratio || 1),
      message: String(rule?.message || "Laptop bundle discount"),

      triggerDiscountMode:
        rule?.triggerDiscountMode === "FIXED" ||
        rule?.triggerDiscountMode === "PERCENTAGE"
          ? rule.triggerDiscountMode
          : "NONE",

      triggerDiscountValue:
        rule?.triggerDiscountValue === 0 || rule?.triggerDiscountValue
          ? String(rule.triggerDiscountValue)
          : "",

      triggerDiscountLabel: String(rule?.triggerDiscountLabel || ""),

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

        triggerDiscountMode:
          rule.triggerDiscountMode === "FIXED" ||
          rule.triggerDiscountMode === "PERCENTAGE"
            ? rule.triggerDiscountMode
            : "NONE",

        triggerDiscountValue:
          rule.triggerDiscountMode === "NONE"
            ? 0
            : Math.max(
                0,
                parseFloat(
                  String(rule.triggerDiscountValue || "").replace(",", "."),
                ) || 0,
              ),

        triggerDiscountLabel: String(rule.triggerDiscountLabel || "").trim(),

        accessories: (rule.accessories || [])
          .map((accessory) => {
            const discountAmount = parseFloat(
              String(accessory.discountAmount || "").replace(",", "."),
            );

            return {
              sku: String(accessory.sku || "").trim(),
              discountAmount: Number.isFinite(discountAmount)
                ? Math.max(0, discountAmount)
                : 0,
              label: String(accessory.label || "").trim(),
            };
          })
          .filter((accessory) => accessory.sku),
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

  if (exactTitleMatch?.functionId) return exactTitleMatch.functionId;

  if (types.length === 1 && types[0]?.functionId) return types[0].functionId;

  const anyFunctionMatch = types.find((item) => item?.functionId);
  if (anyFunctionMatch?.functionId) return anyFunctionMatch.functionId;

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
      const rawConfig =
        node.metafield?.jsonValue || node.expandedMetafield?.jsonValue;

      return {
        id: node.id,
        title: discount.title,
        status: discount.status || "",
        config: normalizeConfig(rawConfig),
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
            namespace: EXPANDED_NAMESPACE,
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
    const payloadString = JSON.stringify(cleanConfig);

    console.log("BUNDLE SAVE TARGET DISCOUNT:", discount.id, discount.title);
    console.log(
      "BUNDLE ONLY CONFIG SIZE:",
      Buffer.byteLength(payloadString, "utf8"),
      "bytes",
    );
    console.log("BUNDLE RULE COUNT:", cleanConfig.rules?.length || 0);

    const metafieldsRes = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: discount.id,
            namespace: EXPANDED_NAMESPACE,
            key: KEY,
            type: "json",
            value: payloadString,
          },
        ],
      },
    });

    const metafieldsJson = await metafieldsRes.json();
    console.log(
      "BUNDLE METAFIELD WRITE RESULT",
      JSON.stringify(metafieldsJson, null, 2),
    );

    const payload = metafieldsJson?.data?.metafieldsSet;
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

function cloneRule(rule) {
  return {
    ...rule,
    name: rule.name ? `${rule.name} Copy` : "Copied Rule",
    accessories: (rule.accessories || []).map((accessory) => ({
      ...accessory,
    })),
  };
}

function validateConfig(config) {
  const errors = [];

  (config.rules || []).forEach((rule, ruleIndex) => {
    if (!String(rule.name || "").trim()) {
      errors.push(`Rule ${ruleIndex + 1}: Rule name is required.`);
    }

    if (!String(rule.triggerSku || "").trim()) {
      errors.push(`Rule ${ruleIndex + 1}: Trigger SKU is required.`);
    }

    const ratio = parseInt(rule.ratio, 10);
    if (!Number.isFinite(ratio) || ratio < 1) {
      errors.push(`Rule ${ruleIndex + 1}: Ratio must be 1 or more.`);
    }

    const accessories = rule.accessories || [];

    if (accessories.length === 0) {
      errors.push(`Rule ${ruleIndex + 1}: At least one accessory is required.`);
    }

    const seenSkus = new Set();

    accessories.forEach((accessory, accessoryIndex) => {
      const sku = String(accessory.sku || "").trim();
      const discountRaw = String(accessory.discountAmount || "").trim();
      const discountAmount = parseFloat(discountRaw.replace(",", "."));

      if (!sku) {
        errors.push(
          `Rule ${ruleIndex + 1}, Accessory ${accessoryIndex + 1}: Accessory SKU is required.`,
        );
      }

      if (sku) {
        const normalizedSku = sku.toUpperCase();
        if (seenSkus.has(normalizedSku)) {
          errors.push(
            `Rule ${ruleIndex + 1}: Duplicate accessory SKU "${sku}" found.`,
          );
        }
        seenSkus.add(normalizedSku);
      }

      if (
        discountRaw &&
        (!Number.isFinite(discountAmount) || discountAmount < 0)
      ) {
        errors.push(
          `Rule ${ruleIndex + 1}, Accessory ${accessoryIndex + 1}: Discount amount must be 0 or more.`,
        );
      }
    });

    if (
      rule.triggerDiscountMode !== "NONE" &&
      rule.triggerDiscountMode !== "FIXED" &&
      rule.triggerDiscountMode !== "PERCENTAGE"
    ) {
      errors.push(`Rule ${ruleIndex + 1}: Invalid trigger discount type.`);
    }

    if (rule.triggerDiscountMode !== "NONE") {
      const triggerDiscount = parseFloat(
        String(rule.triggerDiscountValue || "").replace(",", "."),
      );

      if (!Number.isFinite(triggerDiscount) || triggerDiscount <= 0) {
        errors.push(
          `Rule ${ruleIndex + 1}: Trigger discount value must be greater than 0.`,
        );
      }

      if (
        rule.triggerDiscountMode === "PERCENTAGE" &&
        (triggerDiscount <= 0 || triggerDiscount > 100)
      ) {
        errors.push(
          `Rule ${ruleIndex + 1}: Trigger percentage must be between 1 and 100.`,
        );
      }
    }
  });

  return errors;
}

function BundleRulesEditor({ initialConfig, isSubmitting }) {
  const [config, setConfig] = useState(normalizeConfig(initialConfig));
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedRules, setCollapsedRules] = useState({});
  const payloadString = JSON.stringify({
  rules: config.rules || [],
  });

  const payloadBytes = new TextEncoder().encode(payloadString).length;
  const payloadKb = (payloadBytes / 1024).toFixed(2);
  const ruleCount = config.rules?.length || 0;

  useEffect(() => {
    setConfig(normalizeConfig(initialConfig));
  }, [initialConfig]);

  const validationErrors = useMemo(() => validateConfig(config), [config]);

  const visibleRuleIndexes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return config.rules.map((_, index) => index);

    return config.rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => {
        const haystacks = [
          rule.name,
          rule.triggerSku,
          rule.message,
          rule.triggerDiscountLabel,
          ...(rule.accessories || []).flatMap((accessory) => [
            accessory.sku,
            accessory.label,
          ]),
        ];

        return haystacks.some((value) =>
          String(value || "").toLowerCase().includes(term),
        );
      })
      .map(({ index }) => index);
  }, [config.rules, searchTerm]);

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

  function duplicateRule(ruleIndex) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      const copiedRule = cloneRule(next.rules[ruleIndex]);
      next.rules.splice(ruleIndex + 1, 0, copiedRule);
      return next;
    });
  }

  function removeRule(ruleIndex) {
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, index) => index !== ruleIndex),
    }));
  }

  function toggleRule(ruleIndex) {
    setCollapsedRules((prev) => ({
      ...prev,
      [ruleIndex]: !prev[ruleIndex],
    }));
  }

  function expandAll() {
    const next = {};
    config.rules.forEach((_, index) => {
      next[index] = false;
    });
    setCollapsedRules(next);
  }

  function collapseAll() {
    const next = {};
    config.rules.forEach((_, index) => {
      next[index] = true;
    });
    setCollapsedRules(next);
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
      next.rules[ruleIndex].accessories =
        next.rules[ruleIndex].accessories.filter(
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

      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Banner
              tone={
                payloadBytes > 10000
                  ? "critical"
                  : payloadBytes > 8000
                    ? "warning"
                    : "success"
              }
              title={`Bundle config: ${ruleCount} rules / ${payloadKb} KB (${payloadBytes} bytes)`}
            >
              <Text as="p">
                Function-safe target: stay under 10KB. Shopify JSON metafield limit is 128KB.
              </Text>
            </Banner>
            <InlineStack align="space-between" blockAlign="end" gap="300" wrap>
              <Box minWidth="320px">
                <TextField
                  label="Search bundle rules"
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search by rule name, trigger SKU, accessory SKU or label"
                  autoComplete="off"
                />
              </Box>

              <InlineStack gap="200">
                <Button onClick={expandAll}>Expand all bundles</Button>
                <Button onClick={collapseAll}>Collapse all bundles</Button>
              </InlineStack>
            </InlineStack>

            {validationErrors.length > 0 ? (
              <Banner tone="warning" title="Please fix these before saving">
                <BlockStack gap="100">
                  {validationErrors.map((error, index) => (
                    <Text key={`validation-${index}`} as="p" variant="bodySm">
                      {error}
                    </Text>
                  ))}
                </BlockStack>
              </Banner>
            ) : null}

            {config.rules.length === 0 ? (
              <Banner title="No bundle rules yet">
                <Text as="p">Add your first bundle rule below.</Text>
              </Banner>
            ) : null}

            {visibleRuleIndexes.length === 0 && config.rules.length > 0 ? (
              <Banner title="No matching rules">
                <Text as="p">No rules match your search.</Text>
              </Banner>
            ) : null}
          </BlockStack>
        </Card>

        {visibleRuleIndexes.map((ruleIndex) => {
          const rule = config.rules[ruleIndex];
          const isCollapsed = Boolean(collapsedRules[ruleIndex]);

          return (
            <Card key={`rule-${ruleIndex}`}>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center" gap="300">
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h3" variant="headingMd">
                        {rule.name || `Rule ${ruleIndex + 1}`}
                      </Text>

                      <Badge tone={rule.active ? "success" : undefined}>
                        {rule.active ? "Active" : "Inactive"}
                      </Badge>
                    </InlineStack>

                    <Text as="p" variant="bodySm" tone="subdued">
                      Trigger SKU: {rule.triggerSku || "Not set"} | Accessories:{" "}
                      {(rule.accessories || []).length}
                    </Text>
                  </BlockStack>

                  <InlineStack gap="200">
                    <Button onClick={() => toggleRule(ruleIndex)}>
                      {isCollapsed ? "Expand" : "Collapse"}
                    </Button>

                    <Button onClick={() => duplicateRule(ruleIndex)}>
                      Duplicate
                    </Button>

                    <Button
                      tone="critical"
                      variant="secondary"
                      onClick={() => removeRule(ruleIndex)}
                    >
                      Remove
                    </Button>
                  </InlineStack>
                </InlineStack>

                {!isCollapsed ? (
                  <BlockStack gap="400">
                    <Divider />

                    <InlineStack gap="300" wrap>
                      <Box minWidth="260px">
                        <TextField
                          label="Rule name"
                          value={rule.name}
                          onChange={(value) =>
                            updateRule(ruleIndex, { name: value })
                          }
                          placeholder="e.g. ASUS Vivobook Bundle"
                          autoComplete="off"
                        />
                      </Box>

                      <Box minWidth="260px">
                        <TextField
                          label="Trigger SKU"
                          value={rule.triggerSku}
                          onChange={(value) =>
                            updateRule(ruleIndex, { triggerSku: value })
                          }
                          placeholder="e.g. M1605NAQ-716512S0W"
                          autoComplete="off"
                        />
                      </Box>

                      <Box minWidth="140px">
                        <TextField
                          label="Ratio"
                          type="number"
                          min={1}
                          value={String(rule.ratio)}
                          onChange={(value) =>
                            updateRule(ruleIndex, { ratio: value })
                          }
                          autoComplete="off"
                        />
                      </Box>
                    </InlineStack>

                    <TextField
                      label="Discount message"
                      value={rule.message}
                      onChange={(value) =>
                        updateRule(ruleIndex, { message: value })
                      }
                      placeholder="e.g. Laptop accessory bundle discount"
                      autoComplete="off"
                    />

                    <Divider />

                    <Text as="h4" variant="headingSm">
                      Trigger product discount
                    </Text>

                    <InlineStack gap="300" wrap>
                      <Box minWidth="220px">
                        <Select
                          label="Trigger discount type"
                          options={[
                            { label: "None", value: "NONE" },
                            { label: "Fixed amount", value: "FIXED" },
                            { label: "Percentage", value: "PERCENTAGE" },
                          ]}
                          value={rule.triggerDiscountMode || "NONE"}
                          onChange={(value) =>
                            updateRule(ruleIndex, {
                              triggerDiscountMode: value,
                            })
                          }
                        />
                      </Box>

                      <Box minWidth="180px">
                        <TextField
                          label={
                            rule.triggerDiscountMode === "PERCENTAGE"
                              ? "Trigger discount percentage"
                              : "Trigger discount amount"
                          }
                          type="number"
                          value={rule.triggerDiscountValue || ""}
                          disabled={
                            (rule.triggerDiscountMode || "NONE") === "NONE"
                          }
                          onChange={(value) =>
                            updateRule(ruleIndex, {
                              triggerDiscountValue: value,
                            })
                          }
                          placeholder={
                            rule.triggerDiscountMode === "PERCENTAGE"
                              ? "e.g. 10"
                              : "e.g. 540"
                          }
                          autoComplete="off"
                        />
                      </Box>

                      <Box minWidth="260px">
                        <TextField
                          label="Trigger discount label"
                          value={rule.triggerDiscountLabel || ""}
                          disabled={
                            (rule.triggerDiscountMode || "NONE") === "NONE"
                          }
                          onChange={(value) =>
                            updateRule(ruleIndex, {
                              triggerDiscountLabel: value,
                            })
                          }
                          placeholder="e.g. Vuvuzela Bundle 1 Discount"
                          autoComplete="off"
                        />
                      </Box>
                    </InlineStack>

                    <Checkbox
                      label="Active"
                      checked={Boolean(rule.active)}
                      onChange={(checked) =>
                        updateRule(ruleIndex, { active: checked })
                      }
                    />

                    <Divider />

                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h4" variant="headingSm">
                        Accessories
                      </Text>

                      <Button onClick={() => addAccessory(ruleIndex)}>
                        Add accessory
                      </Button>
                    </InlineStack>

                    <BlockStack gap="300">
                      {(rule.accessories || []).map(
                        (accessory, accessoryIndex) => (
                          <Box
                            key={`rule-${ruleIndex}-accessory-${accessoryIndex}`}
                            padding="300"
                            background="bg-surface-secondary"
                            borderRadius="300"
                          >
                            <BlockStack gap="300">
                              <InlineStack
                                align="space-between"
                                blockAlign="center"
                              >
                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                  Accessory {accessoryIndex + 1}
                                </Text>

                                <Button
                                  tone="critical"
                                  variant="plain"
                                  onClick={() =>
                                    removeAccessory(ruleIndex, accessoryIndex)
                                  }
                                >
                                  Remove
                                </Button>
                              </InlineStack>

                              <InlineStack gap="300" wrap>
                                <Box minWidth="220px">
                                  <TextField
                                    label="Accessory SKU"
                                    value={accessory.sku}
                                    onChange={(value) =>
                                      updateAccessory(
                                        ruleIndex,
                                        accessoryIndex,
                                        { sku: value },
                                      )
                                    }
                                    placeholder="e.g. T54"
                                    autoComplete="off"
                                  />
                                </Box>

                                <Box minWidth="180px">
                                  <TextField
                                    label="Discount amount"
                                    value={accessory.discountAmount}
                                    onChange={(value) =>
                                      updateAccessory(
                                        ruleIndex,
                                        accessoryIndex,
                                        { discountAmount: value },
                                      )
                                    }
                                    placeholder="e.g. 30"
                                    autoComplete="off"
                                  />
                                </Box>

                                <Box minWidth="260px">
                                  <TextField
                                    label="Label"
                                    value={accessory.label}
                                    onChange={(value) =>
                                      updateAccessory(
                                        ruleIndex,
                                        accessoryIndex,
                                        { label: value },
                                      )
                                    }
                                    placeholder="e.g. Bag less R30"
                                    autoComplete="off"
                                  />
                                </Box>
                              </InlineStack>
                            </BlockStack>
                          </Box>
                        ),
                      )}
                    </BlockStack>
                  </BlockStack>
                ) : null}
              </BlockStack>
            </Card>
          );
        })}

        <InlineStack align="space-between" blockAlign="center">
          <Button onClick={addRule}>Add bundle rule</Button>

          <Button
            submit
            variant="primary"
            loading={isSubmitting}
            disabled={validationErrors.length > 0}
          >
            Save bundle rules
          </Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}

export default function BundleDiscountsPage() {
  const { ok, error, title, status, config } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const configJson = JSON.stringify(config, null, 2);

  return (
    <Page
      title="Bundle Discount Rules"
      subtitle="Manage bundle-only automatic discount configuration."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {!ok || error ? (
              <Banner tone="critical" title="Could not load discount settings">
                <Text as="p">{error}</Text>
              </Banner>
            ) : null}

            {actionData?.error ? (
              <Banner tone="critical" title="Could not save bundle rules">
                <Text as="p">{actionData.error}</Text>
              </Banner>
            ) : null}

            {actionData?.ok && !actionData.error ? (
              <Banner tone="success" title="Bundle discount rules saved">
                <Text as="p">
                  Your bundle-only automatic discount configuration has been
                  updated.
                </Text>
              </Banner>
            ) : null}

            <Card>
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Automatic discount
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {title}
                  </Text>
                </BlockStack>

                {status ? (
                  <Badge tone={status === "ACTIVE" ? "success" : undefined}>
                    {status}
                  </Badge>
                ) : null}
              </InlineStack>
            </Card>

            <BundleRulesEditor
              initialConfig={config}
              isSubmitting={isSubmitting}
            />

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Current JSON config
                </Text>
                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="300"
                >
                  <pre
                    style={{
                      margin: 0,
                      overflowX: "auto",
                      fontSize: "12px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {configJson}
                  </pre>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}