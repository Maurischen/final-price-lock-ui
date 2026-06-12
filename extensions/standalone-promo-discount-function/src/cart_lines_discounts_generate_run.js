import { ProductDiscountSelectionStrategy } from "../generated/api";

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

function buildDiscountCandidate(lineId, quantity, discountConfig, message) {
  const discountMode =
    discountConfig.discountMode ||
    discountConfig.mode ||
    discountConfig.discountType ||
    "FIXED";

  if (discountMode === "PERCENTAGE") {
    return buildPercentageCandidate(
      lineId,
      quantity,
      discountConfig.discountPercentage ?? discountConfig.discountValue,
      message,
    );
  }

  return buildFixedAmountCandidate(
    lineId,
    quantity,
    discountConfig.discountAmount ?? discountConfig.discountValue,
    message,
  );
}

function getStandaloneDiscounts(input) {
  const config = input.discount?.metafield?.jsonValue;

  if (!config || !Array.isArray(config.standaloneDiscounts)) {
    return [];
  }

  return config.standaloneDiscounts;
}

function lineMatchesStandaloneDiscount(line, discountRule) {
  const sku = getVariantSku(line);
  const variantId = getVariantId(line);
  const productId = getProductId(line);

  const skuMatch =
    discountRule.sku && sku && normalize(discountRule.sku) === normalize(sku);

  const variantMatch =
    discountRule.variantId &&
    variantId &&
    normalize(discountRule.variantId) === normalize(variantId);

  const productMatch =
    discountRule.productId &&
    productId &&
    normalize(discountRule.productId) === normalize(productId);

  return Boolean(skuMatch || variantMatch || productMatch);
}

function buildStandaloneDiscountCandidates(input) {
  const candidates = [];
  const lines = input.cart.lines;
  const standaloneDiscounts = getStandaloneDiscounts(input);

  for (const discountRule of standaloneDiscounts) {
    if (!discountRule.active) continue;

    const discountAmount = Number(
      discountRule.discountAmount ??
        discountRule.discountValue ??
        discountRule.amount ??
        0,
    );

    if (!Number.isFinite(discountAmount) || discountAmount <= 0) continue;

    for (const line of lines) {
      if (!lineMatchesStandaloneDiscount(line, discountRule)) continue;

      const lineQty = Number(line.quantity || 0);
      if (!lineQty || lineQty <= 0) continue;

      const message =
        discountRule.label || discountRule.message || "Promo discount";

      candidates.push(
        buildDiscountCandidate(
          line.id,
          lineQty,
          {
            discountMode:
              discountRule.discountMode ||
              discountRule.mode ||
              discountRule.discountType ||
              "FIXED",
            discountAmount,
            discountValue: discountAmount,
            discountPercentage: discountRule.discountPercentage,
          },
          message,
        ),
      );
    }
  }

  return candidates;
}

export function cartLinesDiscountsGenerateRun(input) {
  const candidates = buildStandaloneDiscountCandidates(input);

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          selectionStrategy: ProductDiscountSelectionStrategy.All,
          candidates,
        },
      },
    ],
  };
}