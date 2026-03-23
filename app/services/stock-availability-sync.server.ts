import { unauthenticated } from "../shopify.server";

type SyncOptions = {
  shop: string;
  onlineLocationNames: string[];
  storeLocationNames: string[];
  dryRun?: boolean;
};

type ProductState = {
  productId: string;
  title: string;
  onlineQty: number;
  storeQty: number;
};

type ProductVariantsResponse = {
  data?: {
    productVariants?: {
      edges?: Array<{
        cursor: string;
        node: {
          id: string;
          sku: string | null;
          product: {
            id: string;
            title: string;
          };
          inventoryItem: {
            id: string;
            tracked: boolean;
            inventoryLevels: {
              edges: Array<{
                node: {
                  location: {
                    id: string;
                    name: string;
                  };
                  quantities: Array<{
                    name: string;
                    quantity: number | string;
                  }>;
                };
              }>;
            };
          } | null;
        };
      }>;
      pageInfo?: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
    };
  };
};

type MetafieldsSetResponse = {
  data?: {
    metafieldsSet?: {
      userErrors?: Array<{
        field?: string[];
        message: string;
        code?: string;
      }>;
    };
  };
};

const METAFIELD_NAMESPACE = "custom";
const METAFIELD_KEY = "stock_availability";
const METAFIELD_TYPE = "single_line_text_field";

const VALUE_ONLINE = "Available Online";
const VALUE_STORE = "Available In Store";
const VALUE_BOTH = "Available Online & In Store";
const VALUE_NO_STOCK: string | null = null;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getAvailableQty(
  quantities: Array<{ name: string; quantity: number | string }> = [],
) {
  const row = quantities.find((q) => q.name === "available");
  return Number(row?.quantity ?? 0);
}

function decideValue(onlineQty: number, storeQty: number) {
  if (onlineQty > 0 && storeQty > 0) return VALUE_BOTH;
  if (onlineQty > 0) return VALUE_ONLINE;
  if (storeQty > 0) return VALUE_STORE;
  return VALUE_NO_STOCK;
}

export async function syncStockAvailability({
  shop,
  onlineLocationNames,
  storeLocationNames,
  dryRun = false,
}: SyncOptions) {
  const { admin } = await unauthenticated.admin(shop);

  const onlineSet = new Set(onlineLocationNames);
  const storeSet = new Set(storeLocationNames);

  const productMap = new Map<string, ProductState>();

  let hasNextPage = true;
  let after: string | null = null;
  let processedVariants = 0;

  while (hasNextPage) {
    const response: Response = await admin.graphql(
      `#graphql
      query ProductVariantsPage($first: Int!, $after: String) {
        productVariants(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              sku
              product {
                id
                title
              }
              inventoryItem {
                id
                tracked
                inventoryLevels(first: 100) {
                  edges {
                    node {
                      location {
                        id
                        name
                      }
                      quantities(names: ["available"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }`,
      {
        variables: {
          first: 100,
          after,
        },
      },
    );

    const result = (await response.json()) as ProductVariantsResponse;
    const conn = result.data?.productVariants;

    if (!conn?.edges || !conn.pageInfo) break;

    for (const edge of conn.edges) {
      const variant = edge.node;
      processedVariants++;

      const productId = variant.product.id;
      const title = variant.product.title;

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productId,
          title,
          onlineQty: 0,
          storeQty: 0,
        });
      }

      const state = productMap.get(productId)!;
      const inventoryItem = variant.inventoryItem;

      if (!inventoryItem?.tracked) continue;

      for (const levelEdge of inventoryItem.inventoryLevels.edges) {
        const level = levelEdge.node;
        const locationName = level.location?.name;
        const qty = getAvailableQty(level.quantities);

        if (onlineSet.has(locationName)) {
          state.onlineQty += qty;
        } else if (storeSet.has(locationName)) {
          state.storeQty += qty;
        }
      }
    }

    hasNextPage = conn.pageInfo.hasNextPage;
    after = conn.pageInfo.endCursor;
  }

  const updates: Array<{
    ownerId: string;
    namespace: string;
    key: string;
    type: string;
    value: string;
  }> = [];

  for (const [, product] of productMap) {
    const value = decideValue(product.onlineQty, product.storeQty);
    if (value === null) continue;

    updates.push({
      ownerId: product.productId,
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: METAFIELD_TYPE,
      value,
    });
  }

  if (!dryRun && updates.length) {
    for (const batch of chunk(updates, 25)) {
      const response: Response = await admin.graphql(
        `#graphql
        mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
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
        }`,
        {
          variables: {
            metafields: batch,
          },
        },
      );

      const result = (await response.json()) as MetafieldsSetResponse;
      const errors = result.data?.metafieldsSet?.userErrors ?? [];

      if (errors.length) {
        throw new Error(`metafieldsSet failed: ${JSON.stringify(errors)}`);
      }
    }
  }

  return {
    dryRun,
    processedVariants,
    processedProducts: productMap.size,
    updatesPrepared: updates.length,
    sample: updates.slice(0, 10),
  };
}