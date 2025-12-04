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

  // 🔑 Get an authenticated Admin client for this shop
  const { admin } = await unauthenticated.admin(shop);

  for (const variant of payload.variants) {
    const sku = variant.sku?.trim();
    if (!sku) continue;

    const rule = await db.priceGuard.findUnique({
      where: { sku },
    });

    if (!rule) {
      // Not a guarded SKU – just skip
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

    // ⚠️ productVariantsBulkUpdate needs the product GID.
    // PRODUCT_UPDATE payload has a numeric product ID on payload.id,
    // and each variant has admin_graphql_api_id like:
    //   gid://shopify/ProductVariant/123456789
    //
    // Easiest is to derive product GID from the variant GID:
    const variantGid = variant.admin_graphql_api_id;
    const productGid = variantGid.replace("ProductVariant", "Product");

    const variables = {
      productId: productGid,
      variants: [
        {
          id: variantGid,
          price: minPrice.toFixed(2),
        },
      ],
    };

    try {
      const { data, errors } = await admin.graphql(
        PRICE_GUARD_VARIANT_UPDATE_MUTATION,
        { variables }
      );

      console.log(
        `[PriceGuard] Raw GraphQL result for ${sku}:`,
        JSON.stringify(data ?? {}, null, 2)
      );

      if (errors?.length) {
        console.error(
          `❌ PriceGuard: Top-level GraphQL errors for ${sku}`,
          JSON.stringify(errors, null, 2)
        );
      }

      const bulkResult = data?.productVariantsBulkUpdate;

      if (bulkResult?.userErrors?.length) {
        console.error(
          `❌ PriceGuard: User errors for ${sku}`,
          JSON.stringify(bulkResult.userErrors, null, 2)
        );
      } else {
        const updatedVariant = bulkResult?.productVariants?.[0];
        console.log(
          `💰 PriceGuard: Restored ${sku} to ${
            updatedVariant?.price ?? minPrice
          }`
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
