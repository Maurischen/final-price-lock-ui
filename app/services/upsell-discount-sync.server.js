import db from "../db.server";

const TITLE = "Laptop Bundle Discount";
const NAMESPACE = "$app:bundle-discount";
const KEY = "function-configuration";

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

async function getCurrentStoreFunctionId(admin) {
  const res = await admin.graphql(GET_APP_DISCOUNT_TYPES_QUERY);
  const json = await res.json();

  const types = json?.data?.appDiscountTypes || [];
  const match = types.find((item) => item?.functionId);

  if (!match?.functionId) {
    throw new Error("Could not find a discount functionId for this store.");
  }

  return match.functionId;
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
        config: node.metafield?.jsonValue || {},
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
            value: JSON.stringify({ rules: [], standaloneDiscounts: [] }),
          },
        ],
      },
    },
  });

  const createJson = await createRes.json();
  const payload = createJson?.data?.discountAutomaticAppCreate;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  const id = payload?.automaticAppDiscount?.discountId;

  if (!id) {
    throw new Error("Bundle discount was not created.");
  }

  return {
    id,
    title: TITLE,
    status: payload?.automaticAppDiscount?.status || "",
    config: { rules: [], standaloneDiscounts: [] },
  };
}

async function resolveVariantBySku(admin, sku) {
  if (!sku) return null;

  const res = await admin.graphql(
    `#graphql
    query VariantBySku($query: String!) {
      productVariants(first: 1, query: $query) {
        nodes {
          id
          sku
          product {
            id
          }
        }
      }
    }`,
    {
      variables: {
        query: `sku:${sku}`,
      },
    },
  );

  const json = await res.json();
  return json?.data?.productVariants?.nodes?.[0] || null;
}

async function resolveVariantById(admin, variantId) {
  if (!variantId) return null;

  const res = await admin.graphql(
    `#graphql
    query VariantById($id: ID!) {
      productVariant(id: $id) {
        id
        sku
        product {
          id
        }
      }
    }`,
    {
      variables: { id: variantId },
    },
  );

  const json = await res.json();
  return json?.data?.productVariant || null;
}

async function resolveProductById(admin, productId) {
  if (!productId) return null;

  const res = await admin.graphql(
    `#graphql
    query ProductById($id: ID!) {
      product(id: $id) {
        id
        variants(first: 100) {
          nodes {
            id
            sku
          }
        }
      }
    }`,
    {
      variables: { id: productId },
    },
  );

  const json = await res.json();
  return json?.data?.product || null;
}

async function resolveCollectionProducts(admin, collectionId) {
  if (!collectionId) return [];

  const skus = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await admin.graphql(
      `#graphql
      query CollectionProducts($id: ID!, $cursor: String) {
        collection(id: $id) {
          products(first: 100, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              variants(first: 100) {
                nodes {
                  id
                  sku
                }
              }
            }
          }
        }
      }`,
      {
        variables: {
          id: collectionId,
          cursor,
        },
      },
    );

    const json = await res.json();
    const products = json?.data?.collection?.products;
    const nodes = products?.nodes || [];

    for (const product of nodes) {
      for (const variant of product.variants?.nodes || []) {
        if (variant?.sku) skus.push(variant.sku);
      }
    }

    hasNextPage = Boolean(products?.pageInfo?.hasNextPage);
    cursor = products?.pageInfo?.endCursor || null;
  }

  return [...new Set(skus)];
}

function getExtraTriggerSkus(rule) {
  if (!Array.isArray(rule?.triggers)) return [];

  return rule.triggers
    .filter((trigger) => trigger?.triggerType === "SKU" && trigger?.sku)
    .map((trigger) => trigger.sku)
    .filter(Boolean);
}

