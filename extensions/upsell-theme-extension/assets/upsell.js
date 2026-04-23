function moneyFormat(value) {
  if (value == null || value === "") return "";
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return `R ${number.toFixed(2)}`;
}

function normalizeVariantId(variantId) {
  if (!variantId) return null;
  const match = String(variantId).match(/(\d+)$/);
  return match ? match[1] : variantId;
}

async function getCart() {
  const response = await fetch("/cart.js", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Cart fetch failed: ${response.status}`);
  }

  return response.json();
}

function isProductInCart(cart, product) {
  if (!cart?.items?.length || !product) return false;

  const normalizedVariantId = normalizeVariantId(product.variantId);

  return cart.items.some((item) => {
    const itemVariantId = normalizeVariantId(item.variant_id || item.id);

    const sameVariant =
      normalizedVariantId &&
      itemVariantId &&
      String(itemVariantId) === String(normalizedVariantId);

    const sameSku =
      product.sku &&
      item.sku &&
      String(product.sku).trim().toLowerCase() ===
        String(item.sku).trim().toLowerCase();

    return sameVariant || sameSku;
  });
}

function buildTriggerProduct(block) {
  return {
    title: block.dataset.productTitle || "Selected product",
    price: block.dataset.productPrice || "",
    variantId: block.dataset.variantId || "",
    sku: block.dataset.sku || "",
    image: block.dataset.image || "",
    imageAlt: block.dataset.productTitle || "Selected product",
    availableForSale: true,
    isTrigger: true,
    compareAtPrice: null,
  };
}

function getDiscountedPrice(product, offer) {
  const basePrice = Number(product?.price || 0);
  if (!Number.isFinite(basePrice)) return basePrice;

  const discountMode = offer?.discount?.mode || "NONE";
  const discountValue = Number(offer?.discount?.value || 0);

  if (discountMode === "FIXED" && discountValue > 0) {
    return Math.max(0, basePrice - discountValue);
  }

  if (discountMode === "PERCENTAGE" && discountValue > 0) {
    return Math.max(0, basePrice - (basePrice * discountValue) / 100);
  }

  return basePrice;
}

function getSavingsAmount(product, offer) {
  const basePrice = Number(product?.price || 0);
  const discountedPrice = getDiscountedPrice(product, offer);
  return Math.max(0, basePrice - discountedPrice);
}

function renderBundleItem({
  product,
  message = "",
  inCart = false,
  checked = false,
  disabled = false,
  offer = null,
  index = 0,
  selectable = false,
}) {
  if (!product) return "";

  const imageMarkup = product.image
    ? `<img class="upsell-item__image" src="${product.image}" alt="${product.imageAlt || product.title}">`
    : `<div class="upsell-item__image upsell-item__image--placeholder"></div>`;

  const savings = offer ? getSavingsAmount(product, offer) : 0;
  const discountedPrice = offer ? getDiscountedPrice(product, offer) : Number(product.price || 0);
  const hasDiscount = offer && savings > 0;

  const priceMarkup = hasDiscount
    ? `
      <div class="upsell-item__price-wrap">
        <span class="upsell-item__price upsell-item__price--old">${moneyFormat(product.price)}</span>
        <span class="upsell-item__price upsell-item__price--new">${moneyFormat(discountedPrice)}</span>
      </div>
    `
    : product.price
      ? `<div class="upsell-item__price">${moneyFormat(product.price)}</div>`
      : "";

  const badgeMarkup = inCart
    ? `<div class="upsell-item__tag upsell-item__tag--muted">Already in cart</div>`
    : hasDiscount
      ? `<div class="upsell-item__tag upsell-item__tag--save">Save ${moneyFormat(savings)}</div>`
      : "";

  const messageMarkup = message
    ? `<div class="upsell-item__message">${message}</div>`
    : "";

  const checkboxMarkup = selectable
    ? `
      <label class="upsell-item__check">
        <input
          type="checkbox"
          class="upsell-bundle__checkbox"
          data-index="${index}"
          ${checked ? "checked" : ""}
          ${disabled ? "disabled" : ""}
        >
        <span></span>
      </label>
    `
    : `<div class="upsell-item__check upsell-item__check--placeholder"></div>`;

  return `
    <div class="upsell-item ${inCart ? "upsell-item--in-cart" : ""}">
      ${checkboxMarkup}
      ${imageMarkup}
      <div class="upsell-item__info">
        <div class="upsell-item__name">${product.title || "Selected product"}</div>
        ${priceMarkup}
        ${badgeMarkup}
        ${messageMarkup}
      </div>
    </div>
  `;
}

function renderSummary(total, savings, itemCount) {
  return `
    <div class="upsell-bundle__summary">
      <div class="upsell-bundle__summary-row">
        <span>${itemCount} item${itemCount === 1 ? "" : "s"} selected</span>
        <strong>${moneyFormat(total)}</strong>
      </div>
      ${
        savings > 0
          ? `
            <div class="upsell-bundle__summary-row upsell-bundle__summary-row--save">
              <span>You save</span>
              <strong>${moneyFormat(savings)}</strong>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function getSelectedBundleState(triggerProduct, offersState) {
  const selectedItems = [triggerProduct];
  let total = Number(triggerProduct.price || 0) || 0;
  let savings = 0;

  for (const offerState of offersState) {
    if (!offerState.selected || offerState.inCart) continue;

    const discountedPrice = getDiscountedPrice(offerState.product, offerState.offer);
    const itemSavings = getSavingsAmount(offerState.product, offerState.offer);

    selectedItems.push(offerState.product);
    total += discountedPrice;
    savings += itemSavings;
  }

  return {
    selectedItems,
    total,
    savings,
    itemCount: selectedItems.length,
  };
}

function getBundleButtonLabel(offersState, triggerInCart) {
  const selectedOfferCount = offersState.filter(
    (offerState) => offerState.selected && !offerState.inCart,
  ).length;

  if (triggerInCart && selectedOfferCount === 0) {
    return "Everything already in cart";
  }

  if (triggerInCart) {
    return "Add selected extras";
  }

  return "Add selected bundle";
}

async function addBundleToCart(items, button) {
  const lines = items
    .map((item) => ({
      id: normalizeVariantId(item.variantId),
      quantity: 1,
    }))
    .filter((item) => item.id);

  if (!lines.length) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Adding...";

  try {
    const response = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ items: lines }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Bundle add failed:", errorText);
      throw new Error(`Bundle add failed: ${response.status}`);
    }

    await response.json();

    button.textContent = "In Cart";
    button.disabled = true;
    button.classList.add("upsell-item__button--in-cart");

    document.dispatchEvent(new CustomEvent("cart:refresh"));
  } catch (error) {
    console.error("Upsell bundle add error:", error);
    button.disabled = false;
    button.textContent = originalText;
  }
}

function bindBundleInteractions({
  content,
  triggerProduct,
  triggerInCart,
  offersState,
}) {
  const summaryEl = content.querySelector(".upsell-bundle__summary-host");
  const button = content.querySelector(".upsell-bundle__button");

  function refreshSummary() {
    const { selectedItems, total, savings, itemCount } = getSelectedBundleState(
      triggerProduct,
      offersState,
    );

    if (summaryEl) {
      summaryEl.innerHTML = renderSummary(total, savings, itemCount);
    }

    const remainingItems = triggerInCart
      ? selectedItems.filter((item) => !item.isTrigger)
      : selectedItems;

    const nothingToAdd =
      (triggerInCart && remainingItems.length === 0) ||
      (!triggerInCart && selectedItems.length === 0);

    if (button) {
      button.textContent = getBundleButtonLabel(offersState, triggerInCart);
      button.disabled = nothingToAdd;
      button.classList.toggle("upsell-item__button--in-cart", nothingToAdd);
    }

    return remainingItems;
  }

  content.querySelectorAll(".upsell-bundle__checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isFinite(index) || !offersState[index]) return;
      offersState[index].selected = event.currentTarget.checked;
      refreshSummary();
    });
  });

  if (button) {
    button.addEventListener("click", () => {
      const remainingItems = refreshSummary();
      if (!remainingItems.length) return;
      addBundleToCart(remainingItems, button);
    });
  }

  refreshSummary();
}

async function initUpsellBlocks(root = document) {
  const blocks = root.querySelectorAll(".upsell-block");

  for (const block of blocks) {
    const sku = (block.dataset.sku || "").trim();
    const content = block.querySelector(".upsell-block__content");

    if (!content) continue;

    if (!sku) {
      const wrapper = block.querySelector(".upsell-block__inner");
      if (wrapper) wrapper.style.display = "none";
      continue;
    }

    content.innerHTML = `<div class="upsell-loading">Loading recommendations...</div>`;

    try {
      const [upsellRes, cart] = await Promise.all([
        fetch(`/apps/upsell?sku=${encodeURIComponent(sku)}`),
        getCart(),
      ]);

      const data = await upsellRes.json();

      if (!data || !data.rules || !data.rules.length) {
        const wrapper = block.querySelector(".upsell-block__inner");
        if (wrapper) wrapper.style.display = "none";
        continue;
      }

      const triggerProduct = buildTriggerProduct(block);
      const triggerInCart = isProductInCart(cart, triggerProduct);

      const offersState = [];
      const renderedOfferItems = [];

      for (const rule of data.rules) {
        const offers = Array.isArray(rule.offers) ? rule.offers : [];

        for (const offer of offers) {
          const product = offer?.product;
          if (!product) continue;

          const offerInCart = isProductInCart(cart, product);
          const state = {
            product,
            offer,
            inCart: offerInCart,
            selected: !offerInCart,
          };

          const stateIndex = offersState.push(state) - 1;

          renderedOfferItems.push(
            renderBundleItem({
              product,
              offer,
              message: offer?.message || "",
              inCart: offerInCart,
              checked: state.selected,
              disabled: offerInCart,
              index: stateIndex,
              selectable: true,
            }),
          );
        }
      }

      if (!renderedOfferItems.length) {
        const wrapper = block.querySelector(".upsell-block__inner");
        if (wrapper) wrapper.style.display = "none";
        continue;
      }

      content.innerHTML = `
        <div class="upsell-bundle upsell-bundle--premium">
          <div class="upsell-bundle__hero">
            <div>
              <div class="upsell-bundle__eyebrow">Bundle & save</div>
              <div class="upsell-bundle__headline">Complete your setup in one click</div>
            </div>
          </div>

          <div class="upsell-bundle__section">
            <div class="upsell-bundle__section-title">Your item</div>
            ${renderBundleItem({
              product: triggerProduct,
              inCart: triggerInCart,
              selectable: false,
            })}
          </div>

          <div class="upsell-bundle__plus">+</div>

          <div class="upsell-bundle__section">
            <div class="upsell-bundle__section-title">Recommended add-ons</div>
            <div class="upsell-bundle__items">
              ${renderedOfferItems.join("")}
            </div>
          </div>

          <div class="upsell-bundle__footer">
            <div class="upsell-bundle__summary-host"></div>
            <button
              type="button"
              class="upsell-item__button upsell-bundle__button"
            >
              Add selected bundle
            </button>
          </div>
        </div>
      `;

      bindBundleInteractions({
        content,
        triggerProduct,
        triggerInCart,
        offersState,
      });
    } catch (error) {
      console.error("Upsell block error:", error);
      const wrapper = block.querySelector(".upsell-block__inner");
      if (wrapper) wrapper.style.display = "none";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initUpsellBlocks(document);
});

document.addEventListener("shopify:section:load", (event) => {
  initUpsellBlocks(event.target);
});

document.addEventListener("shopify:block:select", () => {
  initUpsellBlocks(document);
});