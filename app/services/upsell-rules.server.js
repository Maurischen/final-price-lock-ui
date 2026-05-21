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

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeTriggerInput(trigger = {}, index = 0) {
  return {
    position: Number.isFinite(index) ? index : 0,
    triggerType: emptyToNull(trigger.triggerType) || emptyToNull(trigger.type) || "SKU",
    productId: emptyToNull(trigger.productId),
    variantId: emptyToNull(trigger.variantId),
    sku: emptyToNull(trigger.sku),
    collectionId: emptyToNull(trigger.collectionId),
    title: emptyToNull(trigger.title),
    handle: emptyToNull(trigger.handle),
  };
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

  const triggers = normalizeArray(input.triggers).map((trigger, index) =>
    normalizeTriggerInput(trigger, index),
  );

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

    triggers,

    triggerDiscountMode: emptyToNull(input.triggerDiscountMode) || "NONE",
    triggerDiscountValue: toNumber(input.triggerDiscountValue),
    triggerDiscountLabel: emptyToNull(input.triggerDiscountLabel),

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

  if (input.triggerDiscountMode && input.triggerDiscountMode !== "NONE") {
    if (input.triggerDiscountValue == null || Number(input.triggerDiscountValue) <= 0) {
      errors.triggerDiscountValue = "Trigger discount value must be greater than 0.";
    }
  }

  const hasTriggers = Array.isArray(input.triggers) && input.triggers.length > 0;

  switch (input.triggerMode) {
    case "PRODUCT":
      if (!input.triggerProductId && !hasTriggers) {
        errors.triggerProductId = "Trigger product is required for PRODUCT mode.";
      }
      break;
    case "VARIANT":
      if (!input.triggerVariantId && !hasTriggers) {
        errors.triggerVariantId = "Trigger variant is required for VARIANT mode.";
      }
      break;
    case "SKU":
      if (!input.triggerSku && !hasTriggers) {
        errors.triggerSku = "Trigger SKU is required for SKU mode.";
      }
      break;
    case "TAG":
      if (!input.triggerTag) {
        errors.triggerTag = "Trigger tag is required for TAG mode.";
      }
      break;
    case "COLLECTION":
      if (!input.triggerCollectionId && !hasTriggers) {
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

  input.triggers.forEach((trigger, index) => {
    switch (trigger.triggerType) {
      case "PRODUCT":
        if (!trigger.productId) {
          errors[`triggers.${index}.productId`] =
            `Trigger ${index + 1}: product ID is required.`;
        }
        break;
      case "VARIANT":
        if (!trigger.variantId) {
          errors[`triggers.${index}.variantId`] =
            `Trigger ${index + 1}: variant ID is required.`;
        }
        break;
      case "SKU":
        if (!trigger.sku) {
          errors[`triggers.${index}.sku`] =
            `Trigger ${index + 1}: SKU is required.`;
        }
        break;
      case "COLLECTION":
        if (!trigger.collectionId && !trigger.handle) {
          errors[`triggers.${index}.collectionId`] =
            `Trigger ${index + 1}: collection ID or handle is required.`;
        }
        break;
      default:
        errors[`triggers.${index}.triggerType`] =
          `Trigger ${index + 1}: trigger type is required.`;
    }
  });

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

function buildTriggerCreates(normalized) {
  return normalized.triggers.map((trigger, index) => ({
    position: index,
    triggerType: trigger.triggerType,
    productId: trigger.productId,
    variantId: trigger.variantId,
    sku: trigger.sku,
    collectionId: trigger.collectionId,
    title: trigger.title,
    handle: trigger.handle,
  }));
}

function ruleInclude() {
  return {
    offerProducts: {
      where: { isActive: true },
      orderBy: { position: "asc" },
    },
    triggers: {
      orderBy: { position: "asc" },
    },
  };
}

export async function listUpsellRules(shop) {
  return db.upsellRule.findMany({
    where: { shop },
    include: ruleInclude(),
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getUpsellRuleById(id, shop) {
  if (!id || !shop) return null;

  return db.upsellRule.findFirst({
    where: { id, shop },
    include: ruleInclude(),
  });
}

export async function createUpsellRule(shop, rawInput) {
  const normalized = normalizeUpsellRuleInput(rawInput);
  const errors = validateUpsellRuleInput(normalized);

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const triggerCreates = buildTriggerCreates(normalized);

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
      triggerDiscountMode: normalized.triggerDiscountMode,
      triggerDiscountValue: normalized.triggerDiscountValue,
      triggerDiscountLabel: normalized.triggerDiscountLabel,

      minCartValue: normalized.minCartValue,
      maxCartValue: normalized.maxCartValue,

      priority: normalized.priority,
      isActive: normalized.isActive,
      limitOnePerCart: normalized.limitOnePerCart,
      hideIfOfferInCart: normalized.hideIfOfferInCart,
      hideIfOfferOutOfStock: normalized.hideIfOfferOutOfStock,

      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,

      ...(triggerCreates.length > 0
        ? {
            triggers: {
              create: triggerCreates,
            },
          }
        : {}),

      offerProducts: {
        create: buildOfferCreates(normalized),
      },
    },
    include: ruleInclude(),
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

  const triggerCreates = buildTriggerCreates(normalized);

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
      triggerDiscountMode: normalized.triggerDiscountMode,
      triggerDiscountValue: normalized.triggerDiscountValue,
      triggerDiscountLabel: normalized.triggerDiscountLabel,

      minCartValue: normalized.minCartValue,
      maxCartValue: normalized.maxCartValue,

      priority: normalized.priority,
      isActive: normalized.isActive,
      limitOnePerCart: normalized.limitOnePerCart,
      hideIfOfferInCart: normalized.hideIfOfferInCart,
      hideIfOfferOutOfStock: normalized.hideIfOfferOutOfStock,

      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,

      triggers: {
        deleteMany: {},
        create: triggerCreates,
      },

      offerProducts: {
        deleteMany: {},
        create: buildOfferCreates(normalized),
      },
    },
    include: ruleInclude(),
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
    include: ruleInclude(),
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
      triggerDiscountMode: existing.triggerDiscountMode,
      triggerDiscountValue: existing.triggerDiscountValue,
      triggerDiscountLabel: existing.triggerDiscountLabel,

      minCartValue: existing.minCartValue,
      maxCartValue: existing.maxCartValue,

      priority: existing.priority,
      isActive: false,
      limitOnePerCart: existing.limitOnePerCart,
      hideIfOfferInCart: existing.hideIfOfferInCart,
      hideIfOfferOutOfStock: existing.hideIfOfferOutOfStock,

      startsAt: existing.startsAt,
      endsAt: existing.endsAt,

      triggers: {
        create: (existing.triggers || []).map((trigger, index) => ({
          position: index,
          triggerType: trigger.triggerType,
          productId: trigger.productId,
          variantId: trigger.variantId,
          sku: trigger.sku,
          collectionId: trigger.collectionId,
          title: trigger.title,
          handle: trigger.handle,
        })),
      },

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
    include: ruleInclude(),
  });

  return { ok: true, rule: copy };
}