import { useMemo, useState } from "react";
import { useActionData, useLoaderData, useNavigation, useSubmit, Form } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  Select,
  Checkbox,
  Button,
  InlineStack,
  BlockStack,
  Badge,
  Divider,
  Banner,
  Box,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  listUpsellRules,
  createUpsellRule,
  updateUpsellRule,
  deleteUpsellRule,
  setUpsellRuleActive,
} from "../services/upsell-rules.server";

const TYPE_OPTIONS = [
  { label: "Cross-sell", value: "CROSS_SELL" },
  { label: "Upsell", value: "UPSELL" },
];

const PLACEMENT_OPTIONS = [
  { label: "Product page", value: "PRODUCT_PAGE" },
  { label: "Cart", value: "CART" },
  { label: "Cart drawer", value: "CART_DRAWER" },
  { label: "Post add", value: "POST_ADD" },
];

const TRIGGER_MODE_OPTIONS = [
  { label: "SKU", value: "SKU" },
  { label: "Product ID", value: "PRODUCT" },
  { label: "Variant ID", value: "VARIANT" },
  { label: "Tag", value: "TAG" },
  { label: "Collection ID", value: "COLLECTION" },
  { label: "Cart value", value: "CART_VALUE" },
];

const OFFER_MODE_OPTIONS = [
  { label: "SKU", value: "SKU" },
  { label: "Product ID", value: "PRODUCT" },
  { label: "Variant ID", value: "VARIANT" },
];

const DISCOUNT_MODE_OPTIONS = [
  { label: "None", value: "NONE" },
  { label: "Fixed amount", value: "FIXED" },
  { label: "Percentage", value: "PERCENTAGE" },
];

function createEmptyOffer() {
  return {
    offerMode: "SKU",
    offerSku: "",
    offerProductId: "",
    offerVariantId: "",
    offerTitleOverride: "",
    offerMessage: "",
    discountMode: "NONE",
    discountValue: "",
    discountLabel: "",
    isActive: true,
  };
}

