import db from "../db.server";

const TITLE = "Standalone Promo Discount";
const NAMESPACE = "app--299787976705--bundle-discount";
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
query FindStandalonePromoDiscounts {
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
mutation CreateStandalonePromoDiscount($input: DiscountAutomaticAppInput!) {
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
mutation SetStandalonePromoMetafield($metafields: [MetafieldsSetInput!]!) {
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

async function getCurrentStoreFunctionId(admin) {
  const res = await admin.graphql(GET_APP_DISCOUNT_TYPES_QUERY);
  const json = await res.json();

  const types = json?.data?.appDiscountTypes || [];

  console.log("APP DISCOUNT TYPES:", JSON.stringify(types, null, 2));

  const exactTitleMatch = types.find(
    (item) => item?.title === "Standalone Promo Discount" && item?.functionId,
  );

  if (exactTitleMatch?.functionId) return exactTitleMatch.functionId;

  if (types.length === 1 && types[0]?.functionId) {
    return types[0].functionId;
  }

  const anyFunctionMatch = types.find((item) => item?.functionId);

  if (anyFunctionMatch?.functionId) {
    return anyFunctionMatch.functionId;
  }

  throw new Error("Could not find discount functionId for Standalone Promo Discount.");
}

async function findOrCreateStandalonePromoDiscount(admin) {
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
        config: {
          standaloneDiscounts: Array.isArray(
            node.metafield?.jsonValue?.standaloneDiscounts,
          )
            ? node.metafield.jsonValue.standaloneDiscounts
            : [],
        },
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
            value: JSON.stringify({ standaloneDiscounts: [] }),
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
    throw new Error("Standalone Promo Discount was not created.");
  }

  return {
    id,
    title: TITLE,
    status: payload?.automaticAppDiscount?.status || "",
    config: { standaloneDiscounts: [] },
  };
}

function normalizeStandaloneDiscounts(rawConfig) {
  const standaloneDiscounts = Array.isArray(rawConfig?.standaloneDiscounts)
    ? rawConfig.standaloneDiscounts
    : [];

  return standaloneDiscounts
    .map((item) => ({
      active: Boolean(item?.active ?? true),
      sku: String(item?.sku || "").trim(),
      discountMode:
        item?.discountMode === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
      discountAmount: Number(
        item?.discountAmount ?? item?.discountValue ?? item?.amount ?? 0,
      ),
      message: String(item?.message || item?.label || "Promo discount").trim(),
    }))
    .filter(
      (item) =>
        item.sku &&
        Number.isFinite(item.discountAmount) &&
        item.discountAmount > 0,
    );
}

export async function syncStandaloneDiscountsToStandalonePromoDiscount({
  admin,
  standaloneDiscounts,
}) {
  const discount = await findOrCreateStandalonePromoDiscount(admin);

  const cleanConfig = {
    standaloneDiscounts: normalizeStandaloneDiscounts({ standaloneDiscounts }),
    syncedAt: new Date().toISOString(),
  };

  const payloadString = JSON.stringify(cleanConfig);

  console.log("STANDALONE PROMO DISCOUNT ID:", discount.id);
  console.log(
    "STANDALONE PROMO CONFIG SIZE:",
    Buffer.byteLength(payloadString, "utf8"),
    "bytes",
  );
  console.log(
    "STANDALONE PROMO COUNT:",
    cleanConfig.standaloneDiscounts?.length || 0,
  );

  const metafieldsRes = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId: discount.id,
          namespace: NAMESPACE,
          key: KEY,
          type: "json",
          value: payloadString,
        },
      ],
    },
  });

  const metafieldsJson = await metafieldsRes.json();

  console.log(
    "STANDALONE PROMO METAFIELD WRITE RESULT:",
    JSON.stringify(metafieldsJson, null, 2),
  );

  const payload = metafieldsJson?.data?.metafieldsSet;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return {
    ok: true,
    discountId: discount.id,
    config: cleanConfig,
  };
}

export async function getStandalonePromoDiscount(admin) {
  return findOrCreateStandalonePromoDiscount(admin);
}