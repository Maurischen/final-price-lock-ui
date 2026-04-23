document.addEventListener("DOMContentLoaded", () => {
  const blocks = document.querySelectorAll(".upsell-block");

  blocks.forEach(async (block) => {
    const sku = block.dataset.sku;
    const content = block.querySelector(".upsell-block__content");
    const heading = block.querySelector(".upsell-block__title");

    if (!sku || !content) return;

    try {
      const res = await fetch(`/apps/upsell?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();

      console.log("Upsell block response:", data);

      if (!data || !data.rules || !data.rules.length) {
        block.style.display = "none";
        return;
      }

      content.innerHTML = data.rules.map((rule) => {
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
      }).join("");
    } catch (error) {
      console.error("Upsell block error:", error);
      block.style.display = "none";
    }
  });
});