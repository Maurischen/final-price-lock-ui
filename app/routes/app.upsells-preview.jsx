import { authenticate } from "../shopify.server";
import { resolveUpsells } from "../services/upsell-resolver.server";
import { getProductsBySku } from "../services/upsell-products.server";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);

  const result = await resolveUpsells({
    shop: session.shop,
    placement: "PRODUCT_PAGE",
    context: {
      sku: "MOS-W121",
    },
  });

  const skus = result.rules
    .map(r => r.offer.sku)
    .filter(Boolean);

  const products = await getProductsBySku(admin, skus);

  return Response.json({
    ...result,
    products,
  });
}