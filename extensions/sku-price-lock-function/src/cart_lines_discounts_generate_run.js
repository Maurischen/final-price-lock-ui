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
  "LS22D300": "1590.00",
  "LS24D300": "1880.00",
  "LS27D300": "2280.00",
  "SWV9030/10": "300.00",
  "SWV5551/00": "100.00",
  "MG2541S": "720.00",
  "TS3640": "920.00",
  "6670C037AA": "900.00",
  "G3410": "2320.00",
  "HS-SSD-E100-256G": "360.00",
  "RCT-1000VAS": "1270.00",
  "L3250": "3200.00",
  "0727C067AA": "8200.00",
  "TR4645": "1080.00",
  "49B2U5900CH": "19950.00",
  "210-BQWS": "8099.00",
  "DLP6812NB/69": "200.00",
  "DLP7721N/00": "290.00",
  "DLP2228CB/00": "290.00",
  "DLP5714CB/00": "290.00",
  "DLP9521CB/00": "490.00",
  "DLP1812PB/10": "200.00",
  "STKM1000400": "1250.00",
  "STKM2000400": "1610.00",
  "STKM4000400": "2530.00",
  "STKM5000400": "2810.00",
  "STKP8000400": "3400.00",
  "STKP20000400": "7900.00",
  "STKP24000400": "10660.00",
  "CNS-SW86BB": "420.00",
  "CNS-SW86RR": "420.00",
  "CNS-SW86SS": "420.00",
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
