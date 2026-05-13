import db from "../db.server";

const NAMESPACE = "custom";

const FIND_VARIANT_BY_SKU_QUERY = `#graphql
  query FindVariantBySku($query: String!) {
    productVariants(first: 1, query: $query) {
      nodes {
        id
        sku
        product {
          id
          title
        }
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors {
        field
        message
      }
    }
  }
`;

export async function findVariantBySku(admin, sku) {
  const cleanSku = String(sku || "").trim();

  if (!cleanSku) {
    throw new Error("SKU is required");
  }

  const response = await admin.graphql(FIND_VARIANT_BY_SKU_QUERY, {
    variables: {
      query: `sku:${cleanSku}`,
    },
  });

  const json = await response.json();
  const variant = json?.data?.productVariants?.nodes?.[0];

  if (!variant) {
    throw new Error(`No Shopify variant found for SKU: ${cleanSku}`);
  }

  return variant;
}

export function getPromoDisplayValues(rule) {
  const enabled = Boolean(rule?.isEnabled);

  return {
    promo_display_enabled: enabled ? "true" : "false",
    promo_display_type: rule?.discountType || "",
    promo_discount_amount: rule?.discountAmount ? String(rule.discountAmount) : "0",
    promo_discount_percent: rule?.discountPercent ? String(rule.discountPercent) : "0",
    promo_label: rule?.label || "",
    promo_source: rule?.source || "",
    promo_priority: rule?.priority ? String(rule.priority) : "100",
  };
}

export async function syncPromoDisplayMetafields(admin, rule) {
  if (!rule?.variantId) {
    throw new Error("Cannot sync promo display metafields without variantId");
  }

  const values = getPromoDisplayValues(rule);

  const metafields = [
    {
      ownerId: rule.variantId,
      namespace: NAMESPACE,
      key: "promo_display_enabled",
      type: "boolean",
      value: values.promo_display_enabled,
    },
    {
      ownerId: rule.variantId,
      namespace: NAMESPACE,
      key: "promo_display_type",
      type: "single_line_text_field",
      value: values.promo_display_type,
    },
    {
      ownerId: rule.variantId,
      namespace: NAMESPACE,
      key: "promo_discount_amount",
      type: "number_integer",
      value: values.promo_discount_amount,
    },
    {
      ownerId: rule.variantId,
      namespace: NAMESPACE,
      key: "promo_discount_percent",
      type: "number_decimal",
      value: values.promo_discount_percent,
    },
    {
      ownerId: rule.variantId,
      namespace: NAMESPACE,
      key: "promo_label",
      type: "single_line_text_field",
      value: values.promo_label,
    },
    {
      ownerId: rule.variantId,
      namespace: NAMESPACE,
      key: "promo_source",
      type: "single_line_text_field",
      value: values.promo_source,
    },
    {
      ownerId: rule.variantId,
      namespace: NAMESPACE,
      key: "promo_priority",
      type: "number_integer",
      value: values.promo_priority,
    },
  ];

  const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: { metafields },
  });

  const json = await response.json();
  const errors = json?.data?.metafieldsSet?.userErrors || [];

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }

  return true;
}

export async function upsertPromoDisplayRule({
  admin,
  shop,
  source,
  sourceId = null,
  sku,
  discountType,
  discountAmount = null,
  discountPercent = null,
  label = "",
  priority = 100,
  isEnabled = true,
  startsAt = null,
  endsAt = null,
}) {
  const variant = await findVariantBySku(admin, sku);

  const rule = await db.promoDisplayRule.upsert({
    where: {
      shop_source_sku: {
        shop,
        source,
        sku: sku.trim(),
      },
    },
    update: {
      sourceId,
      discountType,
      discountAmount,
      discountPercent,
      label,
      priority,
      isEnabled,
      startsAt,
      endsAt,
      productId: variant.product.id,
      variantId: variant.id,
    },
    create: {
      shop,
      source,
      sourceId,
      sku: sku.trim(),
      discountType,
      discountAmount,
      discountPercent,
      label,
      priority,
      isEnabled,
      startsAt,
      endsAt,
      productId: variant.product.id,
      variantId: variant.id,
    },
  });

  await syncPromoDisplayMetafields(admin, rule);

  return rule;
}

export async function listPromoDisplayRules(shop) {
  return db.promoDisplayRule.findMany({
    where: { shop },
    orderBy: [
      { isEnabled: "desc" },
      { priority: "asc" },
      { source: "asc" },
      { sku: "asc" },
    ],
  });
}

export async function disablePromoDisplayRule({ admin, shop, id }) {
  const rule = await db.promoDisplayRule.findFirst({
    where: { id, shop },
  });

  if (!rule) {
    throw new Error("Promo display rule not found");
  }

  const disabledRule = {
    ...rule,
    isEnabled: false,
    discountAmount: 0,
    discountPercent: 0,
    label: "",
  };

  await syncPromoDisplayMetafields(admin, disabledRule);

  return db.promoDisplayRule.update({
    where: { id },
    data: {
      isEnabled: false,
    },
  });
}

export async function deletePromoDisplayRule({ admin, shop, id }) {
  const rule = await disablePromoDisplayRule({ admin, shop, id });

  await db.promoDisplayRule.delete({
    where: { id: rule.id },
  });

  return true;
}