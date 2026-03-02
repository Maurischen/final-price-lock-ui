import shopify from "../shopify.server";
import { scanAndDraftProducts } from "../services/productScan.server";

export const loader = async () => {
  const sessions = await shopify.sessionStorage.findSessionsByShop("your-store.myshopify.com");

  if (!sessions.length) {
    throw new Error("No session found");
  }

  const session = sessions[0];
  const admin = new shopify.api.clients.Graphql({
    session,
  });

  const result = await scanAndDraftProducts(admin);

  return Response.json(result);
};