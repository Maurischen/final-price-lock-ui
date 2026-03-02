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
 *
 * This object is now a FALLBACK in case the shop metafield is missing or invalid.
 */
const LOCKED_SKU_PRICES = {
  "49B2U5900CH": "19950.00",
};

/**
 * Get locked SKU prices from the shop metafield if it exists & is valid JSON.
 * Falls back to the hard-coded LOCKED_SKU_PRICES if anything is wrong.
 *
 * @param {CartInput} input
 * @returns {Record<string, string>}
 */
function getLockedSkuPrices(input) {
  const metafield = input.discount && input.discount.metafield;

  // If metafield not present, use fallback
  if (!metafield || typeof metafield.value !== "string") {
    return LOCKED_SKU_PRICES;
  }

  try {
    const parsed = JSON.parse(metafield.value);

    // We expect a plain object like { "SKU1": "123.45", "SKU2": "999.00" }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return LOCKED_SKU_PRICES;
    }

    /** @type {Record<string, string>} */
    const result = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key !== "string") continue;

      if (typeof value === "number") {
        result[key] = value.toFixed(2);
      } else if (typeof value === "string") {
        result[key] = value;
      }
    }

    // If nothing usable, fall back
    if (Object.keys(result).length === 0) {
      return LOCKED_SKU_PRICES;
    }

    return result;
  } catch (_e) {
    // Broken JSON? Just use fallback.
    return LOCKED_SKU_PRICES;
  }
}

/**
 * @param {CartInput} input
 * @returns {Result}
 */
export function cartLinesDiscountsGenerateRun(input) {
  /** @type {Result["operations"]} */
  const operations = [];
  /** @type {ProductDiscountCandidate[]} */
  const candidates = [];

  const lockedSkuPrices = getLockedSkuPrices(input);

  for (const cartLine of input.cart.lines) {
    const merchandise = cartLine.merchandise;

    if (merchandise.__typename !== "ProductVariant") {
      continue;
    }

    const sku = merchandise.sku;
    if (!sku) {
      continue;
    }

    const lockedPriceString = lockedSkuPrices[sku];
    if (!lockedPriceString) {
      continue;
    }

    const lockedPrice = Number(lockedPriceString);
    if (!Number.isFinite(lockedPrice) || lockedPrice <= 0) {
      continue;
    }

    const currentUnitPrice = Number(
      cartLine.cost.amountPerQuantity.amount,
    );

    if (!Number.isFinite(currentUnitPrice) || currentUnitPrice <= 0) {
      continue;
    }

    // Only discount if the current price is above the locked price
    if (currentUnitPrice <= lockedPrice) {
      continue;
    }

    const discountPerUnit = currentUnitPrice - lockedPrice;

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

  return { operations };
}
