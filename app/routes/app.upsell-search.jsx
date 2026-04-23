import { authenticate } from "../shopify.server";

function normalizeQuery(q) {
  return String(q || "").trim();
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const type = normalizeQuery(url.searchParams.get("type"));
  const query = normalizeQuery(url.searchParams.get("q"));

  if (!type || !query || query.length < 2) {
    return Response.json({
      ok: true,
      results: [],
    });
  }

  try {
    if (type === "variant") {
      const response = await admin.graphql(
        `#graphql
        query VariantSearch($query: String!) {
          productVariants(first: 10, query: $query) {
            nodes {
              id
              sku
              title
              displayName
              product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        }`,
        {
          variables: {
            query: `sku:${query}* OR title:${query}*`,
          },
        },
      );

      const json = await response.json();
      const nodes = json?.data?.productVariants?.nodes || [];

      return Response.json({
        ok: true,
        results: nodes.map((variant) => ({
          id: variant.id,
          type: "variant",
          label: `${variant.product?.title || "Product"} — ${variant.displayName || variant.title || "Default"}`,
          secondary: variant.sku ? `SKU: ${variant.sku}` : "",
          sku: variant.sku || "",
          variantId: variant.id,
          productId: variant.product?.id || "",
          title: variant.product?.title || "",
          image: variant.product?.featuredImage?.url || "",
        })),
      });
    }

    if (type === "product") {
      const response = await admin.graphql(
        `#graphql
        query ProductSearch($query: String!) {
          products(first: 10, query: $query) {
            nodes {
              id
              title
              featuredImage {
                url
              }
            }
          }
        }`,
        {
          variables: {
            query: `title:${query}*`,
          },
        },
      );

      const json = await response.json();
      const nodes = json?.data?.products?.nodes || [];

      return Response.json({
        ok: true,
        results: nodes.map((product) => ({
          id: product.id,
          type: "product",
          label: product.title,
          secondary: product.id,
          productId: product.id,
          title: product.title,
          image: product?.featuredImage?.url || "",
        })),
      });
    }

    if (type === "collection") {
      const response = await admin.graphql(
        `#graphql
        query CollectionSearch($query: String!) {
          collections(first: 10, query: $query) {
            nodes {
              id
              title
              handle
            }
          }
        }`,
        {
          variables: {
            query: `title:${query}*`,
          },
        },
      );

      const json = await response.json();
      const nodes = json?.data?.collections?.nodes || [];

      return Response.json({
        ok: true,
        results: nodes.map((collection) => ({
          id: collection.id,
          type: "collection",
          label: collection.title,
          secondary: collection.handle ? `Handle: ${collection.handle}` : collection.id,
          collectionId: collection.id,
          title: collection.title,
        })),
      });
    }

    return Response.json({
      ok: false,
      error: "Unsupported search type.",
      results: [],
    });
  } catch (error) {
    console.error("Upsell search error:", error);

    return Response.json(
      {
        ok: false,
        error: error?.message || "Search failed.",
        results: [],
      },
      { status: 500 },
    );
  }
}