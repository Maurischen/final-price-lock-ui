import { authenticate } from "../shopify.server";
import { scanAndDraftProducts } from "../services/productScan.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const result = await scanAndDraftProducts(admin, {
    dryRun: false,
  });

  return Response.json(result);
};