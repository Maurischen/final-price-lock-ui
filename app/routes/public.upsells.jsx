import { resolveBundlerOffers } from "../services/bundler-resolver.server";
import { resolveUpsells } from "../services/upsell-resolver.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { session, admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);
    const sku = url.searchParams.get("sku");
    const type = url.searchParams.get("type");

    if (!sku) {
      return Response.json(
        { ok: false, error: "Missing SKU" },
        { status: 400 },
      );
    }

    // Get the current trigger product context, including collections
    if (type === "bundler") {
  const rules = await resolveBundlerOffers({
    shop: session.shop,
    sku,
  });

  const offerSkus = [
  ...new Set(
    (rules || [])
      .flatMap((rule) => rule.offerSkus || [])
      .filter(Boolean),
  ),
];

const productsBySku = {};

for (const offerSku of offerSkus) {
  const response = await admin.graphql(
    `#graphql
    query BundlerProductBySku($query: String!) {
      productVariants(first: 1, query: $query) {
        nodes {
          id
          sku
          title
          price
          availableForSale
          product {
            id
            title
            handle
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }`,
    {
      variables: {
        query: `sku:${offerSku}`,
      },
    },
  );

  const json = await response.json();
  const variant = json?.data?.productVariants?.nodes?.[0];

  if (!variant?.sku) continue;

  productsBySku[offerSku] = {
    id: variant.product.id,
    title: variant.product.title,
    handle: variant.product.handle,
    image: variant.product.featuredImage?.url || null,
    imageAlt: variant.product.featuredImage?.altText || variant.product.title,
    variantId: variant.id,
    variantTitle: variant.title,
    sku: variant.sku,
    price: variant.price,
    availableForSale: variant.availableForSale ?? false,
  };
}

  const formattedRules = (rules || []).map((rule) => ({
    ...rule,
    offers: (rule.offerSkus || []).map((offerSku) => ({
      sku: offerSku,
      product: productsBySku[offerSku] || null,
    })),
  }));

  return Response.json({
    ok: true,
    count: formattedRules.length,
    rules: formattedRules,
  });
}
    const triggerResponse = await admin.graphql(
      `#graphql
      query TriggerProductBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          nodes {
            id
            sku
            product {
              id
              tags
              collections(first: 50) {
                nodes {
                  id
                }
              }
            }
          }
        }
      }`,
      {
        variables: {
          query: `sku:${sku}`,
        },
      },
    );

    const triggerJson = await triggerResponse.json();
    const triggerVariant =
      triggerJson?.data?.productVariants?.nodes?.[0] || null;

    const triggerProductId = triggerVariant?.product?.id || null;
    const triggerVariantId = triggerVariant?.id || null;
    const triggerTags = triggerVariant?.product?.tags || [];
    const triggerCollectionIds =
      triggerVariant?.product?.collections?.nodes?.map((c) => c.id) || [];

    const result = await resolveUpsells({
      shop: session.shop,
      placement: "PRODUCT_PAGE",
      context: {
        productId: triggerProductId,
        variantId: triggerVariantId,
        sku,
        tags: triggerTags,
        collectionIds: triggerCollectionIds,
      },
    });

    const offerSkus = [
      ...new Set(
        (result.rules || [])
          .flatMap((rule) => rule.offers || [])
          .map((offer) => offer?.sku)
          .filter(Boolean),
      ),
    ];

    const productsBySku = {};

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

    const rules = (result.rules || []).map((rule) => ({
      ...rule,
      offers: (rule.offers || []).map((offer) => ({
        ...offer,
        product: offer?.sku ? productsBySku[offer.sku] || null : null,
      })),
    }));

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