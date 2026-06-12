import React, { useEffect, useMemo, useState } from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Button,
  Banner,
  BlockStack,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

const NAMESPACE = "$app:bundle-discount";
const EXPANDED_NAMESPACE = "app--299787976705--bundle-discount";
const KEY = "function-configuration";

const FIND_QUERY = `#graphql
  query FindDiscountConfig {
    automaticDiscountNodes(first: 50) {
      nodes {
        id
        automaticDiscount {
          ... on DiscountAutomaticApp {
            title
            status
            appDiscountType {
              appKey
              functionId
            }
            metafield(namespace: "${NAMESPACE}", key: "${KEY}") {
              id
              namespace
              key
              value
            }
            expandedMetafield: metafield(namespace: "${EXPANDED_NAMESPACE}", key: "${KEY}") {
              id
              namespace
              key
              value
            }
          }
        }
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

function createRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyRule() {
  return {
    id: createRuleId(),
    name: "",
    triggerSku: "",
    accessorySku: "",
    discountMode: "FIXED",
    discountValue: "",
    discountLabel: "",

    triggerDiscountMode: "NONE",
    triggerDiscountValue: "",
    triggerDiscountLabel: "",
  };
}

function normalizeRule(rule = {}) {
  return {
    id: rule.id || createRuleId(),
    name: rule.name || "",
    triggerSku: rule.triggerSku || "",
    accessorySku: rule.accessorySku || "",
    discountMode: rule.discountMode || "FIXED",
    discountValue:
      rule.discountValue === 0 || rule.discountValue
        ? String(rule.discountValue)
        : "",
    discountLabel: rule.discountLabel || "",

    triggerDiscountMode: rule.triggerDiscountMode || "NONE",
    triggerDiscountValue:
      rule.triggerDiscountValue === 0 || rule.triggerDiscountValue
        ? String(rule.triggerDiscountValue)
        : "",
    triggerDiscountLabel: rule.triggerDiscountLabel || "",
  };
}

function normalizeConfig(rawValue) {
  let parsed = {};

  try {
    parsed = rawValue ? JSON.parse(rawValue) : {};
  } catch {
    parsed = {};
  }

  return {
    rules: Array.isArray(parsed.rules)
      ? parsed.rules.map(normalizeRule)
      : [],
    standaloneDiscounts: Array.isArray(parsed.standaloneDiscounts)
      ? parsed.standaloneDiscounts
      : [],
  };
}

function sanitizeRule(rule) {
  return {
    id: rule.id || createRuleId(),
    name: String(rule.name || "").trim(),
    triggerSku: String(rule.triggerSku || "").trim(),
    accessorySku: String(rule.accessorySku || "").trim(),
    discountMode: rule.discountMode || "FIXED",
    discountValue: Number(rule.discountValue || 0),
    discountLabel: String(rule.discountLabel || "").trim(),

    triggerDiscountMode: rule.triggerDiscountMode || "NONE",
    triggerDiscountValue:
      rule.triggerDiscountMode === "NONE"
        ? 0
        : Number(rule.triggerDiscountValue || 0),
    triggerDiscountLabel: String(rule.triggerDiscountLabel || "").trim(),
  };
}

function sanitizeConfig(config) {
  return {
    rules: (config.rules || [])
      .map(sanitizeRule)
      .filter((rule) => rule.triggerSku && rule.accessorySku),
    standaloneDiscounts: Array.isArray(config.standaloneDiscounts)
      ? config.standaloneDiscounts
      : [],
  };
}

function findDiscountNode(data) {
  return data?.automaticDiscountNodes?.nodes?.find((node) => {
    const discount = node.automaticDiscount;
    return (
      discount?.metafield ||
      discount?.expandedMetafield ||
      discount?.title?.toLowerCase?.().includes("bundle")
    );
  });
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(FIND_QUERY);
  const data = await response.json();

  const node = findDiscountNode(data.data);
  const discount = node?.automaticDiscount;

  const metafield = discount?.expandedMetafield || discount?.metafield;
  const config = normalizeConfig(metafield?.value);

  return Response.json({
    discountId: node?.id || null,
    config,
    rawValue: metafield?.value || "",
  });
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const discountId = formData.get("discountId");
  const configJson = formData.get("config");

  if (!discountId) {
    return Response.json({
      ok: false,
      error: "No discount ID found. Create or activate the app discount first.",
    });
  }

  let config;

  try {
    config = sanitizeConfig(JSON.parse(configJson));
  } catch {
    return Response.json({
      ok: false,
      error: "Invalid config JSON.",
    });
  }

  const value = JSON.stringify(config);

  const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId: discountId,
          namespace: NAMESPACE,
          key: KEY,
          type: "json",
          value,
        },
      ],
    },
  });

  const result = await response.json();
  const errors = result?.data?.metafieldsSet?.userErrors || [];

  if (errors.length) {
    return Response.json({
      ok: false,
      error: errors.map((e) => e.message).join(", "),
      errors,
    });
  }

  return Response.json({
    ok: true,
    savedValue: value,
  });
}

export default function BundleDiscountsPage() {
  const { discountId, config } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const [rules, setRules] = useState(
    config.rules?.length ? config.rules : [emptyRule()],
  );

  const standaloneDiscounts = useMemo(
    () => config.standaloneDiscounts || [],
    [config.standaloneDiscounts],
  );

  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.ok) {
      // Keep UI stable after save
    }
  }, [actionData]);

  function updateRule(index, field, value) {
    setRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, [field]: value } : rule,
      ),
    );
  }

  function addRule() {
    setRules((current) => [...current, emptyRule()]);
  }

  function removeRule(index) {
    setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
  }

  const outgoingConfig = {
    rules,
    standaloneDiscounts,
  };

  return (
    <Page
      title="Bundle Discount Rules"
      primaryAction={{
        content: "Add rule",
        onAction: addRule,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData?.ok && (
              <Banner tone="success">
                Bundle discount configuration saved.
              </Banner>
            )}

            {actionData?.error && (
              <Banner tone="critical">{actionData.error}</Banner>
            )}

            {!discountId && (
              <Banner tone="warning">
                No app discount was found. The rules can display here, but they
                cannot save until the automatic app discount exists.
              </Banner>
            )}

            <Form method="post">
              <input type="hidden" name="discountId" value={discountId || ""} />
              <input
                type="hidden"
                name="config"
                value={JSON.stringify(outgoingConfig)}
              />

              <BlockStack gap="400">
                {rules.map((rule, index) => (
                  <Card key={rule.id || index}>
                    <BlockStack gap="400">
                      <InlineStack align="space-between">
                        <Text as="h2" variant="headingMd">
                          Rule {index + 1}
                        </Text>

                        <Button
                          type="button"
                          tone="critical"
                          variant="plain"
                          onClick={() => removeRule(index)}
                        >
                          Remove
                        </Button>
                      </InlineStack>

                      <TextField
                        label="Rule name"
                        value={rule.name}
                        onChange={(value) => updateRule(index, "name", value)}
                        autoComplete="off"
                      />

                      <InlineStack gap="400" wrap={false}>
                        <TextField
                          label="Trigger SKU"
                          value={rule.triggerSku}
                          onChange={(value) =>
                            updateRule(index, "triggerSku", value)
                          }
                          autoComplete="off"
                        />

                        <TextField
                          label="Accessory SKU"
                          value={rule.accessorySku}
                          onChange={(value) =>
                            updateRule(index, "accessorySku", value)
                          }
                          autoComplete="off"
                        />
                      </InlineStack>

                      <div style={{ borderTop: "1px solid #e1e3e5", margin: "8px 0" }} />

                      <Text as="h3" variant="headingSm">
                        Accessory discount
                      </Text>

                      <InlineStack gap="400" wrap={false}>
                        <Select
                          label="Accessory discount type"
                          value={rule.discountMode}
                          options={[
                            { label: "Fixed amount", value: "FIXED" },
                            { label: "Percentage", value: "PERCENTAGE" },
                          ]}
                          onChange={(value) =>
                            updateRule(index, "discountMode", value)
                          }
                        />

                        <TextField
                          label="Accessory discount value"
                          type="number"
                          value={rule.discountValue}
                          onChange={(value) =>
                            updateRule(index, "discountValue", value)
                          }
                          autoComplete="off"
                        />
                      </InlineStack>

                      <TextField
                        label="Accessory discount label"
                        value={rule.discountLabel}
                        onChange={(value) =>
                          updateRule(index, "discountLabel", value)
                        }
                        autoComplete="off"
                      />

                      <div style={{ borderTop: "1px solid #e1e3e5", margin: "8px 0" }} />

                      <Text as="h3" variant="headingSm">
                        Trigger product discount
                      </Text>

                      <InlineStack gap="400" wrap={false}>
                        <Select
                          label="Trigger discount type"
                          value={rule.triggerDiscountMode}
                          options={[
                            { label: "None", value: "NONE" },
                            { label: "Fixed amount", value: "FIXED" },
                            { label: "Percentage", value: "PERCENTAGE" },
                          ]}
                          onChange={(value) =>
                            updateRule(index, "triggerDiscountMode", value)
                          }
                        />

                        <TextField
                          label="Trigger discount value"
                          type="number"
                          value={rule.triggerDiscountValue}
                          disabled={rule.triggerDiscountMode === "NONE"}
                          onChange={(value) =>
                            updateRule(index, "triggerDiscountValue", value)
                          }
                          autoComplete="off"
                        />
                      </InlineStack>

                      <TextField
                        label="Trigger discount label"
                        value={rule.triggerDiscountLabel}
                        disabled={rule.triggerDiscountMode === "NONE"}
                        onChange={(value) =>
                          updateRule(index, "triggerDiscountLabel", value)
                        }
                        autoComplete="off"
                      />
                    </BlockStack>
                  </Card>
                ))}

                <InlineStack align="end">
                  <Button submit variant="primary" loading={isSaving}>
                    Save bundle discounts
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}