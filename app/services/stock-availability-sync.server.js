export async function syncStockAvailability({
  admin,
  onlineLocationIds = [],
  storeLocationIds = [],
  dryRun = true,
  enableDeletes = false,
}) {
  const onlineSet = new Set(onlineLocationIds);
  const storeSet = new Set(storeLocationIds);

  const productMap = new Map();

  let hasNextPage = true;
  let after = null;
  let processedVariants = 0;
  let processedActiveVariants = 0;
  let processedProductsSeen = 0;
  let pageCount = 0;
  let writtenBatches = 0;
  let deletedBatches = 0;

  while (hasNextPage) {
    pageCount++;

    const response = await admin.graphql(
      `
      #graphql
      query ProductVariantsPage($first: Int!, $after: String, $query: String) {
        productVariants(first: $first, after: $after, query: $query) {
          edges {
            cursor
            node {
              id
              sku
              product {
                id
                title
                status
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
      `,
      {
        variables: {
          first: 100,
          after,
          query: "status:active",
        },
      },
    );

    const result = await response.json();
    const conn = result?.data?.productVariants;

    if (!conn?.edges || !conn?.pageInfo) {
      throw new Error(`Invalid GraphQL response: ${JSON.stringify(result)}`);
    }

    for (const edge of conn.edges) {
      const variant = edge.node;
      processedVariants++;

      if (!variant?.product || variant.product.status !== "ACTIVE") {
        continue;
      }

      processedActiveVariants++;

      const productId = variant.product.id;
      const title = variant.product.title;

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productId,
          title,
          onlineQty: 0,
          storeQty: 0,
        });
        processedProductsSeen++;
      }

      const state = productMap.get(productId);
      const inventoryItem = variant.inventoryItem;

      if (!inventoryItem || !inventoryItem.tracked) {
        continue;
      }

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
  const deletes = [];

  for (const [, product] of productMap) {
    let value = null;

    if (product.onlineQty > 0 && product.storeQty > 0) {
      value = "Available Online & In Store";
    } else if (product.onlineQty > 0) {
      value = "Available Online";
    } else if (product.storeQty > 0) {
      value = "Available In Store";
    }

    if (value) {
      updates.push({
        ownerId: product.productId,
        namespace: "custom",
        key: "stock_availability",
        type: "single_line_text_field",
        value,
      });
    } else {
      deletes.push({
        ownerId: product.productId,
        namespace: "custom",
        key: "stock_availability",
      });
    }
  }

  if (!dryRun && updates.length > 0) {
    const updateChunks = [];
    for (let i = 0; i < updates.length; i += 25) {
      updateChunks.push(updates.slice(i, i + 25));
    }

    for (const batch of updateChunks) {
      writtenBatches++;

      const mutationResponse = await admin.graphql(
        `
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
        `,
        {
          variables: {
            metafields: batch,
          },
        },
      );

      const mutationResult = await mutationResponse.json();

      if (mutationResult.errors) {
        console.error(
          "GraphQL top-level set error:",
          JSON.stringify(mutationResult, null, 2),
        );
        throw new Error(`GraphQL set error: ${JSON.stringify(mutationResult.errors)}`);
      }

      const errors = mutationResult?.data?.metafieldsSet?.userErrors || [];

      if (errors.length) {
        throw new Error(`Metafield update failed: ${JSON.stringify(errors)}`);
      }
    }
  }

 if (!dryRun && enableDeletes && deletes.length > 0) {
  const deleteChunks = [];
  for (let i = 0; i < deletes.length; i += 25) {
    deleteChunks.push(deletes.slice(i, i + 25));
  }

  for (const batch of deleteChunks) {
    deletedBatches++;

    const deleteResponse = await admin.graphql(
      `
      #graphql
      mutation DeleteMetafields($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields {
            ownerId
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          metafields: batch,
        },
      },
    );

    const deleteResult = await deleteResponse.json();

    if (deleteResult.errors) {
      console.error(
        "GraphQL top-level delete error:",
        JSON.stringify(deleteResult, null, 2),
      );
      throw new Error(`GraphQL delete error: ${JSON.stringify(deleteResult.errors)}`);
    }

    const errors = deleteResult?.data?.metafieldsDelete?.userErrors || [];

    if (errors.length) {
      console.error(
        "Metafields delete userErrors:",
        JSON.stringify(errors, null, 2),
      );
      console.error(
        "Delete batch sample:",
        JSON.stringify(batch.slice(0, 5), null, 2),
      );
      throw new Error(`Metafield delete failed: ${JSON.stringify(errors)}`);
    }
  }
}

  return {
    dryRun,
    pageCount,
    processedVariants,
    processedActiveVariants,
    processedProductsSeen,
    updatesPrepared: updates.length,
    deletesPrepared: deletes.length,
    writtenBatches,
    deletedBatches,
    sampleUpdates: updates.slice(0, 10),
    sampleDeletes: deletes.slice(0, 10),
  };
}