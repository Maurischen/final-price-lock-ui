import { authenticate, unauthenticated } from "../shopify.server";
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
  // Verify webhook + get context
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`🧩 Received webhook topic=${topic} for shop=${shop}`);

  if (topic !== "PRODUCTS_UPDATE") {
    return new Response();
  }

  if (!payload?.variants || !Array.isArray(payload.variants)) {
    console.log("⚠️ No variants found on payload");
    return new Response();
  }

  const productId = payload.admin_graphql_api_id;
  if (!productId) {
    console.error("[PriceGuard] Missing product admin_graphql_api_id in payload");
    return new Response();
  }

  // Get an authenticated Admin client for this shop
  const { admin } = await unauthenticated.admin(shop);

  for (const variant of payload.variants) {
    const sku = variant.sku?.trim();
    if (!sku) continue;

    const rule = await db.priceGuard.findUnique({
      where: { sku },
    });

    if (!rule) {
      // Not a guarded SKU – just skip silently or log if you want
      // console.log(`➡️ No PriceGuard rule for SKU ${sku}, skipping`);
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

    const variables = {
      productId,
      variants: [
        {
          id: variant.admin_graphql_api_id,
          price: minPrice.toFixed(2),
        },
      ],
    };

    try {
      // In @shopify/shopify-api v12, admin.graphql returns parsed JSON,
      // not a fetch Response
      const result = await admin.graphql(
        PRICE_GUARD_VARIANT_UPDATE_MUTATION,
        { variables }
      );

      console.log(
        `[PriceGuard] Raw GraphQL result for ${sku}:`,
        JSON.stringify(result, null, 2)
      );

      const bulkResult = result?.data?.productVariantsBulkUpdate;

      if (bulkResult?.userErrors?.length) {
        console.error(
          `❌ PriceGuard: User errors for ${sku}`,
          JSON.stringify(bulkResult.userErrors, null, 2)
        );
      } else {
        const updatedVariant = bulkResult?.productVariants?.[0];
        console.log(
          `💰 PriceGuard: Restored ${sku} to ${updatedVariant?.price}`
        );
      }
    } catch (err) {
      console.error("❌ PriceGuard: GraphQL call failed (exception)", err);
    }
  }

  // Always respond 200 to the webhook
  return new Response();
};

// Simple loader so hitting the URL in a browser doesn’t 404
export const loader = () => new Response("OK");
