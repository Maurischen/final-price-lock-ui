function moneyFormat(value) {
  if (value == null || value === "") return "";

  const number = Number(value);
  if (Number.isNaN(number)) return value;

  return `R ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function getCurrentPageQuantity() {
  const selectors = [
    'input[name="quantity"]',
    'quantity-input input',
    '.quantity__input',
    'input.quantity__input',
    'form[action*="/cart/add"] input[name="quantity"]'
  ];

  for (const selector of selectors) {
    const input = document.querySelector(selector);
    if (!input) continue;

    const value = Number(input.value);
    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }

  return 1;
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
    : `
      <label class="upsell-item__check">
        <input
          type="checkbox"
          checked
          disabled
        >
        <span></span>
      </label>
    `;

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

function renderSummary(total, savings, itemCount, quantity) {
  const qtyLabel = quantity > 1 ? ` × ${quantity}` : "";

  return `
    <div class="upsell-bundle__summary">
      <div class="upsell-bundle__summary-row">
        <span>${itemCount} item${itemCount === 1 ? "" : "s"} selected${qtyLabel}</span>
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

function getSelectedBundleState(triggerProduct, offersState, quantity) {
  const selectedItems = [triggerProduct];

  const triggerDiscountOffer = triggerProduct.triggerDiscountOffer || null;
  const triggerDiscountedPrice = getDiscountedPrice(triggerProduct, triggerDiscountOffer);
  const triggerSavings = getSavingsAmount(triggerProduct, triggerDiscountOffer);

  let total = triggerDiscountedPrice * quantity;
  let savings = triggerSavings * quantity;

  for (const offerState of offersState) {
    if (!offerState.selected || offerState.inCart) continue;

    const discountedPrice = getDiscountedPrice(offerState.product, offerState.offer);
    const itemSavings = getSavingsAmount(offerState.product, offerState.offer);

    selectedItems.push(offerState.product);
    total += discountedPrice * quantity;
    savings += itemSavings * quantity;
  }

  return {
    selectedItems,
    total,
    savings,
    itemCount: selectedItems.length,
  };
}

function getBundleButtonLabel({ triggerInCart, selectedOfferCount, onlyTriggerSelected, nothingToAdd }) {
  if (nothingToAdd) {
    return "Everything already in cart";
  }

  if (triggerInCart && selectedOfferCount > 0) {
    return "Add selected extras";
  }

  if (!triggerInCart && onlyTriggerSelected) {
    return "Add product";
  }

  return "Add selected bundle";
}

async function addBundleToCart(items, quantity, button) {
  const lines = items
    .map((item) => ({
      id: normalizeVariantId(item.variantId),
      quantity,
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

    button.textContent = "Added";
    button.disabled = true;
    button.classList.add("upsell-item__button--in-cart");

    document.dispatchEvent(new CustomEvent("cart:refresh"));

    setTimeout(() => {
      window.location.reload();
    }, 500);
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
    const quantity = getCurrentPageQuantity();

    const { selectedItems, total, savings, itemCount } = getSelectedBundleState(
      triggerProduct,
      offersState,
      quantity,
    );

    if (summaryEl) {
      summaryEl.innerHTML = renderSummary(total, savings, itemCount, quantity);
    }

    const remainingItems = triggerInCart
      ? selectedItems.filter((item) => !item.isTrigger)
      : selectedItems;

    const selectedOfferCount = offersState.filter(
      (offerState) => offerState.selected && !offerState.inCart,
    ).length;

    const onlyTriggerSelected = !triggerInCart && selectedOfferCount === 0;
    const nothingToAdd =
      (triggerInCart && remainingItems.length === 0) ||
      (!triggerInCart && selectedItems.length === 0);

    if (button) {
      button.textContent = getBundleButtonLabel({
        triggerInCart,
        selectedOfferCount,
        onlyTriggerSelected,
        nothingToAdd,
      });
      button.disabled = nothingToAdd;
      button.classList.toggle("upsell-item__button--in-cart", nothingToAdd);
    }

    return {
      remainingItems,
      quantity,
    };
  }

  content.querySelectorAll(".upsell-bundle__checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isFinite(index) || !offersState[index]) return;
      offersState[index].selected = event.currentTarget.checked;
      refreshSummary();
    });
  });

  const quantitySelectors = [
    'input[name="quantity"]',
    'quantity-input input',
    '.quantity__input',
    'input.quantity__input',
    'form[action*="/cart/add"] input[name="quantity"]'
  ];

  quantitySelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((input) => {
      input.addEventListener("change", refreshSummary);
      input.addEventListener("input", refreshSummary);
    });
  });

  if (button) {
    button.addEventListener("click", () => {
      const { remainingItems, quantity } = refreshSummary();
      if (!remainingItems.length) return;
      addBundleToCart(remainingItems, quantity, button);
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
      const [oldUpsellRes, newBundlerRes, cart] = await Promise.all([
        fetch(`/apps/upsell?sku=${encodeURIComponent(sku)}`),
        fetch(`/apps/upsell?type=bundler&sku=${encodeURIComponent(sku)}`),
        getCart(),
      ]);

      const oldUpsellData = await oldUpsellRes.json();
      const newBundlerData = await newBundlerRes.json();

      const data = {
        ok: true,
        rules: [
          ...(oldUpsellData?.rules || []),
          ...(newBundlerData?.rules || []),
        ].filter((rule) => Array.isArray(rule.offers) && rule.offers.length > 0),
      };

      console.log("OLD UPSELL DATA:", oldUpsellData);
      console.log("NEW BUNDLER DATA:", newBundlerData);
      console.log("COMBINED DATA:", data);

      if (!data || !data.rules || !data.rules.length) {
        const wrapper = block.querySelector(".upsell-block__inner");
        if (wrapper) wrapper.style.display = "none";
        continue;
      }

      const primaryRule = data.rules[0] || {};

      const badgeText =
        primaryRule.badgeText || "Bundle & save";

      const headlineText =
        primaryRule.headlineText ||
        "Bundle these essentials and save instantly";

      const triggerProduct = buildTriggerProduct(block);
      const triggerInCart = isProductInCart(cart, triggerProduct);

      const offersState = [];
      const renderedOfferItems = [];
      let triggerDiscountOffer = null;

      for (const rule of data.rules) {
        if (!triggerDiscountOffer && rule.triggerDiscount) {
          triggerDiscountOffer = {
            discount: rule.triggerDiscount,
          };
        }

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

      triggerProduct.triggerDiscountOffer = triggerDiscountOffer;

      console.log("RENDERED OFFER ITEMS:", renderedOfferItems);
      console.log("OFFERS STATE:", offersState);

      if (!renderedOfferItems.length) {
        const wrapper = block.querySelector(".upsell-block__inner");
        if (wrapper) wrapper.style.display = "none";
        continue;
      }

      content.innerHTML = `
        <div class="upsell-bundle upsell-bundle--premium">
          <div class="upsell-bundle__hero">
            <div>
              <div class="upsell-bundle__eyebrow">${badgeText}</div>
              <div class="upsell-bundle__headline">${headlineText}</div>
            </div>
          </div>

          <div class="upsell-bundle__section">
            <div class="upsell-bundle__section-title">Your item</div>
            ${renderBundleItem({
              product: triggerProduct,
              offer: triggerDiscountOffer,
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