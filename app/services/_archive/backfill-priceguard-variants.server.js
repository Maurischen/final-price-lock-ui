import "dotenv/config";
import db from "../db.server.js";
import { unauthenticated } from "../shopify.server.js";

const FIND_VARIANT_BY_SKU = `#graphql
  query FindVariantBySku($query: String!) {
    productVariants(first: 5, query: $query) {
      edges {
        node {
          id
          sku
          title
          product {
            id
            title
          }
        }
      }
    }
  }
`;

async function run() {
  console.log("🚀 Starting PriceGuard backfill...");

  const guards = await db.priceGuard.findMany({
    where: {
      OR: [
        { variantId: null },
        { productId: null },
      ],
    },
    orderBy: { shop: "asc" },
  });

  console.log(`🔍 Found ${guards.length} records to process`);

  for (const guard of guards) {
    const { shop, sku } = guard;

    if (!sku) {
      console.warn(`⚠️ Skipping record with no SKU (id: ${guard.id})`);
      continue;
    }

    try {
      console.log(`🔎 ${shop} | Searching for SKU: ${sku}`);

      const { admin } = await unauthenticated.admin(shop);

      const response = await admin.graphql(FIND_VARIANT_BY_SKU, {
        variables: { query: `sku:${sku}` },
      });

      const json = await response.json();
      const edges = json?.data?.productVariants?.edges ?? [];

      if (!edges.length) {
        console.warn(`❌ No matches found for ${sku}`);
        continue;
      }

      // Try exact SKU match first
      const exactMatch = edges.find(
        (edge) => edge?.node?.sku?.trim() === sku.trim()
      );

      const match = exactMatch || edges[0]?.node;

      if (!match) {
        console.warn(`❌ No usable match for ${sku}`);
        continue;
      }

      await db.priceGuard.update({
        where: { id: guard.id },
        data: {
          variantId: match.id,
          productId: match.product.id,
          mode: "MIN_ONLY",
          isEnabled: true,
        },
      });

      console.log(
        `✅ Backfilled ${sku} → variantId: ${match.id}`
      );
    } catch (err) {
      console.error(`❌ Error processing ${shop} | ${sku}`, err);
    }
  }

  console.log("🎉 Backfill complete!");
}

/**
 * Run only when executed directly
 */
if (process.argv[1]?.includes("backfill-priceguard-variants.server.js")) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Backfill failed", err);
      process.exit(1);
    });
}