import { useEffect, useMemo, useState } from "react";
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
  duplicateUpsellRule,
} from "../services/upsell-rules.server";
import {
  listUpsellTriggers,
  replaceUpsellTriggers,
} from "../services/upsell-triggers.server";
import { syncUpsellRulesToBundleDiscount } from "../services/upsell-discount-sync.server";

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
    selectedLabel: "",
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
    extraTriggerSkus: "",
    triggerTag: "",
    triggerCollectionId: "",
    badgeText: "BUNDLE & SAVE",
    headlineText: "Bundle these essentials and save instantly",
    triggerDiscountMode: "NONE",
    triggerDiscountValue: "",
    triggerDiscountLabel: "",
    minCartValue: "",
    maxCartValue: "",
    priority: "100",
    isActive: true,
    limitOnePerCart: true,
    hideIfOfferInCart: true,
    hideIfOfferOutOfStock: true,
    startsAt: "",
    endsAt: "",
    triggerSelectedLabel: "",
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

function getExtraTriggerSkusFromRule(rule) {
  if (!Array.isArray(rule?.triggers)) return "";

  return rule.triggers
    .filter((trigger) => trigger?.triggerType === "SKU" && trigger?.sku)
    .map((trigger) => trigger.sku)
    .join(", ");
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
    extraTriggerSkus: getExtraTriggerSkusFromRule(rule),
    triggerTag: rule.triggerTag || "",
    triggerCollectionId: rule.triggerCollectionId || "",
    badgeText: rule.badgeText || "BUNDLE & SAVE",
    headlineText:
      rule.headlineText || "Bundle these essentials and save instantly",
    triggerDiscountMode: rule.triggerDiscountMode || "NONE",
    triggerDiscountValue:
      rule.triggerDiscountValue != null ? String(rule.triggerDiscountValue) : "",
    triggerDiscountLabel: rule.triggerDiscountLabel || "",
    minCartValue: rule.minCartValue != null ? String(rule.minCartValue) : "",
    maxCartValue: rule.maxCartValue != null ? String(rule.maxCartValue) : "",
    priority: rule.priority != null ? String(rule.priority) : "100",
    isActive: Boolean(rule.isActive),
    limitOnePerCart: Boolean(rule.limitOnePerCart),
    hideIfOfferInCart: Boolean(rule.hideIfOfferInCart),
    hideIfOfferOutOfStock: Boolean(rule.hideIfOfferOutOfStock),
    startsAt: toDatetimeLocal(rule.startsAt),
    endsAt: toDatetimeLocal(rule.endsAt),
    triggerSelectedLabel:
      rule.triggerMode === "PRODUCT"
        ? rule.triggerProductId || ""
        : rule.triggerMode === "VARIANT"
          ? rule.triggerVariantId || ""
          : rule.triggerMode === "COLLECTION"
            ? rule.triggerCollectionId || ""
            : rule.triggerSku || rule.triggerTag || "",
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
            selectedLabel:
              offer.offerMode === "PRODUCT"
                ? offer.offerProductId || ""
                : offer.offerMode === "VARIANT"
                  ? offer.offerVariantId || ""
                  : offer.offerSku || "",
          }))
        : [createEmptyOffer()],
  };
}

function SearchResults({ results, onSelect }) {
  if (!results.length) return null;

  return (
    <Box
      padding="200"
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      background="bg-surface-secondary"
    >
      <BlockStack gap="100">
        {results.map((result) => (
          <Button
            key={result.id}
            variant="plain"
            textAlign="left"
            onClick={() => onSelect(result)}
          >
            <BlockStack gap="050">
              <Text as="span" variant="bodyMd">
                {result.label}
              </Text>
              {result.secondary ? (
                <Text as="span" variant="bodySm" tone="subdued">
                  {result.secondary}
                </Text>
              ) : null}
            </BlockStack>
          </Button>
        ))}
      </BlockStack>
    </Box>
  );
}

