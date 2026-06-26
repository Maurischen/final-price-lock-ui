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
import {
  getStandalonePromoDiscount,
  syncStandaloneDiscountsToStandalonePromoDiscount,
} from "../services/standalone-discount-sync.server";

const TITLE = "Standalone Promo Discount";
const LEGACY_TITLE = "Laptop Bundle Discount";
const NAMESPACE = "$app:bundle-discount";
const EXPANDED_NAMESPACE = "app--299787976705--standalone-discount";
const KEY = "function-configuration";

const FIND_LEGACY_QUERY = `#graphql
query FindLegacyStandaloneDiscounts {
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

function emptyStandaloneDiscount() {
  return {
    active: true,
    targetType: "SKU",
    sku: "",
    collectionId: "",
    collectionTitle: "",
    discountMode: "FIXED",
    discountAmount: "",
    message: "Promo discount",
  };
}

function normalizeStandaloneDiscounts(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];

  return items.map((item) => {
    const targetType = item?.targetType === "COLLECTION" ? "COLLECTION" : "SKU";

    return {
      active: Boolean(item?.active ?? true),
      targetType,
      sku: String(item?.sku || ""),
      collectionId: String(item?.collectionId || ""),
      collectionTitle: String(item?.collectionTitle || ""),
      discountMode:
        item?.discountMode === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
      discountAmount:
        item?.discountAmount === 0 || item?.discountAmount
          ? String(item.discountAmount)
          : item?.amount === 0 || item?.amount
            ? String(item.amount)
            : "",
      message: String(item?.message || item?.label || "Promo discount"),
    };
  });
}

function sanitizeStandaloneDiscounts(rawItems) {
  return normalizeStandaloneDiscounts(rawItems)
    .map((item) => ({
      active: Boolean(item.active),
      targetType: item.targetType === "COLLECTION" ? "COLLECTION" : "SKU",
      sku: String(item.sku || "").trim(),
      collectionId: String(item.collectionId || "").trim(),
      collectionTitle: String(item.collectionTitle || "").trim(),
      discountMode: item.discountMode === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
      discountAmount: parseFloat(
        String(item.discountAmount || "").replace(",", "."),
      ),
      message: String(item.message || "").trim() || "Promo discount",
    }))
    .filter((item) => {
      const hasTarget =
        item.targetType === "COLLECTION" ? item.collectionId : item.sku;

      return (
        hasTarget &&
        Number.isFinite(item.discountAmount) &&
        item.discountAmount > 0
      );
    });
}

async function getLegacyStandaloneDiscounts(admin) {
  const res = await admin.graphql(FIND_LEGACY_QUERY);
  const json = await res.json();

  const nodes = json?.data?.discountNodes?.nodes || [];

  for (const node of nodes) {
    const discount = node?.discount;

    if (
      discount?.__typename === "DiscountAutomaticApp" &&
      discount.title === LEGACY_TITLE
    ) {
      const config =
        node.metafield?.jsonValue || node.expandedMetafield?.jsonValue || {};

      return Array.isArray(config?.standaloneDiscounts)
        ? config.standaloneDiscounts
        : [];
    }
  }

  return [];
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    const discount = await getStandalonePromoDiscount(admin);

    let standaloneDiscounts = normalizeStandaloneDiscounts(
      discount.config?.standaloneDiscounts || [],
    );

    let migratedFromLegacy = false;

    if (standaloneDiscounts.length === 0) {
      const legacyStandaloneDiscounts = await getLegacyStandaloneDiscounts(admin);

      if (legacyStandaloneDiscounts.length > 0) {
        standaloneDiscounts = normalizeStandaloneDiscounts(
          legacyStandaloneDiscounts,
        );
        migratedFromLegacy = true;
      }
    }

    return {
      ok: true,
      error: null,
      title: discount.title || TITLE,
      status: discount.status || "",
      standaloneDiscounts,
      migratedFromLegacy,
    };
  } catch (err) {
    console.error("Standalone discount loader error", err);

    return {
      ok: false,
      error: err.message || "Failed to load standalone discount settings.",
      title: TITLE,
      status: "",
      standaloneDiscounts: [],
      migratedFromLegacy: false,
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

    const configJson = String(formData.get("standaloneDiscounts") || "[]");

    let parsed;
    try {
      parsed = JSON.parse(configJson);
    } catch {
      return { ok: false, error: "Invalid standalone discount payload." };
    }

    const cleanStandaloneDiscounts = sanitizeStandaloneDiscounts(parsed);

    await syncStandaloneDiscountsToStandalonePromoDiscount({
      admin,
      standaloneDiscounts: cleanStandaloneDiscounts,
    });

    return { ok: true };
  } catch (err) {
    console.error("Standalone discount action error", err);
    return { ok: false, error: err.message || "Unexpected server error." };
  }
}

function validateStandaloneDiscounts(items) {
  const errors = [];
  const seenTargets = new Set();

  (items || []).forEach((item, index) => {
    const targetType = item.targetType === "COLLECTION" ? "COLLECTION" : "SKU";
    const sku = String(item.sku || "").trim();
    const collectionId = String(item.collectionId || "").trim();
    const discountAmount = parseFloat(
      String(item.discountAmount || "").replace(",", "."),
    );

    if (targetType === "SKU" && !sku) {
      errors.push(`Standalone discount ${index + 1}: SKU is required.`);
    }

    if (targetType === "COLLECTION" && !collectionId) {
      errors.push(`Standalone discount ${index + 1}: Collection ID is required.`);
    }

    const targetKey =
      targetType === "COLLECTION"
        ? `COLLECTION:${collectionId}`
        : `SKU:${sku.toUpperCase()}`;

    if ((targetType === "SKU" && sku) || (targetType === "COLLECTION" && collectionId)) {
      if (seenTargets.has(targetKey)) {
        errors.push(
          `Standalone discount ${index + 1}: Duplicate ${targetType.toLowerCase()} target found.`,
        );
      }

      seenTargets.add(targetKey);
    }

    if (!Number.isFinite(discountAmount) || discountAmount <= 0) {
      errors.push(
        `Standalone discount ${index + 1}: Discount amount must be greater than 0.`,
      );
    }

    if (
      item.discountMode === "PERCENTAGE" &&
      (discountAmount <= 0 || discountAmount > 100)
    ) {
      errors.push(
        `Standalone discount ${index + 1}: Percentage must be between 1 and 100.`,
      );
    }
  });

  return errors;
}

function StandaloneDiscountsEditor({ initialStandaloneDiscounts, isSubmitting }) {
  const [items, setItems] = useState(
    normalizeStandaloneDiscounts(initialStandaloneDiscounts),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedItems, setCollapsedItems] = useState({});

  const collectionCount = new Set(
    items
      .filter((item) => item.targetType === "COLLECTION" && item.collectionId)
      .map((item) => item.collectionId),
  ).size;

  const payloadString = JSON.stringify({
    standaloneDiscounts: items || [],
    collectionIds: [
      ...new Set(
        items
          .filter((item) => item.targetType === "COLLECTION" && item.collectionId)
          .map((item) => item.collectionId),
      ),
    ],
  });

  const payloadBytes = new TextEncoder().encode(payloadString).length;
  const payloadKb = (payloadBytes / 1024).toFixed(2);
  const discountCount = items?.length || 0;

  useEffect(() => {
    setItems(normalizeStandaloneDiscounts(initialStandaloneDiscounts));
  }, [initialStandaloneDiscounts]);

  const validationErrors = useMemo(
    () => validateStandaloneDiscounts(items),
    [items],
  );

  const visibleIndexes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return items.map((_, index) => index);

    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const haystacks = [
          item.targetType,
          item.sku,
          item.collectionId,
          item.collectionTitle,
          item.message,
          item.discountMode,
        ];

        return haystacks.some((value) =>
          String(value || "").toLowerCase().includes(term),
        );
      })
      .map(({ index }) => index);
  }, [items, searchTerm]);

  function addStandaloneDiscount() {
    setItems((prev) => [emptyStandaloneDiscount(), ...prev]);
  }

  function updateStandaloneDiscount(index, updates) {
    setItems((prev) => {
      const next = structuredClone(prev);
      next[index] = {
        ...next[index],
        ...updates,
      };

      if (updates.targetType === "SKU") {
        next[index].collectionId = "";
        next[index].collectionTitle = "";
      }

      if (updates.targetType === "COLLECTION") {
        next[index].sku = "";
      }

      return next;
    });
  }

  function duplicateStandaloneDiscount(index) {
    setItems((prev) => {
      const next = structuredClone(prev);
      const copied = {
        ...next[index],
        sku: next[index]?.targetType === "SKU" ? "" : next[index]?.sku || "",
        collectionId:
          next[index]?.targetType === "COLLECTION"
            ? ""
            : next[index]?.collectionId || "",
        collectionTitle:
          next[index]?.targetType === "COLLECTION"
            ? ""
            : next[index]?.collectionTitle || "",
        message: next[index]?.message || "Promo discount",
      };
      next.splice(index + 1, 0, copied);
      return next;
    });
  }

  function removeStandaloneDiscount(index) {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleStandaloneDiscount(index) {
    setCollapsedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }

  function expandAll() {
    const next = {};
    items.forEach((_, index) => {
      next[index] = false;
    });
    setCollapsedItems(next);
  }

  function collapseAll() {
    const next = {};
    items.forEach((_, index) => {
      next[index] = true;
    });
    setCollapsedItems(next);
  }

  return (
    <Form method="post">
      <input type="hidden" name="_action" value="save" />
      <input
        type="hidden"
        name="standaloneDiscounts"
        value={JSON.stringify(items)}
      />

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
              title={`Standalone config: ${discountCount} discounts / ${payloadKb} KB (${payloadBytes} bytes)`}
            >
              <Text as="p">
                Function-safe target: stay under 10KB. Collections used:{" "}
                {collectionCount}/100.
              </Text>
            </Banner>

            <InlineStack align="space-between" blockAlign="end" gap="300" wrap>
              <Box minWidth="320px">
                <TextField
                  label="Search standalone discounts"
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search by SKU, collection, message or discount type"
                  autoComplete="off"
                />
              </Box>

              <InlineStack gap="200">
                <Button onClick={expandAll}>Expand all</Button>
                <Button onClick={collapseAll}>Collapse all</Button>
                <Button onClick={addStandaloneDiscount}>
                  Add standalone discount
                </Button>
                <Button
                  submit
                  variant="primary"
                  loading={isSubmitting}
                  disabled={validationErrors.length > 0}
                >
                  Save standalone discounts
                </Button>
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

            {items.length === 0 ? (
              <Banner title="No standalone discounts yet">
                <Text as="p">
                  Add a SKU or collection here when you want products to receive
                  their own automatic discount without needing a trigger product.
                </Text>
              </Banner>
            ) : null}

            {visibleIndexes.length === 0 && items.length > 0 ? (
              <Banner title="No matching discounts">
                <Text as="p">No standalone discounts match your search.</Text>
              </Banner>
            ) : null}
          </BlockStack>
        </Card>

        <BlockStack gap="300">
          {visibleIndexes.map((index) => {
            const item = items[index];
            const isCollapsed = Boolean(collapsedItems[index]);
            const targetLabel =
              item.targetType === "COLLECTION"
                ? item.collectionTitle || item.collectionId || `Collection discount ${index + 1}`
                : item.sku || `Standalone discount ${index + 1}`;

            return (
              <Card key={`standalone-${index}`}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h3" variant="headingMd">
                        {targetLabel}
                      </Text>

                      <Badge>{item.targetType || "SKU"}</Badge>

                      <Badge tone={item.active ? "success" : undefined}>
                        {item.active ? "Active" : "Inactive"}
                      </Badge>

                      <Text as="p" variant="bodySm" tone="subdued">
                        {item.discountMode === "PERCENTAGE"
                          ? `${item.discountAmount || 0}%`
                          : `R ${item.discountAmount || 0}`}
                      </Text>
                    </InlineStack>

                    <InlineStack gap="200">
                      <Button onClick={() => toggleStandaloneDiscount(index)}>
                        {isCollapsed ? "Expand" : "Collapse"}
                      </Button>

                      <Button onClick={() => duplicateStandaloneDiscount(index)}>
                        Duplicate
                      </Button>

                      <Button
                        tone="critical"
                        variant="secondary"
                        onClick={() => removeStandaloneDiscount(index)}
                      >
                        Remove
                      </Button>
                    </InlineStack>
                  </InlineStack>

                  {!isCollapsed ? (
                    <BlockStack gap="300">
                      <Divider />

                      <InlineStack gap="300" wrap>
                        <Box minWidth="180px">
                          <Select
                            label="Target type"
                            options={[
                              { label: "SKU", value: "SKU" },
                              { label: "Collection", value: "COLLECTION" },
                            ]}
                            value={item.targetType || "SKU"}
                            onChange={(value) =>
                              updateStandaloneDiscount(index, {
                                targetType: value,
                              })
                            }
                          />
                        </Box>

                        {item.targetType === "COLLECTION" ? (
                          <>
                            <Box minWidth="320px">
                              <TextField
                                label="Collection ID"
                                value={item.collectionId}
                                onChange={(value) =>
                                  updateStandaloneDiscount(index, {
                                    collectionId: value,
                                  })
                                }
                                placeholder="gid://shopify/Collection/123456789"
                                autoComplete="off"
                              />
                            </Box>

                            <Box minWidth="260px">
                              <TextField
                                label="Collection title"
                                value={item.collectionTitle}
                                onChange={(value) =>
                                  updateStandaloneDiscount(index, {
                                    collectionTitle: value,
                                  })
                                }
                                placeholder="Optional display label"
                                autoComplete="off"
                              />
                            </Box>
                          </>
                        ) : (
                          <Box minWidth="220px">
                            <TextField
                              label="SKU"
                              value={item.sku}
                              onChange={(value) =>
                                updateStandaloneDiscount(index, { sku: value })
                              }
                              placeholder="e.g. PROMO-SKU-1"
                              autoComplete="off"
                            />
                          </Box>
                        )}

                        <Box minWidth="180px">
                          <Select
                            label="Discount type"
                            options={[
                              { label: "Fixed amount", value: "FIXED" },
                              { label: "Percentage", value: "PERCENTAGE" },
                            ]}
                            value={item.discountMode || "FIXED"}
                            onChange={(value) =>
                              updateStandaloneDiscount(index, {
                                discountMode: value,
                              })
                            }
                          />
                        </Box>

                        <Box minWidth="180px">
                          <TextField
                            label={
                              item.discountMode === "PERCENTAGE"
                                ? "Discount percentage"
                                : "Discount amount"
                            }
                            type="number"
                            value={item.discountAmount}
                            onChange={(value) =>
                              updateStandaloneDiscount(index, {
                                discountAmount: value,
                              })
                            }
                            placeholder={
                              item.discountMode === "PERCENTAGE"
                                ? "e.g. 10"
                                : "e.g. 101"
                            }
                            autoComplete="off"
                          />
                        </Box>

                        <Box minWidth="260px">
                          <TextField
                            label="Message"
                            value={item.message}
                            onChange={(value) =>
                              updateStandaloneDiscount(index, {
                                message: value,
                              })
                            }
                            placeholder="e.g. Promo discount"
                            autoComplete="off"
                          />
                        </Box>
                      </InlineStack>

                      <Checkbox
                        label="Active"
                        checked={Boolean(item.active)}
                        onChange={(checked) =>
                          updateStandaloneDiscount(index, {
                            active: checked,
                          })
                        }
                      />
                    </BlockStack>
                  ) : null}
                </BlockStack>
              </Card>
            );
          })}
        </BlockStack>

        <InlineStack align="space-between" blockAlign="center">
          <Button onClick={addStandaloneDiscount}>
            Add standalone discount
          </Button>

          <Button
            submit
            variant="primary"
            loading={isSubmitting}
            disabled={validationErrors.length > 0}
          >
            Save standalone discounts
          </Button>
        </InlineStack>
      </BlockStack>
    </Form>
  );
}

export default function StandaloneDiscountsPage() {
  const {
    ok,
    error,
    title,
    status,
    standaloneDiscounts,
    migratedFromLegacy,
  } = useLoaderData();

  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const configJson = JSON.stringify({ standaloneDiscounts }, null, 2);

  return (
    <Page
      title="Standalone Promo Discounts"
      subtitle="Manage standalone product and collection discounts separately from bundle rules."
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {!ok || error ? (
              <Banner tone="critical" title="Could not load standalone discounts">
                <Text as="p">{error}</Text>
              </Banner>
            ) : null}

            {migratedFromLegacy ? (
              <Banner tone="info" title="Standalone discounts loaded from old bundle config">
                <Text as="p">
                  Click Save standalone discounts to copy them into the new
                  Standalone Promo Discount.
                </Text>
              </Banner>
            ) : null}

            {actionData?.error ? (
              <Banner tone="critical" title="Could not save standalone discounts">
                <Text as="p">{actionData.error}</Text>
              </Banner>
            ) : null}

            {actionData?.ok && !actionData.error ? (
              <Banner tone="success" title="Standalone discounts saved">
                <Text as="p">
                  Your standalone discounts have been saved to their own
                  automatic discount.
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

            <StandaloneDiscountsEditor
              initialStandaloneDiscounts={standaloneDiscounts}
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