import { useLoaderData } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import db from "../db.server";

const FIND_VARIANT_BY_SKU = `#graphql
  query FindVariantBySku($query: String!) {
    productVariants(first: 5, query: $query) {
      edges {
        node {
          id
          sku
          title
          product {
            id
            title
          }
        }
      }
    }
  }
`;

export async function loader({ request }) {
  await authenticate.admin(request);

  const guards = await db.priceGuard.findMany({
    where: {
      OR: [{ variantId: null }, { productId: null }],
    },
    orderBy: { shop: "asc" },
  });

  const results = [];

  for (const guard of guards) {
    const { id, shop, sku } = guard;

    if (!sku) {
      results.push({
        shop,
        sku: null,
        status: "skipped",
        message: "No SKU on record",
      });
      continue;
    }

    try {
      const { admin } = await unauthenticated.admin(shop);

      const response = await admin.graphql(FIND_VARIANT_BY_SKU, {
        variables: { query: `sku:${sku}` },
      });

      const jsonData = await response.json();
      const edges = jsonData?.data?.productVariants?.edges ?? [];

      if (!edges.length) {
        results.push({
          shop,
          sku,
          status: "not_found",
          message: "No Shopify variant match found",
        });
        continue;
      }

      const exactMatch = edges.find(
        (edge) => edge?.node?.sku?.trim() === sku.trim(),
      );

      const match = exactMatch?.node || edges[0]?.node;

      if (!match) {
        results.push({
          shop,
          sku,
          status: "not_found",
          message: "No usable Shopify match found",
        });
        continue;
      }

      await db.priceGuard.update({
        where: { id },
        data: {
          variantId: match.id,
          productId: match.product.id,
          mode: "MIN_ONLY",
          isEnabled: true,
        },
      });

      results.push({
        shop,
        sku,
        status: "updated",
        variantId: match.id,
        productId: match.product.id,
        productTitle: match.product.title,
        variantTitle: match.title,
      });
    } catch (error) {
      results.push({
        shop,
        sku,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    total: guards.length,
    updated: results.filter((r) => r.status === "updated").length,
    notFound: results.filter((r) => r.status === "not_found").length,
    errors: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}

export default function BackfillPriceGuardPage() {
  const data = useLoaderData();

  return (
    <div style={{ padding: 20 }}>
      <h1>PriceGuard Backfill</h1>
      <p>Total checked: {data.total}</p>
      <p>Updated: {data.updated}</p>
      <p>Not found: {data.notFound}</p>
      <p>Errors: {data.errors}</p>
      <p>Skipped: {data.skipped}</p>

      <pre
        style={{
          background: "#111",
          color: "#0f0",
          padding: 16,
          borderRadius: 8,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify(data.results, null, 2)}
      </pre>
    </div>
  );
}