function RuleCard({ rule, onEdit, isCollapsed, onToggleCollapse }) {
  const offers = Array.isArray(rule.offerProducts) ? rule.offerProducts : [];
  const extraTriggerSkus = getExtraTriggerSkusFromRule(rule);

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
              <Badge>{offers.length} offers</Badge>
              {extraTriggerSkus ? <Badge tone="attention">Extra SKUs</Badge> : null}
            </InlineStack>
          </BlockStack>

          <InlineStack gap="200">
            <Button variant="secondary" onClick={() => onToggleCollapse(rule.id)}>
              {isCollapsed ? "Expand" : "Collapse"}
            </Button>

            <Button variant="secondary" onClick={() => onEdit(rule)}>
              Edit
            </Button>

            <Form method="post">
              <input type="hidden" name="intent" value="duplicate" />
              <input type="hidden" name="id" value={rule.id} />
              <Button submit variant="secondary">
                Duplicate
              </Button>
            </Form>

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

        {!isCollapsed ? (
          <>
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
                <Text as="p" variant="bodySm">Primary SKU: {rule.triggerSku}</Text>
              ) : null}
              {extraTriggerSkus ? (
                <Text as="p" variant="bodySm">Extra trigger SKUs: {extraTriggerSkus}</Text>
              ) : null}
              {rule.triggerTag ? (
                <Text as="p" variant="bodySm">Tag: {rule.triggerTag}</Text>
              ) : null}
              {rule.triggerCollectionId ? (
                <Text as="p" variant="bodySm">
                  Collection ID: {rule.triggerCollectionId}
                </Text>
              ) : null}
              {rule.triggerDiscountMode && rule.triggerDiscountMode !== "NONE" ? (
                <Text as="p" variant="bodySm">
                  Trigger discount: {rule.triggerDiscountMode} {rule.triggerDiscountValue ?? ""}
                  {rule.triggerDiscountLabel ? ` (${rule.triggerDiscountLabel})` : ""}
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
          </>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function OfferTypeHelp() {
  return (
    <Banner title="How offer types work">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          <strong>SKU:</strong> Search variants by SKU and store the matched SKU and IDs.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Product ID:</strong> Search and select a product.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Variant ID:</strong> Search and select an exact variant.
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
          <strong>SKU:</strong> Show the upsell when the viewed product matches a searched SKU.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Extra trigger SKUs:</strong> Add multiple SKUs to trigger the same bundle rule without creating duplicate rules.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Product ID:</strong> Show the upsell for one selected product.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Variant ID:</strong> Show the upsell for one selected variant.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Tag:</strong> Show the upsell for any product with a matching tag.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Collection ID:</strong> Search and select a collection. The rule will apply to products inside that collection.
        </Text>
        <Text as="p" variant="bodyMd">
          <strong>Cart value:</strong> Show the upsell only when the basket total falls within a value range.
        </Text>
      </BlockStack>
    </Banner>
  );
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const rules = await listUpsellRules(session.shop);

  const rulesWithTriggers = await Promise.all(
    rules.map(async (rule) => ({
      ...rule,
      triggers: await listUpsellTriggers(rule.id),
    })),
  );

  return Response.json({
    shop: session.shop,
    rules: rulesWithTriggers,
  });
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  async function syncIfOk(result) {
    if (result?.ok) {
      await syncUpsellRulesToBundleDiscount({
        shop: session.shop,
        admin,
      });
    }

    return result;
  }

  async function saveExtraTriggerSkus(ruleId, payload) {
    if (!ruleId) return;

    const extraTriggerSkus = String(payload.extraTriggerSkus || "")
      .split(",")
      .map((sku) => sku.trim())
      .filter(Boolean);

    await replaceUpsellTriggers(
      ruleId,
      extraTriggerSkus.map((sku, index) => ({
        triggerType: "SKU",
        sku,
        title: sku,
        position: index,
      })),
    );
  }

  try {
    if (intent === "create") {
      const payload = JSON.parse(formData.get("payload") || "{}");
      const result = await createUpsellRule(session.shop, payload);

      if (result?.ok && result.rule?.id) {
        await saveExtraTriggerSkus(result.rule.id, payload);
        await syncUpsellRulesToBundleDiscount({
          shop: session.shop,
          admin,
        });
      }

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "update") {
      const id = formData.get("id");
      const payload = JSON.parse(formData.get("payload") || "{}");
      const result = await updateUpsellRule(id, session.shop, payload);

      if (result?.ok) {
        await saveExtraTriggerSkus(id, payload);
        await syncUpsellRulesToBundleDiscount({
          shop: session.shop,
          admin,
        });
      }

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "duplicate") {
      const id = formData.get("id");
      const result = await syncIfOk(
        await duplicateUpsellRule(id, session.shop),
      );

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "delete") {
      const id = formData.get("id");
      const result = await syncIfOk(
        await deleteUpsellRule(id, session.shop),
      );

      return Response.json(result, {
        status: result.ok ? 200 : 400,
      });
    }

    if (intent === "toggle-active") {
      const id = formData.get("id");
      const isActive = formData.get("isActive") === "true";
      const result = await syncIfOk(
        await setUpsellRuleActive(id, session.shop, isActive),
      );

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

export default function UpsellsPage() {
  const { shop, rules } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [formState, setFormState] = useState(createInitialFormState());
  const [editingRuleId, setEditingRuleId] = useState(null);

  const [triggerSearch, setTriggerSearch] = useState("");
  const [triggerResults, setTriggerResults] = useState([]);

  const [offerSearch, setOfferSearch] = useState({});
  const [offerResults, setOfferResults] = useState({});

  const [ruleSearch, setRuleSearch] = useState("");
  const [collapsedRuleIds, setCollapsedRuleIds] = useState(new Set());

  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.ok) {
      setEditingRuleId(null);
      setFormState(createInitialFormState());
      setTriggerSearch("");
      setTriggerResults([]);
      setOfferSearch({});
      setOfferResults({});
    }
  }, [actionData]);

  const offerCountLabel = useMemo(() => {
    const count = formState.offers.length;
    return count === 1 ? "1 offer product" : `${count} offer products`;
  }, [formState.offers.length]);

  const filteredRules = useMemo(() => {
    const query = ruleSearch.trim().toLowerCase();

    if (!query) return rules;

    return rules.filter((rule) => {
      const offerText = (rule.offerProducts || [])
        .map((offer) =>
          [
            offer.offerSku,
            offer.offerProductId,
            offer.offerVariantId,
            offer.offerMessage,
            offer.discountLabel,
          ]
            .filter(Boolean)
            .join(" "),
        )
        .join(" ");

      const extraTriggerText = (rule.triggers || [])
        .map((trigger) => [trigger.sku, trigger.title, trigger.handle].filter(Boolean).join(" "))
        .join(" ");

      const haystack = [
        rule.name,
        rule.type,
        rule.placement,
        rule.triggerMode,
        rule.triggerSku,
        rule.triggerTag,
        rule.triggerProductId,
        rule.triggerVariantId,
        rule.triggerCollectionId,
        extraTriggerText,
        offerText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [rules, ruleSearch]);

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
    setTriggerSearch("");
    setTriggerResults([]);
    setOfferSearch({});
    setOfferResults({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingRuleId(null);
    setFormState(createInitialFormState());
    setTriggerSearch("");
    setTriggerResults([]);
    setOfferSearch({});
    setOfferResults({});
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

  function toggleRuleCollapsed(ruleId) {
    setCollapsedRuleIds((prev) => {
      const next = new Set(prev);

      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }

      return next;
    });
  }

  function collapseAllRules() {
    setCollapsedRuleIds(new Set(rules.map((rule) => rule.id)));
  }

  function expandAllRules() {
    setCollapsedRuleIds(new Set());
  }

  async function runTriggerSearch(query, mode) {
    if (!query || query.trim().length < 2) {
      setTriggerResults([]);
      return;
    }

    let type = "variant";
    if (mode === "PRODUCT") type = "product";
    if (mode === "VARIANT") type = "variant";
    if (mode === "SKU") type = "variant";
    if (mode === "COLLECTION") type = "collection";

    const response = await fetch(
      `/app/upsell-search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`,
    );
    const data = await response.json();
    setTriggerResults(data?.results || []);
  }

  async function runOfferSearch(index, query, mode) {
    if (!query || query.trim().length < 2) {
      setOfferResults((prev) => ({ ...prev, [index]: [] }));
      return;
    }

    let type = "variant";
    if (mode === "PRODUCT") type = "product";
    if (mode === "VARIANT") type = "variant";
    if (mode === "SKU") type = "variant";

    const response = await fetch(
      `/app/upsell-search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`,
    );
    const data = await response.json();

    setOfferResults((prev) => ({
      ...prev,
      [index]: data?.results || [],
    }));
  }

  useEffect(() => {
    if (formState.triggerMode === "TAG" || formState.triggerMode === "CART_VALUE") {
      setTriggerResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      runTriggerSearch(triggerSearch, formState.triggerMode);
    }, 250);

    return () => clearTimeout(timeout);
  }, [triggerSearch, formState.triggerMode]);

  useEffect(() => {
    const timers = formState.offers.map((offer, index) => {
      const query = offerSearch[index] || "";

      return setTimeout(() => {
        runOfferSearch(index, query, offer.offerMode);
      }, 250);
    });

    return () => timers.forEach(clearTimeout);
  }, [offerSearch, formState.offers]);

  function selectTriggerResult(result) {
    if (formState.triggerMode === "PRODUCT") {
      setFormState((prev) => ({
        ...prev,
        triggerProductId: result.productId || "",
        triggerVariantId: "",
        triggerSku: "",
        triggerTag: "",
        triggerCollectionId: "",
        triggerSelectedLabel: result.label,
      }));
    } else if (formState.triggerMode === "VARIANT") {
      setFormState((prev) => ({
        ...prev,
        triggerProductId: result.productId || "",
        triggerVariantId: result.variantId || "",
        triggerSku: result.sku || "",
        triggerTag: "",
        triggerCollectionId: "",
        triggerSelectedLabel: result.label,
      }));
    } else if (formState.triggerMode === "SKU") {
      setFormState((prev) => ({
        ...prev,
        triggerProductId: result.productId || "",
        triggerVariantId: result.variantId || "",
        triggerSku: result.sku || "",
        triggerTag: "",
        triggerCollectionId: "",
        triggerSelectedLabel: result.label,
      }));
    } else if (formState.triggerMode === "COLLECTION") {
      setFormState((prev) => ({
        ...prev,
        triggerProductId: "",
        triggerVariantId: "",
        triggerSku: "",
        triggerTag: "",
        triggerCollectionId: result.collectionId || "",
        triggerSelectedLabel: result.label,
      }));
    }

    setTriggerResults([]);
    setTriggerSearch("");
  }

  function selectOfferResult(index, result) {
    const offerMode = formState.offers[index]?.offerMode;

    if (offerMode === "PRODUCT") {
      updateOffer(index, "offerProductId", result.productId || "");
      updateOffer(index, "offerVariantId", "");
      updateOffer(index, "offerSku", "");
      updateOffer(index, "selectedLabel", result.label);
    } else {
      updateOffer(index, "offerProductId", result.productId || "");
      updateOffer(index, "offerVariantId", result.variantId || "");
      updateOffer(index, "offerSku", result.sku || "");
      updateOffer(index, "selectedLabel", result.label);
    }

    setOfferResults((prev) => ({ ...prev, [index]: [] }));
    setOfferSearch((prev) => ({ ...prev, [index]: "" }));
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
                    Rule saved successfully.
                  </Text>
                ) : null}

                <TextField
                  label="Rule name"
                  value={formState.name}
                  onChange={(value) => setField("name", value)}
                  autoComplete="off"
                />

                <TextField
                  label="Bundle badge text"
                  value={formState.badgeText || ""}
                  onChange={(value) => setField("badgeText", value)}
                  autoComplete="off"
                  placeholder="BUNDLE & SAVE"
                />

                <TextField
                  label="Bundle headline text"
                  value={formState.headlineText || ""}
                  onChange={(value) => setField("headlineText", value)}
                  autoComplete="off"
                  placeholder="Bundle these essentials and save instantly"
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

                <div style={{ maxWidth: 260 }}>
                  <Select
                    label="Trigger mode"
                    options={TRIGGER_MODE_OPTIONS}
                    value={formState.triggerMode}
                    onChange={(value) => setField("triggerMode", value)}
                  />
                </div>

                {formState.triggerMode === "TAG" ? (
                  <TextField
                    label="Trigger tag"
                    value={formState.triggerTag}
                    onChange={(value) => setField("triggerTag", value)}
                    autoComplete="off"
                  />
                ) : null}

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

                {!["TAG", "CART_VALUE"].includes(formState.triggerMode) ? (
                  <BlockStack gap="200">
                    <TextField
                      label={
                        formState.triggerMode === "COLLECTION"
                          ? "Search collection"
                          : formState.triggerMode === "PRODUCT"
                            ? "Search product"
                            : "Search SKU / variant"
                      }
                      value={triggerSearch}
                      onChange={setTriggerSearch}
                      autoComplete="off"
                    />

                    <SearchResults
                      results={triggerResults}
                      onSelect={selectTriggerResult}
                    />

                    {formState.triggerSelectedLabel ? (
                      <Banner title="Selected trigger">
                        <Text as="p" variant="bodyMd">
                          {formState.triggerSelectedLabel}
                        </Text>
                      </Banner>
                    ) : null}

                    {formState.triggerMode === "SKU" ? (
                      <TextField
                        label="Extra trigger SKUs"
                        helpText="Optional. Add multiple SKUs separated by commas. These products will trigger the same bundle rule."
                        value={formState.extraTriggerSkus || ""}
                        onChange={(value) => setField("extraTriggerSkus", value)}
                        autoComplete="off"
                        placeholder="CPU-001, CPU-002, CPU-003"
                      />
                    ) : null}
                  </BlockStack>
                ) : null}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Trigger product discount
                </Text>

                <Text as="p" variant="bodySm" tone="subdued">
                  Optional discount applied to the main trigger product when the bundle is purchased.
                </Text>

                <InlineStack gap="300" wrap>
                  <div style={{ minWidth: 220 }}>
                    <Select
                      label="Trigger discount mode"
                      options={DISCOUNT_MODE_OPTIONS}
                      value={formState.triggerDiscountMode}
                      onChange={(value) => setField("triggerDiscountMode", value)}
                    />
                  </div>

                  <TextField
                    label="Trigger discount value"
                    type="number"
                    value={formState.triggerDiscountValue}
                    onChange={(value) => setField("triggerDiscountValue", value)}
                    autoComplete="off"
                  />

                  <TextField
                    label="Trigger discount label"
                    value={formState.triggerDiscountLabel}
                    onChange={(value) => setField("triggerDiscountLabel", value)}
                    autoComplete="off"
                  />
                </InlineStack>
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

                      <div style={{ maxWidth: 260 }}>
                        <Select
                          label="Offer type"
                          options={OFFER_MODE_OPTIONS}
                          value={offer.offerMode}
                          onChange={(value) => updateOffer(index, "offerMode", value)}
                        />
                      </div>

                      <TextField
                        label={
                          offer.offerMode === "PRODUCT"
                            ? "Search product"
                            : "Search SKU / variant"
                        }
                        value={offerSearch[index] || ""}
                        onChange={(value) =>
                          setOfferSearch((prev) => ({ ...prev, [index]: value }))
                        }
                        autoComplete="off"
                      />

                      <SearchResults
                        results={offerResults[index] || []}
                        onSelect={(result) => selectOfferResult(index, result)}
                      />

                      {offer.selectedLabel ? (
                        <Banner title={`Selected offer ${index + 1}`}>
                          <Text as="p" variant="bodyMd">
                            {offer.selectedLabel}
                          </Text>
                        </Banner>
                      ) : null}

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
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Existing rules
              </Text>

              <InlineStack gap="200">
                <Button onClick={collapseAllRules}>Collapse all</Button>
                <Button onClick={expandAllRules}>Expand all</Button>
              </InlineStack>
            </InlineStack>

            <TextField
              label="Search bundles"
              labelHidden
              placeholder="Search by rule name, trigger SKU, extra trigger SKU, offer SKU, tag, collection..."
              value={ruleSearch}
              onChange={setRuleSearch}
              autoComplete="off"
            />

            {filteredRules.length === 0 ? (
              <Card>
                <Text as="p" variant="bodyMd">
                  No matching upsell rules found.
                </Text>
              </Card>
            ) : (
              filteredRules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onEdit={handleEditRule}
                  isCollapsed={collapsedRuleIds.has(rule.id)}
                  onToggleCollapse={toggleRuleCollapsed}
                />
              ))
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}