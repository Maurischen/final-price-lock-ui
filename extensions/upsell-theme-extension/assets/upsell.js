function initUpsellBlocks(root = document) {
  const blocks = root.querySelectorAll(".upsell-block");

  blocks.forEach(async (block) => {
    const sku = (block.dataset.sku || "").trim();
    const content = block.querySelector(".upsell-block__content");

    if (!content) return;

    if (!sku) {
      content.innerHTML = `<div class="upsell-empty">No SKU found on this product.</div>`;
      console.warn("Upsell block: no SKU found", block);
      return;
    }

    content.innerHTML = `<div class="upsell-loading">Loading recommendations...</div>`;

    try {
      const res = await fetch(`/apps/upsell?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();

      console.log("Upsell block response for SKU", sku, data);

      if (!data || !data.rules || !data.rules.length) {
        content.innerHTML = `<div class="upsell-empty">No matching upsell rule for SKU: ${sku}</div>`;
        return;
      }

      content.innerHTML = data.rules
        .map((rule) => {
          const title = rule.offer?.sku || "Recommended add-on";
          const message = rule.offer?.message || "";

          return `
            <div class="upsell-item">
              <div class="upsell-item__info">
                <div class="upsell-item__name">${title}</div>
                ${message ? `<div class="upsell-item__message">${message}</div>` : ""}
              </div>
              <button type="button" class="upsell-item__button">Add</button>
            </div>
          `;
        })
        .join("");
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