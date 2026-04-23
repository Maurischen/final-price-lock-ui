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

    const data = await response.json();
    console.log("Upsell added:", data);

    button.textContent = "Added";

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1200);

    document.dispatchEvent(new CustomEvent("cart:refresh"));
  } catch (error) {
    console.error("Upsell add-to-cart error:", error);
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderRule(rule) {
  const product = rule.offer?.product;

  if (!product) {
    return `
      <div class="upsell-item">
        <div class="upsell-item__info">
          <div class="upsell-item__name">${rule.offer?.sku || "Recommended add-on"}</div>
          ${
            rule.offer?.message
              ? `<div class="upsell-item__message">${rule.offer.message}</div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  const imageMarkup = product.image
    ? `<img class="upsell-item__image" src="${product.image}" alt="${product.imageAlt || product.title}">`
    : `<div class="upsell-item__image upsell-item__image--placeholder"></div>`;

  const priceMarkup = product.price
    ? `<div class="upsell-item__price">${moneyFormat(product.price)}</div>`
    : "";

  const messageMarkup = rule.offer?.message
    ? `<div class="upsell-item__message">${rule.offer.message}</div>`
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

function initUpsellBlocks(root = document) {
  const blocks = root.querySelectorAll(".upsell-block");

  blocks.forEach(async (block) => {
    const sku = (block.dataset.sku || "").trim();
    const content = block.querySelector(".upsell-block__content");

    if (!content) return;

    if (!sku) {
      content.innerHTML = `<div class="upsell-empty">No SKU found on this product.</div>`;
      return;
    }

    content.innerHTML = `<div class="upsell-loading">Loading recommendations...</div>`;

    try {
      const res = await fetch(`/apps/upsell?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();

      console.log("Upsell block response for SKU", sku, data);

      if (!data || !data.rules || !data.rules.length) {
        content.innerHTML = `<div class="upsell-empty">No recommendations available.</div>`;
        return;
      }

      content.innerHTML = data.rules.map(renderRule).join("");

      content.querySelectorAll(".upsell-item__button").forEach((button) => {
        button.addEventListener("click", () => {
          addUpsellToCart(button.dataset.variantId, button);
        });
      });
    } catch (error) {
      console.error("Upsell block error:", error);
      content.innerHTML = `<div class="upsell-error">Could not load recommendations.</div>`;
    }
  });
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