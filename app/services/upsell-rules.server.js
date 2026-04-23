import db from "../db.server";

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase().trim();
  return ["true", "1", "yes", "on"].includes(normalized);
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOfferInput(offer = {}, index = 0) {
  return {
    position: Number.isFinite(index) ? index : 0,
    offerMode: emptyToNull(offer.offerMode) || "SKU",
    offerProductId: emptyToNull(offer.offerProductId),
    offerVariantId: emptyToNull(offer.offerVariantId),
    offerSku: emptyToNull(offer.offerSku),
    offerTitleOverride: emptyToNull(offer.offerTitleOverride),
    offerMessage: emptyToNull(offer.offerMessage),
    discountMode: emptyToNull(offer.discountMode) || "NONE",
    discountValue: toNumber(offer.discountValue),
    discountLabel: emptyToNull(offer.discountLabel),
    isActive: offer.isActive === undefined ? true : toBoolean(offer.isActive, true),
  };
}

export function normalizeUpsellRuleInput(input = {}) {
  const offers = Array.isArray(input.offers)
    ? input.offers.map((offer, index) => normalizeOfferInput(offer, index))
    : [];

  return {
    name: emptyToNull(input.name),
    type: emptyToNull(input.type),
    placement: emptyToNull(input.placement),
    triggerMode: emptyToNull(input.triggerMode),

    triggerProductId: emptyToNull(input.triggerProductId),
    triggerVariantId: emptyToNull(input.triggerVariantId),
    triggerSku: emptyToNull(input.triggerSku),
    triggerTag: emptyToNull(input.triggerTag),
    triggerCollectionId: emptyToNull(input.triggerCollectionId),

    minCartValue: toNumber(input.minCartValue),
    maxCartValue: toNumber(input.maxCartValue),

    priority: toNumber(input.priority) ?? 100,
    isActive: toBoolean(input.isActive, true),
    limitOnePerCart: toBoolean(input.limitOnePerCart, true),
    hideIfOfferInCart: toBoolean(input.hideIfOfferInCart, true),
    hideIfOfferOutOfStock: toBoolean(input.hideIfOfferOutOfStock, true),

    startsAt: toDate(input.startsAt),
    endsAt: toDate(input.endsAt),

    offers,
  };
}

export function validateUpsellRuleInput(input = {}) {
  const errors = {};

  if (!input.name) errors.name = "Name is required.";
  if (!input.type) errors.type = "Type is required.";
  if (!input.placement) errors.placement = "Placement is required.";
  if (!input.triggerMode) errors.triggerMode = "Trigger mode is required.";

  switch (input.triggerMode) {
    case "PRODUCT":
      if (!input.triggerProductId) {
        errors.triggerProductId = "Trigger product is required for PRODUCT mode.";
      }
      break;
    case "VARIANT":
      if (!input.triggerVariantId) {
        errors.triggerVariantId = "Trigger variant is required for VARIANT mode.";
      }
      break;
    case "SKU":
      if (!input.triggerSku) {
        errors.triggerSku = "Trigger SKU is required for SKU mode.";
      }
      break;
    case "TAG":
      if (!input.triggerTag) {
        errors.triggerTag = "Trigger tag is required for TAG mode.";
      }
      break;
    case "COLLECTION":
      if (!input.triggerCollectionId) {
        errors.triggerCollectionId =
          "Trigger collection ID is required for COLLECTION mode.";
      }
      break;
    case "CART_VALUE":
      if (input.minCartValue == null && input.maxCartValue == null) {
        errors.minCartValue = "Provide a min or max cart value for CART_VALUE mode.";
      }
      break;
    default:
      break;
  }

  if (input.startsAt && input.endsAt) {
    if (new Date(input.startsAt).getTime() > new Date(input.endsAt).getTime()) {
      errors.endsAt = "End date must be after start date.";
    }
  }

  if (!Array.isArray(input.offers) || input.offers.length === 0) {
    errors.offers = "At least one offer product is required.";
    return errors;
  }

  input.offers.forEach((offer, index) => {
    switch (offer.offerMode) {
      case "PRODUCT":
        if (!offer.offerProductId) {
          errors[`offers.${index}.offerProductId`] =
            `Offer ${index + 1}: product ID is required for PRODUCT mode.`;
        }
        break;
      case "VARIANT":
        if (!offer.offerVariantId) {
          errors[`offers.${index}.offerVariantId`] =
            `Offer ${index + 1}: variant ID is required for VARIANT mode.`;
        }
        break;
      case "SKU":
        if (!offer.offerSku) {
          errors[`offers.${index}.offerSku`] =
            `Offer ${index + 1}: SKU is required for SKU mode.`;
        }
        break;
      default:
        errors[`offers.${index}.offerMode`] =
          `Offer ${index + 1}: offer mode is required.`;
    }

    if (offer.discountMode && offer.discountMode !== "NONE") {
      if (offer.discountValue == null || Number(offer.discountValue) <= 0) {
        errors[`offers.${index}.discountValue`] =
          `Offer ${index + 1}: discount value must be greater than 0.`;
      }
    }
  });

  return errors;
}

