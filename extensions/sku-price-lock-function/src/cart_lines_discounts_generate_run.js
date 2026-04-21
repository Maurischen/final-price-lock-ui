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
 * Hardcoded test bundle rules for now.
 * 1 laptop SKU = 1 discounted accessory set
 */
const BUNDLE_DISCOUNT_RULES = [
  {
    name: "ASUS Laptop Bundle",
    active: true,
    triggerSku: "M1605NAQ-716512S0W", // REPLACE
    ratio: 1,
    message: "Laptop accessory bundle discount",
    accessories: [
      {
        sku: "T54", // REPLACE
        discountAmount: 30.0,
        label: "Bag less R30",
      },
      {
        sku: "MOS-W121", // REPLACE
        discountAmount: 25.0,
        label: "Mouse less R25",
      },
      {
        sku: "GL-U02", // REPLACE
        discountAmount: 45.0,
        label: "Hub less R45",
      },
    ],
  },
];

/**
 * @param {CartInput["cart"]["lines"][number]} cartLine
 * @returns {string | null}
 */
function getCartLineAttribute(cartLine) {
  return cartLine.attribute && typeof cartLine.attribute.value === "string"
    ? cartLine.attribute.value
    : null;
}

/**
 * @param {number} amount
 * @returns {string}
 */
function formatAmount(amount) {
  return amount.toFixed(2);
}

/**
 * @param {CartInput["cart"]["lines"][number]} cartLine
 * @returns {string | null}
 */
function getVariantSku(cartLine) {
  const merchandise = cartLine.merchandise;

  if (!merchandise || merchandise.__typename !== "ProductVariant") {
    return null;
  }

  return typeof merchandise.sku === "string" ? merchandise.sku : null;
}

/**
 * @param {CartInput["cart"]["lines"]} lines
 * @param {string} sku
 * @returns {number}
 */
function getTotalQtyBySku(lines, sku) {
  let total = 0;

  for (const line of lines) {
    if (getVariantSku(line) === sku) {
      total += Number(line.quantity || 0);
    }
  }

  return total;
}

/**
 * @param {string} lineId
 * @param {number | null} quantity
 * @param {number} discountAmount
 * @param {string} message
 * @returns {ProductDiscountCandidate}
 */
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
 * @param {CartInput} input
 * @returns {ProductDiscountCandidate[]}
 */
function buildOpenBoxCandidates(input) {
  const candidates = [];

  for (const cartLine of input.cart.lines) {
    const merchandise = cartLine.merchandise;

    if (merchandise.__typename !== "ProductVariant") {
      continue;
    }

    const condition = getCartLineAttribute(cartLine);
    const isOpenBox = condition === OPEN_BOX_CONDITION_VALUE;

    if (!isOpenBox) {
      continue;
    }

    const currentUnitPrice = Number(cartLine.cost.amountPerQuantity.amount);

    if (!Number.isFinite(currentUnitPrice) || currentUnitPrice <= 0) {
      continue;
    }

    const discountPerUnit =
      currentUnitPrice * (OPEN_BOX_DISCOUNT_PERCENT / 100);

    if (!Number.isFinite(discountPerUnit) || discountPerUnit <= 0) {
      continue;
    }

    candidates.push(
      buildFixedAmountCandidate(
        cartLine.id,
        null,
        discountPerUnit,
        `Open Box ${OPEN_BOX_DISCOUNT_PERCENT}% off`
      )
    );
  }

  return candidates;
}

/**
 * @param {CartInput} input
 * @returns {ProductDiscountCandidate[]}
 */
function buildBundleCandidates(input) {
  const candidates = [];
  const lines = input.cart.lines;

  for (const rule of BUNDLE_DISCOUNT_RULES) {
    if (!rule.active) continue;

    const triggerQty = getTotalQtyBySku(lines, rule.triggerSku);

    if (!Number.isFinite(triggerQty) || triggerQty <= 0) {
      continue;
    }

    const maxDiscountablePerAccessory = triggerQty * (rule.ratio || 1);

    for (const accessory of rule.accessories) {
      let remainingDiscountableQty = maxDiscountablePerAccessory;

      for (const line of lines) {
        if (remainingDiscountableQty <= 0) break;

        const sku = getVariantSku(line);

        if (sku !== accessory.sku) {
          continue;
        }

        const lineQty = Number(line.quantity || 0);

        if (!Number.isFinite(lineQty) || lineQty <= 0) {
          continue;
        }

        const discountedQty = Math.min(lineQty, remainingDiscountableQty);

        if (discountedQty <= 0) {
          continue;
        }

        candidates.push(
          buildFixedAmountCandidate(
            line.id,
            discountedQty,
            accessory.discountAmount,
            accessory.label || rule.message || "Bundle discount"
          )
        );

        remainingDiscountableQty -= discountedQty;
      }
    }
  }

  return candidates;
}

/**
 * @param {CartInput} input
 * @returns {Result}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const operations = [];

  const candidates = [
    ...buildOpenBoxCandidates(input),
    ...buildBundleCandidates(input),
  ];

  if (candidates.length === 0) {
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