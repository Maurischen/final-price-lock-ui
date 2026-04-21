const BUNDLE_DISCOUNT_TITLE = "Laptop Bundle Discount";
const METAFIELD_NAMESPACE = "$app:bundle-discount";
const METAFIELD_KEY = "function-configuration";

/**
 * IMPORTANT:
 * Replace this with your function ID / discount function handle value
 * used by your automatic app discount creation flow.
 *
 * Depending on your app setup, this is usually the function ID exposed
 * for your discount extension.
 */
const FUNCTION_ID = process.env.SHOPIFY_BUNDLE_FUNCTION_ID;

const FIND_DISCOUNTS_QUERY = `#graphql
  query FindAutomaticAppDiscounts($query: String!) {
    discountNodes(first: 25, query: $query) {
      nodes {
        id
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title
            status
            appDiscountType {
              functionId
            }
            metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
              id
              jsonValue
            }
          }
        }
      }
    }
  }
`;

const CREATE_DISCOUNT_MUTATION = `#graphql
  mutation CreateBundleAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
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

const UPDATE_DISCOUNT_MUTATION = `#graphql
  mutation UpdateBundleAutomaticDiscount($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
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

function emptyConfig() {
  return { rules: [] };
}

export async function findBundleDiscount(admin) {
  const response = await admin.graphql(FIND_DISCOUNTS_QUERY, {
    variables: {
      query: `type:app title:'${BUNDLE_DISCOUNT_TITLE}'`,
    },
  });

  const json = await response.json();
  const nodes = json?.data?.discountNodes?.nodes || [];

  for (const node of nodes) {
    const discount = node?.discount;
    if (discount?.__typename === "DiscountAutomaticApp" && discount.title === BUNDLE_DISCOUNT_TITLE) {
      return {
        id: node.id,
        discountId: node.id,
        title: discount.title,
        status: discount.status,
        metafield: discount.metafield?.jsonValue || emptyConfig(),
      };
    }
  }

  return null;
}

export async function createBundleDiscount(admin) {
  if (!FUNCTION_ID) {
    throw new Error("Missing SHOPIFY_BUNDLE_FUNCTION_ID environment variable.");
  }

  const response = await admin.graphql(CREATE_DISCOUNT_MUTATION, {
    variables: {
      automaticAppDiscount: {
        title: BUNDLE_DISCOUNT_TITLE,
        functionId: FUNCTION_ID,
        startsAt: new Date().toISOString(),
        combinesWith: {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: false,
        },
        metafields: [
          {
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(emptyConfig()),
          },
        ],
      },
    },
  });

  const json = await response.json();
  const payload = json?.data?.discountAutomaticAppCreate;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return payload?.automaticAppDiscount || null;
}

export async function findOrCreateBundleDiscount(admin) {
  const existing = await findBundleDiscount(admin);
  if (existing) return existing;

  const created = await createBundleDiscount(admin);
  if (!created?.discountId) {
    throw new Error("Bundle discount could not be created.");
  }

  const foundAfterCreate = await findBundleDiscount(admin);
  if (!foundAfterCreate) {
    throw new Error("Bundle discount was created but could not be reloaded.");
  }

  return foundAfterCreate;
}

export async function updateBundleDiscountConfig(admin, discountId, config) {
  const response = await admin.graphql(UPDATE_DISCOUNT_MUTATION, {
    variables: {
      id: discountId,
      automaticAppDiscount: {
        metafields: [
          {
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEY,
            type: "json",
            value: JSON.stringify(config),
          },
        ],
      },
    },
  });

  const json = await response.json();
  const payload = json?.data?.discountAutomaticAppUpdate;
  const userErrors = payload?.userErrors || [];

  if (userErrors.length) {
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return payload?.automaticAppDiscount || null;
}