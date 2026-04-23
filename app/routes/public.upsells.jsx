import { resolveUpsells } from "../services/upsell-resolver.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    // ✅ Correct for App Proxy
    const { session, admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const sku = url.searchParams.get("sku");

    if (!sku) {
      return Response.json({ ok: false, error: "Missing SKU" });
    }

    const result = await resolveUpsells({
      shop: session.shop,
      placement: "PRODUCT_PAGE",
      context: { sku },
    });

    return Response.json(result);
  } catch (error) {
    console.error("UPSSELL ERROR:", error);

    return Response.json({
      ok: false,
      error: error.message,
    });
  }
}