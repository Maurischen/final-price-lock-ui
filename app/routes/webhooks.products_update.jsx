import { authenticate, unauthenticated } from "../shopify.server";
import db from "../db.server";

const PRICE_GUARD_VARIANT_UPDATE_MUTATION = `
  mutation PriceGuardVariantUpdate($input: ProductVariantInput!) {
    productVariantUpdate(input: $input) {
      productVariant {
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

  // Get an authenticated Admin client for this shop
  const { admin } = await unauthenticated.admin(shop);

  for (const variant of payload.variants) {
    const sku = variant.sku?.trim();
    if (!sku) continue;

    const rule = await db.priceGuard.findUnique({
      where: { sku },
    });

    if (!rule) {
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

    const variables = {
      input: {
        id: variant.admin_graphql_api_id,
        price: minPrice.toFixed(2),
      },
    };

    try {
      const response = await admin.graphql(
        PRICE_GUARD_VARIANT_UPDATE_MUTATION,
        { variables }
      );

      const result = await response.json();

      console.log(
        `[PriceGuard] Raw GraphQL result for ${sku}:`,
        JSON.stringify(result, null, 2)
      );

      const updateResult = result?.data?.productVariantUpdate;

      if (result?.errors?.length) {
        console.error(
          `❌ PriceGuard: Top-level GraphQL errors for ${sku}`,
          JSON.stringify(result.errors, null, 2)
        );
      }

      if (updateResult?.userErrors?.length) {
        console.error(
          `❌ PriceGuard: User errors for ${sku}`,
          JSON.stringify(updateResult.userErrors, null, 2)
        );
      } else {
        console.log(
          `💰 PriceGuard: Restored ${sku} to ${updateResult?.productVariant?.price}`
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
