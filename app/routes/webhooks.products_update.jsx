import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
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
  // Same pattern as your app_uninstalled webhook
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Safety guard
  if (!payload?.variants || !Array.isArray(payload.variants)) {
    return new Response();
  }

  // Go through each variant in the updated product
  for (const variant of payload.variants) {
    const sku = variant.sku?.trim();
    if (!sku) continue;

    // Look up your min price rule by SKU
    const rule = await db.priceGuard.findUnique({
      where: { sku },
    });

    if (!rule) continue; // no rule → ignore

    const currentPrice = parseFloat(variant.price);
    const minPrice = rule.minPrice;

    if (isNaN(currentPrice) || currentPrice >= minPrice) {
      // Price is fine (>= min) → do nothing
      continue;
    }

    console.log(
      `[PriceGuard] ${shop} / SKU ${sku}: price ${currentPrice} < min ${minPrice}. Restoring…`
    );

    // Build GraphQL request to Shopify Admin
    // Use your stored offline session's shop + access token
    const shopDomain = session.shop || shop;
    const endpoint = `https://${shopDomain}/admin/api/2023-10/graphql.json`; 
    // ^ you can change the API version to match your shopify.app.toml if needed

    const variables = {
      input: {
        id: variant.admin_graphql_api_id,
        price: minPrice.toFixed(2),
      },
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": session.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: PRICE_GUARD_VARIANT_UPDATE_MUTATION,
        variables,
      }),
    });

    const result = await resp.json();

    const updateResult = result?.data?.productVariantUpdate;

    if (updateResult?.userErrors?.length) {
      console.error(
        "[PriceGuard] Failed to restore variant price:",
        updateResult.userErrors
      );
    } else {
      console.log(
        `[PriceGuard] Restored ${sku} to ${updateResult?.productVariant?.price}`
      );
    }
  }

  return new Response();
};

// Optional loader so hitting the URL in a browser doesn’t 404
export const loader = () => json({ ok: true });
