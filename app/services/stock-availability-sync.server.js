export async function syncStockAvailability({
  admin,
  onlineLocationIds = [],
  storeLocationIds = [],
  dryRun = true,
}) {
  const onlineSet = new Set(onlineLocationIds);
  const storeSet = new Set(storeLocationIds);

  const productMap = new Map();

  let hasNextPage = true;
  let after = null;
  let processedVariants = 0;

  while (hasNextPage) {
    const response = await admin.graphql(`
      #graphql
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
      }
    `, {
      variables: {
        first: 100,
        after,
      },
    });

    const result = await response.json();
    const conn = result?.data?.productVariants;

    if (!conn?.edges || !conn?.pageInfo) {
      throw new Error(`Invalid GraphQL response: ${JSON.stringify(result)}`);
    }

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

      const state = productMap.get(productId);
      const inventoryItem = variant.inventoryItem;

      if (!inventoryItem || !inventoryItem.tracked) continue;

      for (const levelEdge of inventoryItem.inventoryLevels.edges) {
        const level = levelEdge.node;
        const locationId = level?.location?.id;
        const availableRow = level?.quantities?.find((q) => q.name === "available");
        const qty = Number(availableRow?.quantity || 0);

        if (onlineSet.has(locationId)) {
          state.onlineQty += qty;
        } else if (storeSet.has(locationId)) {
          state.storeQty += qty;
        }
      }
    }

    hasNextPage = conn.pageInfo.hasNextPage;
    after = conn.pageInfo.endCursor;
  }

  const updates = [];

  for (const [, product] of productMap) {
    let value = null;

    if (product.onlineQty > 0 && product.storeQty > 0) {
      value = "Available Online & In Store";
    } else if (product.onlineQty > 0) {
      value = "Available Online";
    } else if (product.storeQty > 0) {
      value = "Available In Store";
    }

    if (!value) continue;

    updates.push({
      ownerId: product.productId,
      namespace: "custom",
      key: "stock_availability",
      type: "single_line_text_field",
      value,
    });
  }

  if (!dryRun && updates.length > 0) {
    const chunks = [];
    for (let i = 0; i < updates.length; i += 25) {
      chunks.push(updates.slice(i, i + 25));
    }

    for (const batch of chunks) {
      const mutationResponse = await admin.graphql(`
        #graphql
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
        }
      `, {
        variables: {
          metafields: batch,
        },
      });

      const mutationResult = await mutationResponse.json();
      const errors = mutationResult?.data?.metafieldsSet?.userErrors || [];

      if (errors.length) {
        throw new Error(`Metafield update failed: ${JSON.stringify(errors)}`);
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