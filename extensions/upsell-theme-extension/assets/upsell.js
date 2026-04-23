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

async function addUpsellToCart(variantId, button) {
  const normalizedVariantId = normalizeVariantId(variantId);
  if (!normalizedVariantId) return;

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
      body: JSON.stringify({
        id: normalizedVariantId,
        quantity: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cart add failed:", errorText);
      throw new Error(`Cart add failed: ${response.status}`);
    }

    await response.json();

    button.textContent = "In Cart";
    button.disabled = true;
    button.classList.add("upsell-item__button--in-cart");

    document.dispatchEvent(new CustomEvent("cart:refresh"));
  } catch (error) {
    console.error("Upsell add-to-cart error:", error);
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderOffer(offer, product) {
  if (!product) return "";

  const imageMarkup = product.image
    ? `<img class="upsell-item__image" src="${product.image}" alt="${product.imageAlt || product.title}">`
    : `<div class="upsell-item__image upsell-item__image--placeholder"></div>`;

  const priceMarkup = product.price
    ? `<div class="upsell-item__price">${moneyFormat(product.price)}</div>`
    : "";

  const messageMarkup = offer?.message
    ? `<div class="upsell-item__message">${offer.message}</div>`
    : "";

  const disabledAttr =
    !product.availableForSale || !product.variantId ? "disabled" : "";

  const buttonLabel =
    !product.availableForSale || !product.variantId ? "Unavailable" : "Add";

  return `
    <div class="upsell-item">
      ${imageMarkup}
      <div class="upsell-item__info">
        <div class="upsell-item__name">${product.title}</div>
        ${priceMarkup}
        ${messageMarkup}
      </div>
      <button
        type="button"
        class="upsell-item__button"
        data-variant-id="${product.variantId || ""}"
        ${disabledAttr}
      >
        ${buttonLabel}
      </button>
    </div>
  `;
}

async function initUpsellBlocks(root = document) {
  const blocks = root.querySelectorAll(".upsell-block");

  for (const block of blocks) {
    const sku = (block.dataset.sku || "").trim();
    const content = block.querySelector(".upsell-block__content");

    if (!content) continue;

    if (!sku) {
      content.innerHTML = `<div class="upsell-empty">No SKU found on this product.</div>`;
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
        content.innerHTML = `<div class="upsell-empty">No recommendations available.</div>`;
        continue;
      }

      const renderedOffers = [];

      for (const rule of data.rules) {
        const offers = Array.isArray(rule.offers) ? rule.offers : [];

        for (const offer of offers) {
          const product = offer?.product;
          if (!product) continue;
          if (isProductInCart(cart, product)) continue;

          renderedOffers.push(renderOffer(offer, product));
        }
      }

      if (!renderedOffers.length) {
        const wrapper = block.querySelector(".upsell-block__inner");
        if (wrapper) {
          wrapper.style.display = "none";
        } else {
          block.style.display = "none";
        }
        continue;
      }

      content.innerHTML = renderedOffers.join("");

      content.querySelectorAll(".upsell-item__button").forEach((button) => {
        button.addEventListener("click", () => {
          addUpsellToCart(button.dataset.variantId, button);
        });
      });
    } catch (error) {
      console.error("Upsell block error:", error);
      content.innerHTML = `<div class="upsell-error">Could not load recommendations.</div>`;
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