import {
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} CartInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} Result
 */

const OPEN_BOX_DISCOUNT_PERCENT = 25;
const OPEN_BOX_CONDITION_VALUE = "Open Box";

/**
 * ===== HELPERS =====
 */

function getCartLineAttribute(cartLine) {
  return cartLine.attribute && typeof cartLine.attribute.value === "string"
    ? cartLine.attribute.value
    : null;
}

function formatAmount(amount) {
  return Number(amount || 0).toFixed(2);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function getVariant(cartLine) {
  const merchandise = cartLine.merchandise;

  if (!merchandise || merchandise.__typename !== "ProductVariant") {
    return null;
  }

  return merchandise;
}

function getVariantSku(cartLine) {
  const variant = getVariant(cartLine);
  return typeof variant?.sku === "string" ? variant.sku : null;
}

function getVariantId(cartLine) {
  const variant = getVariant(cartLine);
  return typeof variant?.id === "string" ? variant.id : null;
}

function getProductId(cartLine) {
  const variant = getVariant(cartLine);
  return typeof variant?.product?.id === "string" ? variant.product.id : null;
}

function getTotalQtyByRule(lines, rule) {
  let total = 0;

  for (const line of lines) {
    if (lineMatchesTrigger(line, rule)) {
      total += Number(line.quantity || 0);
    }
  }

  return total;
}

function buildFixedAmountCandidate(lineId, quantity, discountAmount, message) {
  return {
    message,
    targets: [
      {
        cartLine: {
          id: lineId,
          quantity,
        },
      },
    ],
    value: {
      fixedAmount: {
        amount: formatAmount(discountAmount),
        appliesToEachItem: true,
      },
    },
  };
}

function buildPercentageCandidate(lineId, quantity, percentage, message) {
  return {
    message,
    targets: [
      {
        cartLine: {
          id: lineId,
          quantity,
        },
      },
    ],
    value: {
      percentage: {
        value: String(Number(percentage || 0)),
      },
    },
  };
}

function buildDiscountCandidate(lineId, quantity, accessory, message) {
  const discountMode = accessory.discountMode || "FIXED";

  if (discountMode === "PERCENTAGE") {
    return buildPercentageCandidate(
      lineId,
      quantity,
      accessory.discountPercentage || accessory.discountValue,
      message,
    );
  }

  return buildFixedAmountCandidate(
    lineId,
    quantity,
    accessory.discountAmount || accessory.discountValue,
    message,
  );
}

function buildTriggerDiscountCandidate(lineId, quantity, rule) {
  const discountMode = rule.triggerDiscountMode || "NONE";

  if (discountMode === "NONE") return null;

  const message =
    rule.triggerDiscountLabel ||
    rule.message ||
    "Bundle discount";

  const triggerDiscount = {
    discountMode,
    discountValue: rule.triggerDiscountValue,
  };

  return buildDiscountCandidate(lineId, quantity, triggerDiscount, message);
}

function lineMatchesTrigger(line, rule) {
  const sku = getVariantSku(line);
  const variantId = getVariantId(line);
  const productId = getProductId(line);

  const triggerSkus = Array.isArray(rule.triggerSkus)
    ? rule.triggerSkus
    : rule.triggerSku
      ? [rule.triggerSku]
      : [];

  const triggerVariantIds = Array.isArray(rule.triggerVariantIds)
    ? rule.triggerVariantIds
    : rule.triggerVariantId
      ? [rule.triggerVariantId]
      : [];

  const triggerProductIds = Array.isArray(rule.triggerProductIds)
    ? rule.triggerProductIds
    : rule.triggerProductId
      ? [rule.triggerProductId]
      : [];

  const skuMatch =
    sku &&
    triggerSkus.some((triggerSku) => normalize(triggerSku) === normalize(sku));

  const variantMatch =
    variantId &&
    triggerVariantIds.some((id) => normalize(id) === normalize(variantId));

  const productMatch =
    productId &&
    triggerProductIds.some((id) => normalize(id) === normalize(productId));

  return Boolean(skuMatch || variantMatch || productMatch);
}

function lineMatchesAccessory(line, accessory) {
  const sku = getVariantSku(line);
  const variantId = getVariantId(line);
  const productId = getProductId(line);

  const skuMatch =
    accessory.sku && sku && normalize(accessory.sku) === normalize(sku);

  const variantMatch =
    accessory.variantId &&
    variantId &&
    normalize(accessory.variantId) === normalize(variantId);

  const productMatch =
    accessory.productId &&
    productId &&
    normalize(accessory.productId) === normalize(productId);

  return Boolean(skuMatch || variantMatch || productMatch);
}

/**
 * ===== OPEN BOX =====
 */

function buildOpenBoxCandidates(input) {
  const candidates = [];

  for (const cartLine of input.cart.lines) {
    if (cartLine.merchandise.__typename !== "ProductVariant") continue;

    const condition = getCartLineAttribute(cartLine);
    if (condition !== OPEN_BOX_CONDITION_VALUE) continue;

    const price = Number(cartLine.cost.amountPerQuantity.amount);
    if (!price || price <= 0) continue;

    const discount = price * (OPEN_BOX_DISCOUNT_PERCENT / 100);

    candidates.push(
      buildFixedAmountCandidate(
        cartLine.id,
        null,
        discount,
        `Open Box ${OPEN_BOX_DISCOUNT_PERCENT}% off`,
      ),
    );
  }

  return candidates;
}

/**
 * ===== GET RULES FROM METAFIELD =====
 */

function getBundleRules(input) {
  const config = input.discount?.metafield?.jsonValue;

  if (!config || !Array.isArray(config.rules)) {
    return [];
  }

  return config.rules;
}

/**
 * ===== BUNDLE LOGIC =====
 */

function buildBundleCandidates(input) {
  const candidates = [];
  const lines = input.cart.lines;
  const rules = getBundleRules(input);

  for (const rule of rules) {
    if (!rule.active) continue;

    const triggerQty = getTotalQtyByRule(lines, rule);

    if (!triggerQty || triggerQty <= 0) continue;

    const maxDiscountable = triggerQty * (Number(rule.ratio || 1) || 1);

    // Discount the trigger/main item if configured
    for (const line of lines) {
      if (!lineMatchesTrigger(line, rule)) continue;

      const lineQty = Number(line.quantity || 0);
      if (!lineQty || lineQty <= 0) continue;

      const qty = Math.min(lineQty, triggerQty);

      const triggerCandidate = buildTriggerDiscountCandidate(
        line.id,
        qty,
        rule,
      );

      if (triggerCandidate) {
        candidates.push(triggerCandidate);
      }
    }

    // Discount the accessory/offer items
    for (const accessory of rule.accessories || []) {
      let remaining = maxDiscountable;

      for (const line of lines) {
        if (remaining <= 0) break;

        if (!lineMatchesAccessory(line, accessory)) continue;

        const lineQty = Number(line.quantity || 0);
        if (!lineQty || lineQty <= 0) continue;

        const qty = Math.min(lineQty, remaining);

        const message =
          accessory.label ||
          rule.message ||
          "Bundle discount";

        const candidate = buildDiscountCandidate(
          line.id,
          qty,
          accessory,
          message,
        );

        candidates.push(candidate);

        remaining -= qty;
      }
    }
  }

  return candidates;
}

/**
 * ===== MAIN =====
 */

export function cartLinesDiscountsGenerateRun(input) {
  const operations = [];

  const candidates = [
    ...buildOpenBoxCandidates(input),
    ...buildBundleCandidates(input),
  ];

  if (!candidates.length) {
    return { operations };
  }

  operations.push({
    productDiscountsAdd: {
      selectionStrategy: ProductDiscountSelectionStrategy.All,
      candidates,
    },
  });

  return { operations };
}