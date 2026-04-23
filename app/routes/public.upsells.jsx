import { resolveUpsells } from "../services/upsell-resolver.server";
import { getProductsBySku } from "../services/upsell-products.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const sku = url.searchParams.get("sku");

  const shop =
    request.headers.get("x-shopify-shop-domain") ||
    url.searchParams.get("shop");

  if (!sku || !shop) {
    return Response.json({ ok: false, error: "Missing sku or shop" }, { status: 400 });
  }

  const result = await resolveUpsells({
    shop,
    placement: "PRODUCT_PAGE",
    context: { sku },
  });

  return Response.json(result);
}