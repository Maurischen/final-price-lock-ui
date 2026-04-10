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

  if (topic !== "PRODUCTS_UPDATE") {
    return new Response();
  }

  console.log(`🧩 Received webhook topic=${topic} for shop=${shop}`);

  if (!payload?.variants || !Array.isArray(payload.variants)) {
    console.log("⚠️ No variants array on payload");
    return new Response();
  }

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
    return new Response();
  }

  const variantsToFix = [];
  const correctedRuleIds = [];

  for (const variant of payload.variants) {
    const sku = variant.sku?.trim();
    const variantId = variant.admin_graphql_api_id;

    if (!variantId && !sku) {
      continue;
    }

    let rule = null;

    // 1) Preferred lookup: shop + variantId
    if (variantId) {
      rule = await db.priceGuard.findFirst({
        where: {
          shop,
          variantId,
          isEnabled: true,
        },
      });
    }

    // 2) Fallback: legacy shop + sku
    if (!rule && sku) {
      rule = await db.priceGuard.findUnique({
        where: {
          shop_sku: { shop, sku },
        },
      });
    }

    if (!rule || !rule.isEnabled) {
      continue;
    }

    const currentPrice = parseFloat(variant.price);

    if (Number.isNaN(currentPrice)) {
      console.log(
        `⚠️ ${sku || variantId}: variant has no numeric price, skipping`,
      );
      continue;
    }

    // Prevent instant self-trigger loops
    if (
      rule.lastCorrectedAt &&
      Date.now() - new Date(rule.lastCorrectedAt).getTime() < 30000
    ) {
      console.log(`⏭️ ${sku || variantId}: recently corrected, skipping`);
      continue;
    }

    const mode = rule.mode || "MIN_ONLY";
    let shouldFix = false;
    let targetPrice = null;

    if (mode === "MIN_ONLY") {
      const minPrice = Number(rule.minPrice);
      targetPrice = minPrice;
      shouldFix = currentPrice < minPrice;

      if (!shouldFix) {
        console.log(
          `✅ ${sku || variantId}: price ${currentPrice} >= min ${minPrice}, nothing to do`,
        );
      }
    } else if (mode === "EXACT_LOCK") {
      const lockedPrice = Number(rule.lockedPrice);

      if (Number.isNaN(lockedPrice)) {
        console.log(
          `⚠️ ${sku || variantId}: EXACT_LOCK rule has no valid lockedPrice, skipping`,
        );
        continue;
      }

      targetPrice = lockedPrice;
      shouldFix = currentPrice !== lockedPrice;

      if (!shouldFix) {
        console.log(
          `✅ ${sku || variantId}: price ${currentPrice} matches locked price ${lockedPrice}`,
        );
      }
    } else {
      console.log(
        `⚠️ ${sku || variantId}: unknown mode "${mode}", skipping`,
      );
      continue;
    }

    if (!shouldFix) {
      continue;
    }

    if (!variantId) {
      console.log(`⚠️ ${sku}: no variantId on webhook payload, skipping fix`);
      continue;
    }

    console.log(
      `🚨 ${sku || variantId}: price ${currentPrice} should be ${targetPrice}, restoring…`,
    );

    variantsToFix.push({
      id: variantId,
      price: targetPrice.toFixed(2),
    });

    correctedRuleIds.push(rule.id);
  }

  if (!variantsToFix.length) {
    return new Response();
  }

  const productId =
    payload.admin_graphql_api_id ??
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

      if (correctedRuleIds.length) {
        await db.priceGuard.updateMany({
          where: {
            id: { in: correctedRuleIds },
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

  return new Response();
};

export const loader = () => new Response("OK");