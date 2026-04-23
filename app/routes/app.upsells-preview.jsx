import { authenticate } from "../shopify.server";
import { resolveUpsells } from "../services/upsell-resolver.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  // 🔥 simulate a product or cart
  const result = await resolveUpsells({
    shop: session.shop,
    placement: "PRODUCT_PAGE",
    context: {
      sku: "MOS-W121", // 👈 your test trigger
    },
  });

  console.log("UPSELL PREVIEW:", result);

  return Response.json(result);
}