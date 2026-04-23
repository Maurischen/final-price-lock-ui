import { resolveUpsells } from "../services/upsell-resolver.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { session, admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const sku = url.searchParams.get("sku");

    if (!sku) {
      return Response.json(
        { ok: false, error: "Missing SKU" },
        { status: 400 },
      );
    }

    const result = await resolveUpsells({
      shop: session.shop,
      placement: "PRODUCT_PAGE",
      context: { sku },
    });

    // Support both new multi-offer rules and old single-offer rules
    const offerEntries = [];

    for (const rule of result.rules || []) {
      if (Array.isArray(rule.offers) && rule.offers.length > 0) {
        for (const offer of rule.offers) {
          if (offer?.sku) {
            offerEntries.push({
              ruleId: rule.id,
              sku: offer.sku,
            });
          }
        }
      } else if (rule.offer?.sku) {
        offerEntries.push({
          ruleId: rule.id,
          sku: rule.offer.sku,
        });
      }
    }

    const offerSkus = [...new Set(offerEntries.map((entry) => entry.sku).filter(Boolean))];

    let productsBySku = {};

    if (offerSkus.length > 0) {
      const searchQuery = offerSkus.map((s) => `sku:${s}`).join(" OR ");

      const response = await admin.graphql(
        `#graphql
        query UpsellProducts($query: String!) {
          products(first: 20, query: $query) {
            nodes {
              id
              title
              handle
              featuredImage {
                url
                altText
              }
              variants(first: 20) {
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

      for (const product of nodes) {
        for (const variant of product.variants?.nodes || []) {
          if (!variant?.sku) continue;

          productsBySku[variant.sku] = {
            id: product.id,
            title: product.title,
            handle: product.handle,
            image: product.featuredImage?.url || null,
            imageAlt: product.featuredImage?.altText || product.title,
            variantId: variant.id,
            variantTitle: variant.title,
            sku: variant.sku,
            price: variant.price,
            availableForSale: variant.availableForSale ?? false,
          };
        }
      }
    }

    const rules = (result.rules || []).map((rule) => {
      // New multi-offer shape
      if (Array.isArray(rule.offers) && rule.offers.length > 0) {
        return {
          ...rule,
          offers: rule.offers.map((offer) => ({
            ...offer,
            product: offer?.sku ? productsBySku[offer.sku] || null : null,
          })),
        };
      }

      // Legacy single-offer shape
      return {
        ...rule,
        offer: {
          ...rule.offer,
          product: rule.offer?.sku ? productsBySku[rule.offer.sku] || null : null,
        },
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