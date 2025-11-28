// @ts-check

import {
  ProductDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} CartInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} Result
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
"BLK-ACEBOOK12": "8900.00"
  // later you’ll replace these with MP20 / S1-N150 / etc.
};

/**
 * @param {CartInput} input
 * @returns {Result}
 */
export function cartLinesDiscountsGenerateRun(input) {
  /** @type {Result["discounts"]} */
  const discounts = [];

  for (const cartLine of input.cart.lines) {
    const merchandise = cartLine.merchandise;

    if (!merchandise || merchandise.__typename !== "ProductVariant") {
      continue;
    }

    const variant = merchandise;
    const sku = variant.sku;

    if (!sku || !(sku in LOCKED_SKU_PRICES)) {
      continue;
    }

    const lockedPrice = parseFloat(LOCKED_SKU_PRICES[sku]);
    const currentPrice = parseFloat(
      cartLine.cost.amountPerQuantity.amount,
    );

    // No discount if already at or below locked price
    if (currentPrice <= lockedPrice) {
      continue;
    }

    const discountAmount = currentPrice - lockedPrice;

    discounts.push({
      message: "SKU price lock",
      targets: [
        {
          productVariant: {
            id: variant.id,
          },
        },
      ],
      value: {
        fixedAmount: {
          amount: discountAmount.toFixed(2),
        },
      },
    });
  }

  return {
    discounts,
    discountApplicationStrategy:
      ProductDiscountSelectionStrategy.MAXIMUM,
  };
}
