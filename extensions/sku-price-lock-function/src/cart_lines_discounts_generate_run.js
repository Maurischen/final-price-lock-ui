import {
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} CartInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} Result
 * @typedef {import("../generated/api").ProductDiscountCandidate} ProductDiscountCandidate
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
  return amount.toFixed(2);
}

function getVariantSku(cartLine) {
  const merchandise = cartLine.merchandise;

  if (!merchandise || merchandise.__typename !== "ProductVariant") {
    return null;
  }

  return typeof merchandise.sku === "string" ? merchandise.sku : null;
}

function getTotalQtyBySku(lines, sku) {
  let total = 0;

  for (const line of lines) {
    if (getVariantSku(line) === sku) {
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

/**
 * ===== OPEN BOX (UNCHANGED) =====
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
        `Open Box ${OPEN_BOX_DISCOUNT_PERCENT}% off`
      )
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

    const triggerQty = getTotalQtyBySku(lines, rule.triggerSku);

    if (!triggerQty || triggerQty <= 0) continue;

    const maxDiscountable = triggerQty * (rule.ratio || 1);

    for (const accessory of rule.accessories || []) {
      let remaining = maxDiscountable;

      for (const line of lines) {
        if (remaining <= 0) break;

        const sku = getVariantSku(line);
        if (sku !== accessory.sku) continue;

        const lineQty = Number(line.quantity || 0);
        if (!lineQty || lineQty <= 0) continue;

        const qty = Math.min(lineQty, remaining);

        candidates.push(
          buildFixedAmountCandidate(
            line.id,
            qty,
            accessory.discountAmount,
            accessory.label || rule.message || "Bundle discount"
          )
        );

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