async function buildTriggerMatch(admin, rule) {
  if (rule.triggerMode === "SKU") {
    const triggerSkus = [
      rule.triggerSku,
      ...getExtraTriggerSkus(rule),
    ].filter(Boolean);

    return {
      triggerMode: "SKU",
      triggerSkus: [...new Set(triggerSkus)],
      triggerProductIds: [],
      triggerVariantIds: [],
    };
  }

  if (rule.triggerMode === "VARIANT") {
    const variant = await resolveVariantById(admin, rule.triggerVariantId);

    return {
      triggerMode: "VARIANT",
      triggerSkus: variant?.sku ? [variant.sku] : [],
      triggerProductIds: variant?.product?.id ? [variant.product.id] : [],
      triggerVariantIds: rule.triggerVariantId ? [rule.triggerVariantId] : [],
    };
  }

  if (rule.triggerMode === "PRODUCT") {
    const product = await resolveProductById(admin, rule.triggerProductId);
    const skus =
      product?.variants?.nodes?.map((variant) => variant.sku).filter(Boolean) ||
      [];

    return {
      triggerMode: "PRODUCT",
      triggerSkus: [...new Set(skus)],
      triggerProductIds: rule.triggerProductId ? [rule.triggerProductId] : [],
      triggerVariantIds: [],
    };
  }

  if (rule.triggerMode === "COLLECTION") {
    const skus = await resolveCollectionProducts(admin, rule.triggerCollectionId);

    return {
      triggerMode: "COLLECTION",
      triggerSkus: skus,
      triggerProductIds: [],
      triggerVariantIds: [],
      triggerCollectionId: rule.triggerCollectionId,
    };
  }

  return {
    triggerMode: rule.triggerMode,
    triggerSkus: [],
    triggerProductIds: [],
    triggerVariantIds: [],
  };
}

async function buildAccessory(admin, offer) {
  let sku = offer.offerSku || null;
  let variantId = offer.offerVariantId || null;
  let productId = offer.offerProductId || null;

  if (offer.offerMode === "SKU" && sku) {
    const variant = await resolveVariantBySku(admin, sku);
    variantId = variant?.id || variantId;
    productId = variant?.product?.id || productId;
  }

  if (offer.offerMode === "VARIANT" && variantId) {
    const variant = await resolveVariantById(admin, variantId);
    sku = variant?.sku || sku;
    productId = variant?.product?.id || productId;
  }

  if (offer.offerMode === "PRODUCT" && productId) {
    const product = await resolveProductById(admin, productId);
    const firstVariant = product?.variants?.nodes?.find((variant) => variant.sku);
    sku = firstVariant?.sku || sku;
  }

  const discountMode = offer.discountMode || "NONE";
  const discountValue = Number(offer.discountValue || 0);

  if (!discountMode || discountMode === "NONE") return null;
  if (!Number.isFinite(discountValue) || discountValue <= 0) return null;
  if (!sku && !variantId && !productId) return null;

  return {
    sku,
    productId,
    variantId,
    discountMode,
    discountValue,
    discountAmount: discountMode === "FIXED" ? discountValue : null,
    discountPercentage: discountMode === "PERCENTAGE" ? discountValue : null,
    label:
      offer.discountLabel ||
      offer.offerMessage ||
      "Bundle discount",
  };
}

async function upsellRuleToBundleRule(admin, rule) {
  if (!rule.isActive) return null;

  const trigger = await buildTriggerMatch(admin, rule);

  if (
    !trigger.triggerSkus.length &&
    !trigger.triggerProductIds.length &&
    !trigger.triggerVariantIds.length
  ) {
    return null;
  }

  const accessories = [];

  for (const offer of rule.offerProducts || []) {
    if (offer.isActive === false) continue;

    const accessory = await buildAccessory(admin, offer);
    if (accessory) accessories.push(accessory);
  }

  if (!accessories.length) return null;

  return {
    id: rule.id,
    name: rule.name,
    active: Boolean(rule.isActive),
    triggerMode: rule.triggerMode,
    triggerSku: trigger.triggerSkus[0] || "",
    triggerSkus: trigger.triggerSkus,
    triggerProductIds: trigger.triggerProductIds,
    triggerVariantIds: trigger.triggerVariantIds,
    triggerCollectionId: trigger.triggerCollectionId || null,
    ratio: 1,
    message: rule.name || "Bundle discount",
    accessories,
  };
}

async function buildBundleConfigFromUpsells({ shop, admin }) {
  const rules = await db.upsellRule.findMany({
    where: {
      shop,
      isActive: true,
    },
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
      triggers: {
        where: { triggerType: "SKU" },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });

  const functionRules = [];

  for (const rule of rules) {
    const functionRule = await upsellRuleToBundleRule(admin, rule);
    if (functionRule) functionRules.push(functionRule);
  }

  return {
    rules: functionRules,
    syncedAt: new Date().toISOString(),
  };
}

export async function syncUpsellRulesToBundleDiscount({ shop, admin }) {
  const discount = await findOrCreateBundleDiscount(admin);
  const upsellConfig = await buildBundleConfigFromUpsells({ shop, admin });

  const cleanConfig = {
    ...discount.config,
    ...upsellConfig,
    standaloneDiscounts: Array.isArray(discount.config?.standaloneDiscounts)
      ? discount.config.standaloneDiscounts
      : [],
  };

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
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return {
    ok: true,
    config: cleanConfig,
  };
}