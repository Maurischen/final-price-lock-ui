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
 * Read the cart line Condition attribute.
 * Your function input query must include:
 * attribute(key: "Condition") { value }
 *
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
 * @param {CartInput} input
 * @returns {Result}
 */
export function cartLinesDiscountsGenerateRun(input) {
  /** @type {Result["operations"]} */
  const operations = [];
  /** @type {ProductDiscountCandidate[]} */
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

    candidates.push({
      message: `Open Box ${OPEN_BOX_DISCOUNT_PERCENT}% off`,
      targets: [
        {
          cartLine: {
            id: cartLine.id,
            quantity: null,
          },
        },
      ],
      value: {
        fixedAmount: {
          amount: formatAmount(discountPerUnit),
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