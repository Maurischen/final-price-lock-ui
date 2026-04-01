// services/zero-price-audit.server.js

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function buildZeroPriceAuditCsv(rows) {
  const headers = [
    "Product ID",
    "Product Title",
    "Handle",
    "Status",
    "Published Count",
    "Online Store URL",
    "Variant ID",
    "Variant Title",
    "SKU",
    "Price",
  ];

  const csvLines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) =>
      [
        row.productId,
        row.productTitle,
        row.handle,
        row.status,
        row.publishedCount,
        row.onlineStoreUrl,
        row.variantId,
        row.variantTitle,
        row.sku,
        row.price,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  return csvLines.join("\n");
}

export async function runZeroPriceAudit(admin) {
  const flaggedRows = [];
  let checkedProducts = 0;
  let checkedVariants = 0;
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
      query ZeroPriceAudit($first: Int!, $after: String) {
        products(
          first: $first
          after: $after
          query: "status:active price:0"
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            handle
            status
            onlineStoreUrl
            resourcePublicationsCount(onlyPublished: true) {
              count
            }
            variants(first: 250) {
              nodes {
                id
                title
                sku
                price
              }
            }
          }
        }
      }`,
      {
        variables: {
          first: 100,
          after,
        },
      },
    );

    const json = await response.json();

    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }

    const products = json?.data?.products?.nodes || [];
    const pageInfo = json?.data?.products?.pageInfo;

    for (const product of products) {
      checkedProducts += 1;

      const publishedCount =
        product?.resourcePublicationsCount?.count || 0;

      if (publishedCount < 1) {
        continue;
      }

      const variants = product?.variants?.nodes || [];

      for (const variant of variants) {
        checkedVariants += 1;

        const priceNumber = Number(variant.price || 0);

        if (priceNumber === 0) {
          flaggedRows.push({
            productId: product.id,
            productTitle: product.title,
            handle: product.handle,
            status: product.status,
            publishedCount,
            onlineStoreUrl: product.onlineStoreUrl || "",
            variantId: variant.id,
            variantTitle: variant.title,
            sku: variant.sku || "",
            price: variant.price,
          });
        }
      }
    }

    hasNextPage = pageInfo?.hasNextPage || false;
    after = pageInfo?.endCursor || null;
  }

  return {
    ok: true,
    checkedProducts,
    checkedVariants,
    flaggedCount: flaggedRows.length,
    flaggedRows,
  };
}