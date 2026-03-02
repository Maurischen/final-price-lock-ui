export async function scanAndDraftProducts(admin, { dryRun = false } = {}) {
  let after = null;
  let drafted = 0;
  let checked = 0;

  const query = `
    query Products($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          status
          descriptionHtml
          images(first: 1) { edges { node { id } } }
        }
      }
    }
  `;

  const mutation = `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id status }
        userErrors { field message }
      }
    }
  `;

  while (true) {
    const response = await admin.graphql(query, {
      variables: { first: 100, after },
    });

    const data = await response.json();
    const products = data.data.products;

    for (const p of products.nodes) {
      checked++;

      const descText = p.descriptionHtml
        ?.replace(/<[^>]+>/g, "")
        ?.trim() || "";

      const missingDescription = descText.length === 0;
      const missingImages = p.images.edges.length === 0;

      const shouldDraft = missingDescription || missingImages;

      if (shouldDraft && p.status === "ACTIVE") {
        if (dryRun) {
          console.log("[DRY RUN] Would draft:", p.title);
          continue;
        }

        await admin.graphql(mutation, {
          variables: {
            input: {
              id: p.id,
              status: "DRAFT",
            },
          },
        });

        drafted++;
        console.log("Drafted:", p.title);
      }
    }

    if (!products.pageInfo.hasNextPage) break;
    after = products.pageInfo.endCursor;
  }

  return { checked, drafted };
}