function buildOfferCreates(normalized) {
  return normalized.offers.map((offer, index) => ({
    position: index,
    offerMode: offer.offerMode,
    offerProductId: offer.offerProductId,
    offerVariantId: offer.offerVariantId,
    offerSku: offer.offerSku,
    offerTitleOverride: offer.offerTitleOverride,
    offerMessage: offer.offerMessage,
    discountMode: offer.discountMode,
    discountValue: offer.discountValue,
    discountLabel: offer.discountLabel,
    isActive: offer.isActive,
  }));
}

export async function listUpsellRules(shop) {
  return db.upsellRule.findMany({
    where: { shop },
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getUpsellRuleById(id, shop) {
  if (!id || !shop) return null;

  return db.upsellRule.findFirst({
    where: { id, shop },
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
  });
}

export async function createUpsellRule(shop, rawInput) {
  const normalized = normalizeUpsellRuleInput(rawInput);
  const errors = validateUpsellRuleInput(normalized);

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const rule = await db.upsellRule.create({
    data: {
      shop,
      name: normalized.name,
      type: normalized.type,
      placement: normalized.placement,
      triggerMode: normalized.triggerMode,

      triggerProductId: normalized.triggerProductId,
      triggerVariantId: normalized.triggerVariantId,
      triggerSku: normalized.triggerSku,
      triggerTag: normalized.triggerTag,
      triggerCollectionId: normalized.triggerCollectionId,

      minCartValue: normalized.minCartValue,
      maxCartValue: normalized.maxCartValue,

      priority: normalized.priority,
      isActive: normalized.isActive,
      limitOnePerCart: normalized.limitOnePerCart,
      hideIfOfferInCart: normalized.hideIfOfferInCart,
      hideIfOfferOutOfStock: normalized.hideIfOfferOutOfStock,

      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,

      offerProducts: {
        create: buildOfferCreates(normalized),
      },
    },
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
  });

  return { ok: true, rule };
}

export async function updateUpsellRule(id, shop, rawInput) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return {
      ok: false,
      errors: { general: "Upsell rule not found." },
    };
  }

  const normalized = normalizeUpsellRuleInput(rawInput);
  const errors = validateUpsellRuleInput(normalized);

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const rule = await db.upsellRule.update({
    where: { id: existing.id },
    data: {
      name: normalized.name,
      type: normalized.type,
      placement: normalized.placement,
      triggerMode: normalized.triggerMode,

      triggerProductId: normalized.triggerProductId,
      triggerVariantId: normalized.triggerVariantId,
      triggerSku: normalized.triggerSku,
      triggerTag: normalized.triggerTag,
      triggerCollectionId: normalized.triggerCollectionId,

      minCartValue: normalized.minCartValue,
      maxCartValue: normalized.maxCartValue,

      priority: normalized.priority,
      isActive: normalized.isActive,
      limitOnePerCart: normalized.limitOnePerCart,
      hideIfOfferInCart: normalized.hideIfOfferInCart,
      hideIfOfferOutOfStock: normalized.hideIfOfferOutOfStock,

      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,

      offerProducts: {
        deleteMany: {},
        create: buildOfferCreates(normalized),
      },
    },
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
  });

  return { ok: true, rule };
}

export async function deleteUpsellRule(id, shop) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return { ok: false, error: "Upsell rule not found." };
  }

  await db.upsellRule.delete({
    where: { id: existing.id },
  });

  return { ok: true };
}

export async function setUpsellRuleActive(id, shop, isActive) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return { ok: false, error: "Upsell rule not found." };
  }

  const rule = await db.upsellRule.update({
    where: { id: existing.id },
    data: { isActive: Boolean(isActive) },
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
  });

  return { ok: true, rule };
}

export async function duplicateUpsellRule(id, shop) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return { ok: false, error: "Upsell rule not found." };
  }

  const copy = await db.upsellRule.create({
    data: {
      shop: existing.shop,
      name: `${existing.name} (Copy)`,
      type: existing.type,
      placement: existing.placement,
      triggerMode: existing.triggerMode,

      triggerProductId: existing.triggerProductId,
      triggerVariantId: existing.triggerVariantId,
      triggerSku: existing.triggerSku,
      triggerTag: existing.triggerTag,
      triggerCollectionId: existing.triggerCollectionId,

      minCartValue: existing.minCartValue,
      maxCartValue: existing.maxCartValue,

      priority: existing.priority,
      isActive: false,
      limitOnePerCart: existing.limitOnePerCart,
      hideIfOfferInCart: existing.hideIfOfferInCart,
      hideIfOfferOutOfStock: existing.hideIfOfferOutOfStock,

      startsAt: existing.startsAt,
      endsAt: existing.endsAt,

      offerProducts: {
        create: (existing.offerProducts || []).map((offer, index) => ({
          position: index,
          offerMode: offer.offerMode,
          offerProductId: offer.offerProductId,
          offerVariantId: offer.offerVariantId,
          offerSku: offer.offerSku,
          offerTitleOverride: offer.offerTitleOverride,
          offerMessage: offer.offerMessage,
          discountMode: offer.discountMode,
          discountValue: offer.discountValue,
          discountLabel: offer.discountLabel,
          isActive: offer.isActive,
        })),
      },
    },
    include: {
      offerProducts: {
        where: { isActive: true },
        orderBy: { position: "asc" },
      },
    },
  });

  return { ok: true, rule: copy };
}