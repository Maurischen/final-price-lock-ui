import db from "../db.server";

/**
 * Checks if a rule is currently active and within its schedule window.
 */
function isRuleLive(rule, now = new Date()) {
  if (!rule?.isActive) return false;
  if (rule.startsAt && now < new Date(rule.startsAt)) return false;
  if (rule.endsAt && now > new Date(rule.endsAt)) return false;
  return true;
}

/**
 * Normalize strings for safer SKU / tag comparisons.
 */
function normalizeString(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Checks whether a cart already contains the offer.
 */
function cartAlreadyHasOffer(cart, rule) {
  const lines = Array.isArray(cart?.lines) ? cart.lines : [];

  return lines.some((line) => {
    const merch = line?.merchandise || {};

    return (
      (rule.offerProductId && merch.productId === rule.offerProductId) ||
      (rule.offerVariantId && merch.id === rule.offerVariantId) ||
      (rule.offerSku &&
        normalizeString(merch.sku) === normalizeString(rule.offerSku))
    );
  });
}

/**
 * Product-context match:
 * Used for PRODUCT_PAGE or other single-product lookups.
 */
function matchesProductContext(rule, context) {
  const productId = context?.productId || null;
  const variantId = context?.variantId || null;
  const sku = context?.sku || null;
  const tags = Array.isArray(context?.tags) ? context.tags : [];

  switch (rule.triggerMode) {
    case "PRODUCT":
      return !!rule.triggerProductId && rule.triggerProductId === productId;

    case "VARIANT":
      return !!rule.triggerVariantId && rule.triggerVariantId === variantId;

    case "SKU":
      return (
        !!rule.triggerSku &&
        normalizeString(rule.triggerSku) === normalizeString(sku)
      );

    case "TAG":
      return tags.map(normalizeString).includes(normalizeString(rule.triggerTag));

    case "CART_VALUE":
      return false;

    default:
      return false;
  }
}

/**
 * Cart-context match:
 * Used for cart page / cart drawer upsells.
 */
function matchesCartContext(rule, context) {
  const cart = context?.cart || {};
  const lines = Array.isArray(cart?.lines) ? cart.lines : [];
  const subtotal = Number(cart?.subtotalAmount || 0);

  if (rule.triggerMode === "CART_VALUE") {
    if (rule.minCartValue != null && subtotal < Number(rule.minCartValue)) {
      return false;
    }

    if (rule.maxCartValue != null && subtotal > Number(rule.maxCartValue)) {
      return false;
    }

    return true;
  }

  return lines.some((line) => {
    const merch = line?.merchandise || {};
    return matchesProductContext(rule, {
      productId: merch.productId,
      variantId: merch.id,
      sku: merch.sku,
      tags: merch.productTags || [],
    });
  });
}

/**
 * Very basic offer payload formatter.
 * Later this can be enriched with Shopify product lookups.
 */
function formatResolvedRule(rule) {
  return {
    id: rule.id,
    name: rule.name,
    type: rule.type,
    placement: rule.placement,
    priority: rule.priority,
    offer: {
      mode: rule.offerMode,
      productId: rule.offerProductId,
      variantId: rule.offerVariantId,
      sku: rule.offerSku,
      titleOverride: rule.offerTitleOverride,
      message: rule.offerMessage,
    },
    discount: {
      mode: rule.discountMode,
      value: rule.discountValue,
      label: rule.discountLabel,
    },
    rawRule: rule,
  };
}

/**
 * Main resolver for storefront/admin preview use.
 *
 * Usage examples:
 *
 * resolveUpsells({
 *   shop,
 *   placement: "PRODUCT_PAGE",
 *   context: {
 *     productId,
 *     variantId,
 *     sku,
 *     tags,
 *     cart,
 *   },
 * })
 *
 * resolveUpsells({
 *   shop,
 *   placement: "CART",
 *   context: {
 *     cart: {
 *       subtotalAmount: 999,
 *       lines: [
 *         {
 *           merchandise: {
 *             id: "...",
 *             productId: "...",
 *             sku: "...",
 *             productTags: ["monitor"]
 *           }
 *         }
 *       ]
 *     }
 *   }
 * })
 */
export async function resolveUpsells({ shop, placement, context = {} }) {
  if (!shop || !placement) {
    return {
      ok: false,
      error: "shop and placement are required.",
      rules: [],
    };
  }

  const rules = await db.upsellRule.findMany({
    where: {
      shop,
      placement,
      isActive: true,
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });

  const matchedRules = rules.filter((rule) => {
    if (!isRuleLive(rule)) return false;

    const isMatch =
      placement === "PRODUCT_PAGE"
        ? matchesProductContext(rule, context)
        : matchesCartContext(rule, context);

    if (!isMatch) return false;

    if (rule.hideIfOfferInCart && context?.cart) {
      if (cartAlreadyHasOffer(context.cart, rule)) {
        return false;
      }
    }

    return true;
  });

  const resolved = matchedRules.map(formatResolvedRule);

  return {
    ok: true,
    count: resolved.length,
    rules: resolved,
  };
}

/**
 * Optional helper to preview a single product context.
 */
export async function resolveProductPageUpsells({
  shop,
  productId = null,
  variantId = null,
  sku = null,
  tags = [],
  cart = null,
}) {
  return resolveUpsells({
    shop,
    placement: "PRODUCT_PAGE",
    context: {
      productId,
      variantId,
      sku,
      tags,
      cart,
    },
  });
}

/**
 * Optional helper to preview cart context.
 */
export async function resolveCartUpsells({
  shop,
  cart,
  placement = "CART",
}) {
  return resolveUpsells({
    shop,
    placement,
    context: { cart },
  });
}