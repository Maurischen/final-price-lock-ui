// @ts-check

import {
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} CartInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} Result
 * @typedef {import("../generated/api").ProductDiscountCandidate} ProductDiscountCandidate
 */

/**
 * Lock specific SKUs to a fixed final unit price (incl. VAT).
 * If current unit price > locked price, we discount the difference.
 */
const LOCKED_SKU_PRICES = {
 "MP20 (N150-8/256)": "3550.00",
  "S1-N150": "4500.00",
  "MP 100 PRO-I9-12900H/1-PR": "9790.00",
"N3ES-I713620H-16/512-PRO": "10190.00",
"MP 100 PRO-I5-12450H/1T-P": "8000.00",
"N3ES-I31215U-16/512-PRO": "6400.00",
"AD08": "8900.00",
"GK3": "3200.00",
"MP200-I9-1TB": "8700.00",
"N3ES-I31215U-8/256-PRO": "5900.00",
"BLK-ACEBOOK 6-N150-16/256": "4900.00",
"BLK-ACEBOOK12": "8900.00",
"RCT-2000VAS": "1790.00",
  // later you’ll replace these with MP20 / S1-N150 / etc.
};

/**
 * @param {CartInput} input
 * @returns {Result}
 */
export function cartLinesDiscountsGenerateRun(input) {
  /** @type {Result["operations"]} */
  const operations = [];

  const cart = input.cart;
  if (!cart || !cart.lines || cart.lines.length === 0) {
    return { operations };
  }

  // Optional safety: only run if PRODUCT class is allowed
  const classes = input.discount?.discountClasses ?? [];
  const hasProductClass = classes.includes("PRODUCT");
  if (classes.length > 0 && !hasProductClass) {
    return { operations };
  }

  /** @type {ProductDiscountCandidate[]} */
  const candidates = [];

  for (const cartLine of cart.lines) {
    const merchandise = cartLine.merchandise;
    if (!merchandise || merchandise.__typename !== "ProductVariant") continue;

    const sku = merchandise.sku;
    if (!sku) continue;

    const lockedPriceStr = LOCKED_SKU_PRICES[sku];
    if (!lockedPriceStr) continue;

    const unitPrice = Number(cartLine.cost?.amountPerQuantity?.amount);
    const lockedPrice = Number(lockedPriceStr);

    if (!Number.isFinite(unitPrice) || !Number.isFinite(lockedPrice)) continue;

    const discountPerUnit = unitPrice - lockedPrice;
    if (discountPerUnit <= 0) continue;

    candidates.push({
      message: "Locked SKU price",
      targets: [
        {
          cartLine: {
            id: cartLine.id,
            // null means “all quantity on this line”
            quantity: null,
          },
        },
      ],
      value: {
        fixedAmount: {
          amount: discountPerUnit.toFixed(2),
          appliesToEachItem: true,
        },
      },
    });
  }

  if (candidates.length === 0) {
    return { operations };
  }

  operations.push({
    productDiscountsAdd: {
      selectionStrategy: ProductDiscountSelectionStrategy.All,
      candidates,
    },
  });

  // 👇 FINAL RETURN
  return { operations };
}