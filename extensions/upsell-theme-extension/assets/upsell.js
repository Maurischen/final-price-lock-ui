function initUpsellBlocks(root = document) {
  const blocks = root.querySelectorAll(".upsell-block");

  blocks.forEach(async (block) => {
    if (block.dataset.upsellInitialized === "true") return;
    block.dataset.upsellInitialized = "true";

    const sku = block.dataset.sku;
    const content = block.querySelector(".upsell-block__content");

    if (!sku || !content) {
      console.warn("Upsell block missing sku or content area", { sku, block });
      content && (content.innerHTML = "<div>No SKU found for this product.</div>");
      return;
    }

    content.innerHTML = `<div class="upsell-loading">Loading recommendations...</div>`;

    try {
      const res = await fetch(`/apps/upsell?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();

      console.log("Upsell block response:", data);

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

document.addEventListener("shopify:section:reorder", () => {
  initUpsellBlocks(document);
});

document.addEventListener("shopify:block:select", () => {
  initUpsellBlocks(document);
});