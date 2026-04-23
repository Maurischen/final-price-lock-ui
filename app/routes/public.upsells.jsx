import { resolveUpsells } from "../services/upsell-resolver.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.public(request);

  const url = new URL(request.url);
  const sku = url.searchParams.get("sku");

  if (!sku) {
    return Response.json({ ok: false });
  }

  const result = await resolveUpsells({
    shop: session.shop,
    placement: "PRODUCT_PAGE",
    context: { sku },
  });

  const skus = result.rules.map(r => r.offer.sku).filter(Boolean);

  let products = [];

  if (skus.length) {
    const query = `#graphql
      query ($query: String!) {
        products(first: 5, query: $query) {
          nodes {
            id
            title
            featuredImage {
              url
            }
            variants(first: 1) {
              nodes {
                id
                price
                sku
              }
            }
          }
        }
      }
    `;

    const search = skus.map(s => `sku:${s}`).join(" OR ");

    const response = await admin.graphql(query, {
      variables: { query: search },
    });

    const json = await response.json();
    products = json.data.products.nodes;
  }

  return Response.json({
    ok: true,
    rules: result.rules,
    products,
  });
}