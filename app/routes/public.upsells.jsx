import { resolveUpsells } from "../services/upsell-resolver.server";
import { getProductsBySku } from "../services/upsell-products.server";
import db from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const sku = url.searchParams.get("sku");
  const shop = url.searchParams.get("shop");

  if (!sku || !shop) {
    return Response.json({ ok: false, error: "Missing params" });
  }

  const result = await resolveUpsells({
    shop,
    placement: "PRODUCT_PAGE",
    context: { sku },
  });

  const skus = result.rules.map(r => r.offer.sku).filter(Boolean);

  // 🔴 IMPORTANT: we need admin API access — skip for now if needed
  // For now just return rules

  return Response.json({
    ok: true,
    rules: result.rules,
  });
}