import { authenticate } from "../shopify.server";

export async function getProductsBySku(admin, skus = []) {
  if (!skus.length) return [];

  const query = `#graphql
    query ($query: String!) {
      products(first: 10, query: $query) {
        nodes {
          id
          title
          featuredImage {
            url
          }
          variants(first: 10) {
            nodes {
              id
              sku
              price
              inventoryQuantity
            }
          }
        }
      }
    }
  `;

  const searchQuery = skus.map(s => `sku:${s}`).join(" OR ");

  const response = await admin.graphql(query, {
    variables: { query: searchQuery },
  });

  const json = await response.json();

  return json.data.products.nodes;
}