import db from "../db.server";

function isRuleLive(rule, now = new Date()) {
  if (!rule?.isActive) return false;
  if (rule.startsAt && now < new Date(rule.startsAt)) return false;
  if (rule.endsAt && now > new Date(rule.endsAt)) return false;
  return true;
}

function normalizeString(value) {
  return String(value || "").trim().toLowerCase();
}

function getRuleOffers(rule) {
  if (!Array.isArray(rule?.offerProducts)) return [];

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
      return !!rule.triggerSku && normalizeString(rule.triggerSku) === normalizeString(sku);
    case "TAG":
      return tags.map(normalizeString).includes(normalizeString(rule.triggerTag));
    case "CART_VALUE":
      return false;
    default:
      return false;
  }
}

function matchesCartContext(rule, context) {
  const cart = context?.cart || {};
  const lines = Array.isArray(cart?.lines) ? cart.lines : [];
  const subtotal = Number(cart?.subtotalAmount || 0);

  if (rule.triggerMode === "CART_VALUE") {
    if (rule.minCartValue != null && subtotal < Number(rule.minCartValue)) return false;
    if (rule.maxCartValue != null && subtotal > Number(rule.maxCartValue)) return false;
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
          return !cartAlreadyHasOffer(context.cart, offer);
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