import { resolveUpsells } from "../services/upsell-resolver.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { session, admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const sku = url.searchParams.get("sku");

    if (!sku) {
      return Response.json({ ok: false, error: "Missing SKU" }, { status: 400 });
    }

    const result = await resolveUpsells({
      shop: session.shop,
      placement: "PRODUCT_PAGE",
      context: { sku },
    });

    const offerSkus = result.rules
      .map((rule) => rule.offer?.sku)
      .filter(Boolean);

    let products = [];

    if (offerSkus.length > 0) {
      const searchQuery = offerSkus.map((s) => `sku:${s}`).join(" OR ");

      const response = await admin.graphql(
        `#graphql
        query UpsellProducts($query: String!) {
          products(first: 10, query: $query) {
            nodes {
              id
              title
              handle
              featuredImage {
                url
                altText
              }
              variants(first: 10) {
                nodes {
                  id
                  sku
                  title
                  price
                  availableForSale
                }
              }
            }
          }
        }`,
        {
          variables: { query: searchQuery },
        },
      );

      const json = await response.json();
      const nodes = json?.data?.products?.nodes || [];

      products = nodes
        .map((product) => {
          const matchingVariant =
            product.variants?.nodes?.find((variant) =>
              offerSkus.includes(variant.sku),
            ) || product.variants?.nodes?.[0];

          return {
            id: product.id,
            title: product.title,
            handle: product.handle,
            image: product.featuredImage?.url || null,
            imageAlt: product.featuredImage?.altText || product.title,
            variantId: matchingVariant?.id || null,
            variantTitle: matchingVariant?.title || null,
            sku: matchingVariant?.sku || null,
            price: matchingVariant?.price || null,
            availableForSale: matchingVariant?.availableForSale ?? false,
          };
        })
        .filter((p) => p.sku);
    }

    const rules = result.rules.map((rule) => {
      const matchedProduct = products.find(
        (product) => product.sku === rule.offer?.sku,
      );

      return {
        id: rule.id,
        name: rule.name,
        type: rule.type,
        placement: rule.placement,
        priority: rule.priority,
        offer: {
          ...rule.offer,
          product: matchedProduct || null,
        },
        discount: rule.discount,
      };
    });

    return Response.json({
      ok: true,
      count: rules.length,
      rules,
    });
  } catch (error) {
    console.error("UPSSELL ERROR:", error);

    return Response.json(
      {
        ok: false,
        error: error?.message || "Upsell proxy error",
      },
      { status: 500 },
    );
  }
}