function createInitialFormState() {
  return {
    name: "",
    type: "CROSS_SELL",
    placement: "PRODUCT_PAGE",
    triggerMode: "SKU",
    triggerProductId: "",
    triggerVariantId: "",
    triggerSku: "",
    triggerTag: "",
    triggerCollectionId: "",
    minCartValue: "",
    maxCartValue: "",
    priority: "100",
    isActive: true,
    limitOnePerCart: true,
    hideIfOfferInCart: true,
    hideIfOfferOutOfStock: true,
    startsAt: "",
    endsAt: "",
    offers: [createEmptyOffer()],
  };
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function mapRuleToFormState(rule) {
  return {
    name: rule.name || "",
    type: rule.type || "CROSS_SELL",
    placement: rule.placement || "PRODUCT_PAGE",
    triggerMode: rule.triggerMode || "SKU",
    triggerProductId: rule.triggerProductId || "",
    triggerVariantId: rule.triggerVariantId || "",
    triggerSku: rule.triggerSku || "",
    triggerTag: rule.triggerTag || "",
    triggerCollectionId: rule.triggerCollectionId || "",
    minCartValue: rule.minCartValue != null ? String(rule.minCartValue) : "",
    maxCartValue: rule.maxCartValue != null ? String(rule.maxCartValue) : "",
    priority: rule.priority != null ? String(rule.priority) : "100",
    isActive: Boolean(rule.isActive),
    limitOnePerCart: Boolean(rule.limitOnePerCart),
    hideIfOfferInCart: Boolean(rule.hideIfOfferInCart),
    hideIfOfferOutOfStock: Boolean(rule.hideIfOfferOutOfStock),
    startsAt: toDatetimeLocal(rule.startsAt),
    endsAt: toDatetimeLocal(rule.endsAt),
    offers:
      Array.isArray(rule.offerProducts) && rule.offerProducts.length > 0
        ? rule.offerProducts.map((offer) => ({
            offerMode: offer.offerMode || "SKU",
            offerSku: offer.offerSku || "",
            offerProductId: offer.offerProductId || "",
            offerVariantId: offer.offerVariantId || "",
            offerTitleOverride: offer.offerTitleOverride || "",
            offerMessage: offer.offerMessage || "",
            discountMode: offer.discountMode || "NONE",
            discountValue:
              offer.discountValue != null ? String(offer.discountValue) : "",
            discountLabel: offer.discountLabel || "",
            isActive: offer.isActive !== false,
          }))
        : [createEmptyOffer()],
  };
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const rules = await listUpsellRules(session.shop);

  return Response.json({
    shop: session.shop,
    rules,
  });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "create") {
      const payload = JSON.parse(formData.get("payload") || "{}");
      const result = await createUpsellRule(session.shop, payload);

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "update") {
      const id = formData.get("id");
      const payload = JSON.parse(formData.get("payload") || "{}");
      const result = await updateUpsellRule(id, session.shop, payload);

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "delete") {
      const id = formData.get("id");
      const result = await deleteUpsellRule(id, session.shop);

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "toggle-active") {
      const id = formData.get("id");
      const isActive = formData.get("isActive") === "true";
      const result = await setUpsellRuleActive(id, session.shop, isActive);

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    return Response.json(
      { ok: false, error: "Unknown action." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Upsell action error:", error);
    return Response.json(
      {
        ok: false,
        error: error?.message || "Something went wrong.",
      },
      { status: 500 },
    );
  }
}

function RuleCard({ rule, onEdit }) {
  const offers = Array.isArray(rule.offerProducts) ? rule.offerProducts : [];

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd">
              {rule.name}
            </Text>

            <InlineStack gap="200">
              <Badge>{rule.type}</Badge>
              <Badge tone="info">{rule.placement}</Badge>
              <Badge tone={rule.isActive ? "success" : undefined}>
                {rule.isActive ? "Active" : "Inactive"}
              </Badge>
            </InlineStack>
          </BlockStack>

          <InlineStack gap="200">
            <Button variant="secondary" onClick={() => onEdit(rule)}>
              Edit
            </Button>

            <Form method="post">
              <input type="hidden" name="intent" value="toggle-active" />
              <input type="hidden" name="id" value={rule.id} />
              <input
                type="hidden"
                name="isActive"
                value={rule.isActive ? "false" : "true"}
              />
              <Button submit variant="secondary">
                {rule.isActive ? "Disable" : "Enable"}
              </Button>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={rule.id} />
              <Button submit tone="critical" variant="secondary">
                Delete
              </Button>
            </Form>
          </InlineStack>
        </InlineStack>

        <Divider />

        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            <strong>Trigger:</strong> {rule.triggerMode}
          </Text>

          {rule.triggerProductId ? (
            <Text as="p" variant="bodySm">Product ID: {rule.triggerProductId}</Text>
          ) : null}
          {rule.triggerVariantId ? (
            <Text as="p" variant="bodySm">Variant ID: {rule.triggerVariantId}</Text>
          ) : null}
          {rule.triggerSku ? (
            <Text as="p" variant="bodySm">SKU: {rule.triggerSku}</Text>
          ) : null}
          {rule.triggerTag ? (
            <Text as="p" variant="bodySm">Tag: {rule.triggerTag}</Text>
          ) : null}
          {rule.triggerCollectionId ? (
            <Text as="p" variant="bodySm">
              Collection ID: {rule.triggerCollectionId}
            </Text>
          ) : null}
          {(rule.minCartValue != null || rule.maxCartValue != null) && (
            <Text as="p" variant="bodySm">
              Cart value: {rule.minCartValue ?? "-"} to {rule.maxCartValue ?? "-"}
            </Text>
          )}

          <Text as="p" variant="bodyMd">
            <strong>Offers:</strong> {offers.length}
          </Text>

          <BlockStack gap="100">
            {offers.map((offer, index) => (
              <Box
                key={offer.id || index}
                padding="200"
                background="bg-surface-secondary"
                borderRadius="200"
              >
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm">
                    <strong>Offer {index + 1}:</strong> {offer.offerMode}
                  </Text>
                  {offer.offerProductId ? (
                    <Text as="p" variant="bodySm">Product ID: {offer.offerProductId}</Text>
                  ) : null}
                  {offer.offerVariantId ? (
                    <Text as="p" variant="bodySm">Variant ID: {offer.offerVariantId}</Text>
                  ) : null}
                  {offer.offerSku ? (
                    <Text as="p" variant="bodySm">SKU: {offer.offerSku}</Text>
                  ) : null}
                  {offer.offerMessage ? (
                    <Text as="p" variant="bodySm">Message: {offer.offerMessage}</Text>
                  ) : null}
                  {offer.discountMode !== "NONE" ? (
                    <Text as="p" variant="bodySm">
                      Discount: {offer.discountMode} {offer.discountValue ?? ""}
                      {offer.discountLabel ? ` (${offer.discountLabel})` : ""}
                    </Text>
                  ) : null}
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function OfferTypeHelp() {
  return (
    <Banner title="How offer types work">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          <strong>SKU:</strong> Best when you already manage products by SKU. This is the easiest option for your current workflow and works well for supplier-fed catalogs.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Product ID:</strong> Targets a Shopify product. Use this when the offer should always point to the same product.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Variant ID:</strong> Most precise. Use this when you need the exact variant added to cart with no ambiguity.
        </Text>
      </BlockStack>
    </Banner>
  );
}

function TriggerTypeHelp() {
  return (
    <Banner title="How trigger types work">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          <strong>SKU:</strong> Show the upsell when the viewed product or cart line matches a specific SKU.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Product ID:</strong> Show the upsell when a specific Shopify product is present.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Variant ID:</strong> Show the upsell only for one exact variant.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Tag:</strong> Show the upsell for any product with a matching tag.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Collection ID:</strong> Show the upsell when the current product belongs to a specific collection.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Cart value:</strong> Show the upsell only when the basket total falls within a value range.
        </Text>
      </BlockStack>
    </Banner>
  );
}

export default function UpsellsPage() {
  const { shop, rules } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [formState, setFormState] = useState(createInitialFormState());
  const [editingRuleId, setEditingRuleId] = useState(null);

  const isSubmitting = navigation.state === "submitting";

  const offerCountLabel = useMemo(() => {
    const count = formState.offers.length;
    return count === 1 ? "1 offer product" : `${count} offer products`;
  }, [formState.offers.length]);

  function setField(field, value) {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateOffer(index, field, value) {
    setFormState((prev) => {
      const offers = [...prev.offers];
      offers[index] = { ...offers[index], [field]: value };
      return { ...prev, offers };
    });
  }

  function addOffer() {
    setFormState((prev) => ({
      ...prev,
      offers: [...prev.offers, createEmptyOffer()],
    }));
  }

  function removeOffer(index) {
    setFormState((prev) => {
      const offers = prev.offers.filter((_, i) => i !== index);
      return {
        ...prev,
        offers: offers.length ? offers : [createEmptyOffer()],
      };
    });
  }

  function handleEditRule(rule) {
    setEditingRuleId(rule.id);
    setFormState(mapRuleToFormState(rule));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingRuleId(null);
    setFormState(createInitialFormState());
  }

  function handleSubmit() {
    submit(
      {
        intent: editingRuleId ? "update" : "create",
        id: editingRuleId || "",
        payload: JSON.stringify({
          ...formState,
          offers: formState.offers || [],
        }),
      },
      { method: "post" },
    );
  }

  return (
    <Page
      title="Upsells & Cross-sells"
      subtitle={`Manage upsell rules for ${shop}`}
      primaryAction={{
        content: isSubmitting
          ? editingRuleId
            ? "Updating..."
            : "Saving..."
          : editingRuleId
            ? "Update rule"
            : "Save rule",
        onAction: handleSubmit,
        loading: isSubmitting,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <OfferTypeHelp />
            <TriggerTypeHelp />

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Rule details
                </Text>

                {editingRuleId ? (
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="p" variant="bodyMd">
                      Editing existing rule
                    </Text>
                    <Button variant="plain" onClick={handleCancelEdit}>
                      Cancel edit
                    </Button>
                  </InlineStack>
                ) : null}

                {actionData?.error ? (
                  <Text as="p" tone="critical">
                    {actionData.error}
                  </Text>
                ) : null}

                {actionData?.errors ? (
                  <BlockStack gap="100">
                    {Object.entries(actionData.errors).map(([key, value]) => (
                      <Text key={key} as="p" tone="critical">
                        {value}
                      </Text>
                    ))}
                  </BlockStack>
                ) : null}

                {actionData?.ok ? (
                  <Text as="p" tone="success">
                    Rule {editingRuleId ? "updated" : "saved"} successfully.
                  </Text>
                ) : null}

                <TextField
                  label="Rule name"
                  value={formState.name}
                  onChange={(value) => setField("name", value)}
                  autoComplete="off"
                />

                <InlineStack gap="300" wrap>
                  <div style={{ minWidth: 220 }}>
                    <Select
                      label="Type"
                      options={TYPE_OPTIONS}
                      value={formState.type}
                      onChange={(value) => setField("type", value)}
                    />
                  </div>

                  <div style={{ minWidth: 220 }}>
                    <Select
                      label="Placement"
                      options={PLACEMENT_OPTIONS}
                      value={formState.placement}
                      onChange={(value) => setField("placement", value)}
                    />
                  </div>

                  <div style={{ minWidth: 220 }}>
                    <TextField
                      label="Priority"
                      type="number"
                      value={formState.priority}
                      onChange={(value) => setField("priority", value)}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>

                <InlineStack gap="500" wrap>
                  <Checkbox
                    label="Active"
                    checked={formState.isActive}
                    onChange={(value) => setField("isActive", value)}
                  />
                  <Checkbox
                    label="Limit one per cart"
                    checked={formState.limitOnePerCart}
                    onChange={(value) => setField("limitOnePerCart", value)}
                  />
                  <Checkbox
                    label="Hide if offer already in cart"
                    checked={formState.hideIfOfferInCart}
                    onChange={(value) => setField("hideIfOfferInCart", value)}
                  />
                  <Checkbox
                    label="Hide if offer is out of stock"
                    checked={formState.hideIfOfferOutOfStock}
                    onChange={(value) => setField("hideIfOfferOutOfStock", value)}
                  />
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Trigger
                </Text>

                <InlineStack gap="300" wrap>
                  <div style={{ minWidth: 220 }}>
                    <Select
                      label="Trigger mode"
                      options={TRIGGER_MODE_OPTIONS}
                      value={formState.triggerMode}
                      onChange={(value) => setField("triggerMode", value)}
                    />
                  </div>

                  {formState.triggerMode === "SKU" ? (
                    <TextField
                      label="Trigger SKU"
                      value={formState.triggerSku}
                      onChange={(value) => setField("triggerSku", value)}
                      autoComplete="off"
                    />
                  ) : null}

                  {formState.triggerMode === "PRODUCT" ? (
                    <TextField
                      label="Trigger product ID"
                      value={formState.triggerProductId}
                      onChange={(value) => setField("triggerProductId", value)}
                      autoComplete="off"
                    />
                  ) : null}

                  {formState.triggerMode === "VARIANT" ? (
                    <TextField
                      label="Trigger variant ID"
                      value={formState.triggerVariantId}
                      onChange={(value) => setField("triggerVariantId", value)}
                      autoComplete="off"
                    />
                  ) : null}

                  {formState.triggerMode === "TAG" ? (
                    <TextField
                      label="Trigger tag"
                      value={formState.triggerTag}
                      onChange={(value) => setField("triggerTag", value)}
                      autoComplete="off"
                    />
                  ) : null}

                  {formState.triggerMode === "COLLECTION" ? (
                    <TextField
                      label="Trigger collection ID"
                      value={formState.triggerCollectionId}
                      onChange={(value) => setField("triggerCollectionId", value)}
                      autoComplete="off"
                    />
                  ) : null}
                </InlineStack>

                {formState.triggerMode === "CART_VALUE" ? (
                  <InlineStack gap="300" wrap>
                    <TextField
                      label="Min cart value"
                      type="number"
                      value={formState.minCartValue}
                      onChange={(value) => setField("minCartValue", value)}
                      autoComplete="off"
                    />
                    <TextField
                      label="Max cart value"
                      type="number"
                      value={formState.maxCartValue}
                      onChange={(value) => setField("maxCartValue", value)}
                      autoComplete="off"
                    />
                  </InlineStack>
                ) : null}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      Offer products
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {offerCountLabel}
                    </Text>
                  </BlockStack>

                  <Button onClick={addOffer}>Add offer product</Button>
                </InlineStack>

                {formState.offers.map((offer, index) => (
                  <Box
                    key={index}
                    padding="400"
                    borderWidth="025"
                    borderColor="border"
                    borderRadius="300"
                  >
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm">
                          Offer {index + 1}
                        </Text>
                        <Button
                          tone="critical"
                          variant="plain"
                          onClick={() => removeOffer(index)}
                          disabled={formState.offers.length === 1}
                        >
                          Remove
                        </Button>
                      </InlineStack>

                      <InlineStack gap="300" wrap>
                        <div style={{ minWidth: 220 }}>
                          <Select
                            label="Offer type"
                            options={OFFER_MODE_OPTIONS}
                            value={offer.offerMode}
                            onChange={(value) => updateOffer(index, "offerMode", value)}
                          />
                        </div>

                        {offer.offerMode === "SKU" ? (
                          <TextField
                            label="Offer SKU"
                            value={offer.offerSku}
                            onChange={(value) => updateOffer(index, "offerSku", value)}
                            autoComplete="off"
                          />
                        ) : null}

                        {offer.offerMode === "PRODUCT" ? (
                          <TextField
                            label="Offer product ID"
                            value={offer.offerProductId}
                            onChange={(value) =>
                              updateOffer(index, "offerProductId", value)
                            }
                            autoComplete="off"
                          />
                        ) : null}

                        {offer.offerMode === "VARIANT" ? (
                          <TextField
                            label="Offer variant ID"
                            value={offer.offerVariantId}
                            onChange={(value) =>
                              updateOffer(index, "offerVariantId", value)
                            }
                            autoComplete="off"
                          />
                        ) : null}
                      </InlineStack>

                      <InlineStack gap="300" wrap>
                        <TextField
                          label="Offer title override"
                          value={offer.offerTitleOverride}
                          onChange={(value) =>
                            updateOffer(index, "offerTitleOverride", value)
                          }
                          autoComplete="off"
                        />
                        <TextField
                          label="Offer message"
                          value={offer.offerMessage}
                          onChange={(value) =>
                            updateOffer(index, "offerMessage", value)
                          }
                          autoComplete="off"
                        />
                      </InlineStack>

                      <InlineStack gap="300" wrap>
                        <div style={{ minWidth: 220 }}>
                          <Select
                            label="Discount mode"
                            options={DISCOUNT_MODE_OPTIONS}
                            value={offer.discountMode}
                            onChange={(value) =>
                              updateOffer(index, "discountMode", value)
                            }
                          />
                        </div>

                        <TextField
                          label="Discount value"
                          type="number"
                          value={offer.discountValue}
                          onChange={(value) =>
                            updateOffer(index, "discountValue", value)
                          }
                          autoComplete="off"
                        />

                        <TextField
                          label="Discount label"
                          value={offer.discountLabel}
                          onChange={(value) =>
                            updateOffer(index, "discountLabel", value)
                          }
                          autoComplete="off"
                        />
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ))}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Schedule
                </Text>

                <InlineStack gap="300" wrap>
                  <TextField
                    label="Starts at"
                    type="datetime-local"
                    value={formState.startsAt}
                    onChange={(value) => setField("startsAt", value)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Ends at"
                    type="datetime-local"
                    value={formState.endsAt}
                    onChange={(value) => setField("endsAt", value)}
                    autoComplete="off"
                  />
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Existing rules
            </Text>

            {rules.length === 0 ? (
              <Card>
                <Text as="p" variant="bodyMd">
                  No upsell rules yet.
                </Text>
              </Card>
            ) : (
              rules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} onEdit={handleEditRule} />
              ))
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}