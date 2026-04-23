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
    title: block.dataset.productTitle || "Current product",
    price: block.dataset.productPrice || "",
    variantId: block.dataset.variantId || "",
    sku: block.dataset.sku || "",
    image: block.dataset.image || "",
    imageAlt: block.dataset.productTitle || "Current product",
    availableForSale: true,
    isTrigger: true,
  };
}

function renderBundleItem(product, message = "", inCart = false) {
  const imageMarkup = product.image
    ? `<img class="upsell-item__image" src="${product.image}" alt="${product.imageAlt || product.title}">`
    : `<div class="upsell-item__image upsell-item__image--placeholder"></div>`;

  const priceMarkup = product.price
    ? `<div class="upsell-item__price">${moneyFormat(product.price)}</div>`
    : "";

  const badgeMarkup = product.isTrigger
    ? inCart
      ? `<div class="upsell-item__tag upsell-item__tag--muted">Main item already in cart</div>`
      : `<div class="upsell-item__tag">Main item</div>`
    : inCart
      ? `<div class="upsell-item__tag upsell-item__tag--muted">Already in cart</div>`
      : "";

  const messageMarkup = message
    ? `<div class="upsell-item__message">${message}</div>`
    : "";

  return `
    <div class="upsell-item">
      ${imageMarkup}
      <div class="upsell-item__info">
        <div class="upsell-item__name">${product.title}</div>
        ${priceMarkup}
        ${badgeMarkup}
        ${messageMarkup}
      </div>
    </div>
  `;
}

function calculateBundleTotal(items) {
  return items.reduce((sum, item) => {
    const price = Number(item?.price || 0);
    return Number.isFinite(price) ? sum + price : sum;
  }, 0);
}

function getBundleButtonLabel(remainingItems, triggerInCart) {
  if (!remainingItems.length) {
    return "Everything already in cart";
  }

  if (triggerInCart) {
    return "Add remaining items";
  }

  return "Add bundle to cart";
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

      const allBundleItems = [triggerProduct];
      const renderItems = [renderBundleItem(triggerProduct, "", triggerInCart)];

      for (const rule of data.rules) {
        const offers = Array.isArray(rule.offers) ? rule.offers : [];

        for (const offer of offers) {
          const product = offer?.product;
          if (!product) continue;

          const offerInCart = isProductInCart(cart, product);

          allBundleItems.push(product);
          renderItems.push(
            renderBundleItem(product, offer?.message || "", offerInCart),
          );
        }
      }

      const remainingItems = allBundleItems.filter(
        (item) => !isProductInCart(cart, item),
      );

      if (allBundleItems.length <= 1) {
        const wrapper = block.querySelector(".upsell-block__inner");
        if (wrapper) wrapper.style.display = "none";
        continue;
      }

      const bundleTotal = calculateBundleTotal(remainingItems);
      const buttonLabel = getBundleButtonLabel(remainingItems, triggerInCart);
      const buttonDisabled = remainingItems.length === 0 ? "disabled" : "";

      content.innerHTML = `
        <div class="upsell-bundle">
          <div class="upsell-bundle__items">
            ${renderItems.join("")}
          </div>

          <div class="upsell-bundle__footer">
            <div class="upsell-bundle__total">
              Total to add: <strong>${moneyFormat(bundleTotal)}</strong>
            </div>
            <button
              type="button"
              class="upsell-item__button upsell-bundle__button ${remainingItems.length === 0 ? "upsell-item__button--in-cart" : ""}"
              ${buttonDisabled}
            >
              ${buttonLabel}
            </button>
          </div>
        </div>
      `;

      const bundleButton = content.querySelector(".upsell-bundle__button");
      if (bundleButton && remainingItems.length > 0) {
        bundleButton.addEventListener("click", () => {
          addBundleToCart(remainingItems, bundleButton);
        });
      }
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