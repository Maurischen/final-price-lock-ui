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
 * Convert a rule into a normalized offers[] array.
 * Supports:
 * - new child-table offerProducts[]
 * - legacy single-offer fields
 */
function getRuleOffers(rule) {
  if (Array.isArray(rule?.offerProducts) && rule.offerProducts.length > 0) {
    return rule.offerProducts
      .filter((offer) => offer?.isActive !== false)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((offer) => ({
        id: offer.id,
        mode: offer.offerMode,
        productId: offer.offerProductId,
        variantId: offer.offerVariantId,
        sku: offer.offerSku,
        titleOverride: offer.offerTitleOverride,
        message: offer.offerMessage,
        discount: {
          mode: offer.discountMode,
          value: offer.discountValue,
          label: offer.discountLabel,
        },
        rawOffer: offer,
      }));
  }

  // legacy single-offer fallback
  if (rule?.offerProductId || rule?.offerVariantId || rule?.offerSku) {
    return [
      {
        id: null,
        mode: rule.offerMode,
        productId: rule.offerProductId,
        variantId: rule.offerVariantId,
        sku: rule.offerSku,
        titleOverride: rule.offerTitleOverride,
        message: rule.offerMessage,
        discount: {
          mode: rule.discountMode,
          value: rule.discountValue,
          label: rule.discountLabel,
        },
        rawOffer: null,
      },
    ];
  }

  return [];
}

/**
 * Checks whether cart already contains a specific offer.
 */
function cartAlreadyHasOffer(cart, offer) {
  const lines = Array.isArray(cart?.lines) ? cart.lines : [];

  return lines.some((line) => {
    const merch = line?.merchandise || {};

    return (
      (offer.productId && merch.productId === offer.productId) ||
      (offer.variantId && merch.id === offer.variantId) ||
      (offer.sku &&
        normalizeString(merch.sku) === normalizeString(offer.sku))
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
 * Main resolver for storefront/admin preview use.
 * Supports multiple offers per rule.
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
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });

  const matchedRules = rules
    .filter((rule) => {
      if (!isRuleLive(rule)) return false;

      const isMatch =
        placement === "PRODUCT_PAGE"
          ? matchesProductContext(rule, context)
          : matchesCartContext(rule, context);

      return isMatch;
    })
    .map((rule) => {
      const offers = getRuleOffers(rule).filter((offer) => {
        if (rule.hideIfOfferInCart && context?.cart) {
          if (cartAlreadyHasOffer(context.cart, offer)) {
            return false;
          }
        }

        return true;
      });

      return {
        id: rule.id,
        name: rule.name,
        type: rule.type,
        placement: rule.placement,
        priority: rule.priority,
        offers,
        // legacy single-offer compatibility for old frontend code
        offer: offers[0] || null,
        rawRule: rule,
      };
    })
    .filter((rule) => rule.offers.length > 0);

  return {
    ok: true,
    count: matchedRules.length,
    rules: matchedRules,
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