import db from "../db.server";

/**
 * Normalizes blank string values to null so Prisma stores cleaner data.
 */
function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

/**
 * Converts truthy form values safely to booleans.
 */
function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase().trim();
  return ["true", "1", "yes", "on"].includes(normalized);
}

/**
 * Converts numeric input safely to number or null.
 */
function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Converts date input safely to Date or null.
 */
function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Builds a clean Prisma payload for UpsellRule create/update.
 * Accepts plain objects from formData or JSON.
 */
export function normalizeUpsellRuleInput(input = {}) {
  return {
    name: emptyToNull(input.name),
    type: emptyToNull(input.type),
    placement: emptyToNull(input.placement),
    triggerMode: emptyToNull(input.triggerMode),

    triggerProductId: emptyToNull(input.triggerProductId),
    triggerVariantId: emptyToNull(input.triggerVariantId),
    triggerSku: emptyToNull(input.triggerSku),
    triggerTag: emptyToNull(input.triggerTag),

    minCartValue: toNumber(input.minCartValue),
    maxCartValue: toNumber(input.maxCartValue),

    offerMode: emptyToNull(input.offerMode),
    offerProductId: emptyToNull(input.offerProductId),
    offerVariantId: emptyToNull(input.offerVariantId),
    offerSku: emptyToNull(input.offerSku),

    offerTitleOverride: emptyToNull(input.offerTitleOverride),
    offerMessage: emptyToNull(input.offerMessage),

    discountMode: emptyToNull(input.discountMode) || "NONE",
    discountValue: toNumber(input.discountValue),
    discountLabel: emptyToNull(input.discountLabel),

    priority: toNumber(input.priority) ?? 100,
    isActive: toBoolean(input.isActive, true),
    limitOnePerCart: toBoolean(input.limitOnePerCart, true),
    hideIfOfferInCart: toBoolean(input.hideIfOfferInCart, true),
    hideIfOfferOutOfStock: toBoolean(input.hideIfOfferOutOfStock, true),

    startsAt: toDate(input.startsAt),
    endsAt: toDate(input.endsAt),
  };
}

/**
 * Basic validation for required fields and common logic issues.
 */
export function validateUpsellRuleInput(input = {}) {
  const errors = {};

  if (!input.name) errors.name = "Name is required.";
  if (!input.type) errors.type = "Type is required.";
  if (!input.placement) errors.placement = "Placement is required.";
  if (!input.triggerMode) errors.triggerMode = "Trigger mode is required.";
  if (!input.offerMode) errors.offerMode = "Offer mode is required.";

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
    case "CART_VALUE":
      if (input.minCartValue == null && input.maxCartValue == null) {
        errors.minCartValue = "Provide a min or max cart value for CART_VALUE mode.";
      }
      break;
    default:
      break;
  }

  switch (input.offerMode) {
    case "PRODUCT":
      if (!input.offerProductId) {
        errors.offerProductId = "Offer product is required for PRODUCT mode.";
      }
      break;
    case "VARIANT":
      if (!input.offerVariantId) {
        errors.offerVariantId = "Offer variant is required for VARIANT mode.";
      }
      break;
    case "SKU":
      if (!input.offerSku) {
        errors.offerSku = "Offer SKU is required for SKU mode.";
      }
      break;
    default:
      break;
  }

  if (
    input.startsAt &&
    input.endsAt &&
    new Date(input.startsAt).getTime() > new Date(input.endsAt).getTime()
  ) {
    errors.endsAt = "End date must be after start date.";
  }

  if (input.discountMode && input.discountMode !== "NONE") {
    if (input.discountValue == null || Number(input.discountValue) <= 0) {
      errors.discountValue = "Discount value must be greater than 0.";
    }
  }

  return errors;
}

export async function listUpsellRules(shop) {
  return db.upsellRule.findMany({
    where: { shop },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getUpsellRuleById(id, shop) {
  if (!id || !shop) return null;

  return db.upsellRule.findFirst({
    where: { id, shop },
  });
}

export async function createUpsellRule(shop, rawInput) {
  const normalized = normalizeUpsellRuleInput(rawInput);
  const errors = validateUpsellRuleInput(normalized);

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const rule = await db.upsellRule.create({
    data: {
      shop,
      ...normalized,
    },
  });

  return {
    ok: true,
    rule,
  };
}

export async function updateUpsellRule(id, shop, rawInput) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return {
      ok: false,
      errors: {
        general: "Upsell rule not found.",
      },
    };
  }

  const normalized = normalizeUpsellRuleInput(rawInput);
  const errors = validateUpsellRuleInput(normalized);

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const rule = await db.upsellRule.update({
    where: { id: existing.id },
    data: normalized,
  });

  return {
    ok: true,
    rule,
  };
}

export async function deleteUpsellRule(id, shop) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return {
      ok: false,
      error: "Upsell rule not found.",
    };
  }

  await db.upsellRule.delete({
    where: { id: existing.id },
  });

  return {
    ok: true,
  };
}

export async function setUpsellRuleActive(id, shop, isActive) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return {
      ok: false,
      error: "Upsell rule not found.",
    };
  }

  const rule = await db.upsellRule.update({
    where: { id: existing.id },
    data: { isActive: Boolean(isActive) },
  });

  return {
    ok: true,
    rule,
  };
}

export async function duplicateUpsellRule(id, shop) {
  const existing = await getUpsellRuleById(id, shop);

  if (!existing) {
    return {
      ok: false,
      error: "Upsell rule not found.",
    };
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
      minCartValue: existing.minCartValue,
      maxCartValue: existing.maxCartValue,
      offerMode: existing.offerMode,
      offerProductId: existing.offerProductId,
      offerVariantId: existing.offerVariantId,
      offerSku: existing.offerSku,
      offerTitleOverride: existing.offerTitleOverride,
      offerMessage: existing.offerMessage,
      discountMode: existing.discountMode,
      discountValue: existing.discountValue,
      discountLabel: existing.discountLabel,
      priority: existing.priority,
      isActive: false,
      limitOnePerCart: existing.limitOnePerCart,
      hideIfOfferInCart: existing.hideIfOfferInCart,
      hideIfOfferOutOfStock: existing.hideIfOfferOutOfStock,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
    },
  });

  return {
    ok: true,
    rule: copy,
  };
}