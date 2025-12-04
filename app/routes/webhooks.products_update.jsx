import { authenticate } from "../shopify.server";
import db from "../db.server";

const PRICE_GUARD_VARIANT_UPDATE_MUTATION = `
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
  // Verify webhook + get context (including admin client)
  const { topic, shop, payload, admin, session } = await authenticate.webhook(
    request
  );

  console.log(`🧩 Received webhook topic=${topic} for shop=${shop}`);

  // If Shopify fires this after uninstall, admin can be missing
  if (!admin) {
    console.log("⚠️ No admin context for webhook", { topic, shop, session });
    return new Response();
  }

  if (topic !== "PRODUCTS_UPDATE") {
    return new Response();
  }

  if (!payload?.variants || !Array.isArray(payload.variants)) {
    console.log("⚠️ No variants found on payload");
    return new Response();
  }

  // PRODUCT_UPDATE payload is the product itself
  const productId =
    payload.admin_graphql_api_id || payload.id || null;

  if (!productId) {
    console.log("⚠️ No productId/admin_graphql_api_id on payload, aborting");
    return new Response();
  }

  const variantsToUpdate = [];

  for (const variant of payload.variants) {
    const sku = variant.sku?.trim();
    if (!sku) continue;

    const rule = await db.priceGuard.findUnique({
      where: { sku },
    });

    if (!rule) {
      // Not a guarded SKU – just log for debugging
      console.log(`➡️ No PriceGuard rule for SKU ${sku}, skipping`);
      continue;
    }

    const currentPrice = parseFloat(variant.price);
    const minPrice = rule.minPrice;

    if (isNaN(currentPrice) || currentPrice >= minPrice) {
      console.log(
        `✅ ${sku}: price ${currentPrice} >= min ${minPrice}, nothing to do`
      );
      continue;
    }

    console.log(
      `🚨 ${sku}: price ${currentPrice} < min ${minPrice}, restoring…`
    );

    variantsToUpdate.push({
      id: variant.admin_graphql_api_id, // variant GID
      price: minPrice.toFixed(2),
    });
  }

  // Nothing to fix on this product
  if (variantsToUpdate.length === 0) {
    console.log("ℹ️ No variants needed restoring for this PRODUCTS_UPDATE");
    return new Response();
  }

  const variables = {
    productId,
    variants: variantsToUpdate,
  };

  try {
    const result = await admin.graphql(
      PRICE_GUARD_VARIANT_UPDATE_MUTATION,
      { variables }
    );

    console.log(
      `[PriceGuard] Raw GraphQL result:`,
      JSON.stringify(result, null, 2)
    );

    const bulkResult = result?.data?.productVariantsBulkUpdate;

    if (!bulkResult) {
      console.error(
        "❌ PriceGuard: No productVariantsBulkUpdate field in result"
      );
    } else if (bulkResult.userErrors?.length) {
      console.error(
        `❌ PriceGuard: User errors`,
        JSON.stringify(bulkResult.userErrors, null, 2)
      );
    } else {
      for (const v of bulkResult.productVariants || []) {
        console.log(`💰 PriceGuard: Restored variant ${v.id} to ${v.price}`);
      }
    }
  } catch (err) {
    console.error("❌ PriceGuard: GraphQL call failed (exception)", err);
  }

  // Always respond 200 to the webhook
  return new Response();
};

// Simple loader so hitting the URL in a browser doesn’t 404
export const loader = () => new Response("OK");
