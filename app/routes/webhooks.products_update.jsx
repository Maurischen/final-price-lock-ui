import { authenticate, unauthenticated } from "../shopify.server";
import db from "../db.server";

const PRICE_GUARD_VARIANT_UPDATE_MUTATION = `#graphql
  mutation PriceGuardVariantUpdate(
    $productId: ID!,
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  // Only care about product updates
  if (topic !== "PRODUCTS_UPDATE") {
    return new Response();
  }

  console.log(`🧩 Received webhook topic=${topic} for shop=${shop}`);

  if (!payload?.variants || !Array.isArray(payload.variants)) {
    console.log("⚠️ No variants array on payload");
    return new Response();
  }

  // 🔹 Get an offline Admin client for this shop
  let admin;
  try {
    const ctx = await unauthenticated.admin(shop);
    admin = ctx.admin;
  } catch (err) {
    console.warn(
      "⚠️ PriceGuard: no offline admin session yet for",
      shop,
      "- skipping this webhook.",
    );
    // This will happen right after a fresh deploy until you open the app once.
    return new Response();
  }

  // Collect all variants we actually need to fix in one GraphQL call
  const variantsToFix = [];

  for (const variant of payload.variants) {
    const sku = variant.sku?.trim();
    if (!sku) continue;

    const rule = await db.priceGuard.findUnique({
  where: {
    shop_sku: { shop, sku },
  },
});

    if (!rule) {
      // Not a guarded SKU, skip quietly
      continue;
    }

    const currentPrice = parseFloat(variant.price);
    const minPrice = Number(rule.minPrice);

    if (Number.isNaN(currentPrice)) {
      console.log(`⚠️ ${sku}: variant has no numeric price, skipping`);
      continue;
    }

    if (currentPrice >= minPrice) {
      console.log(
        `✅ ${sku}: price ${currentPrice} >= min ${minPrice}, nothing to do`,
      );
      continue;
    }

    console.log(
      `🚨 ${sku}: price ${currentPrice} < min ${minPrice}, restoring…`,
    );

    // This is the GraphQL variant id coming from the webhook payload
    variantsToFix.push({
      id: variant.admin_graphql_api_id,
      price: minPrice.toFixed(2),
    });
  }

  // Nothing to update? We’re done.
  if (!variantsToFix.length) {
    return new Response();
  }

  // 🔹 Get the product GID for productVariantsBulkUpdate
  const productId =
    payload.admin_graphql_api_id ??
    // fallback: build a gid if for some reason we only have a numeric id
    `gid://shopify/Product/${String(payload.id).replace(/[^0-9]/g, "")}`;

  try {
    const response = await admin.graphql(
      PRICE_GUARD_VARIANT_UPDATE_MUTATION,
      {
        variables: {
          productId,
          variants: variantsToFix,
        },
      },
    );

    if (response.status !== 200) {
      const text = await response.text();
      console.error(
        "❌ PriceGuard: GraphQL HTTP error",
        response.status,
        text,
      );
      return new Response();
    }

    const data = await response.json();

    console.log(
      "[PriceGuard] Raw GraphQL data:",
      JSON.stringify(data, null, 2),
    );

   const bulkResult = data?.data?.productVariantsBulkUpdate;

if (bulkResult?.userErrors?.length) {
  console.error(
    "❌ PriceGuard: GraphQL userErrors",
    JSON.stringify(bulkResult.userErrors, null, 2),
  );
} else {
  const updated = bulkResult?.productVariants ?? [];

  console.log(
    "💰 PriceGuard: Restored variants:",
    updated.map((v) => `${v.id} → ${v.price}`),
  );

  // ✅ SAFETY LOG (update DB)
  for (const v of updated) {
    await db.priceGuard.updateMany({
      where: {
        shop,
        variantId: v.id,
      },
      data: {
        lastCorrectedAt: new Date(),
      },
    });
  }
}
  } catch (err) {
    console.error("❌ PriceGuard: GraphQL call failed (exception)", err);
  }

  // Always 200 so Shopify doesn’t retry
  return new Response();
};

// So hitting the URL in a browser doesn’t 404
export const loader = () => new Response("OK");
