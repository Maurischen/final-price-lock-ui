function stripHtmlToText(html = "") {
  return String(html)
    // remove HTML comments (very common if people paste schema placeholders)
    .replace(/<!--[\s\S]*?-->/g, " ")

    // remove style/script blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")

    // convert common "empty" entities into space
    .replace(/&nbsp;|&#160;|&zwnj;|&zwj;/gi, " ")

    // remove tags
    .replace(/<[^>]+>/g, " ")

    // remove zero-width + BOM characters
    .replace(/[\u200B-\u200D\uFEFF]/g, "")

    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

export async function scanAndDraftProducts(
  admin,
  { dryRun = false, maxProducts = null } = {}
) {
  let after = null;
  let drafted = 0;
  let checked = 0;

  const query = `
    query Products($first: Int!, $after: String, $query: String!) {
      products(first: $first, after: $after, query: $query) {
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
      variables: { first: 100, after, query: "status:active" }, // ✅ only ACTIVE
    });

    const json = await response.json();
    const products = json?.data?.products;

    if (!products) {
      const errText =
        json?.errors?.map((e) => e.message).join("; ") ||
        "No products payload returned";
      throw new Error(`Product list query failed: ${errText}`);
    }

    for (const p of products.nodes) {
      checked++;

      const descText = stripHtmlToText(p.descriptionHtml || "");
      const missingDescription = descText.length < 30;
      const missingImages = (p.images?.edges || []).length === 0;

      const shouldDraft = missingDescription || missingImages;

      if (shouldDraft) {
        if (dryRun) {
          console.log("[DRY RUN] Would draft:", p.title);
        } else {
          const updResp = await admin.graphql(mutation, {
            variables: { input: { id: p.id, status: "DRAFT" } },
          });

          const updJson = await updResp.json();
          const errs = updJson?.data?.productUpdate?.userErrors || [];

          if (errs.length) {
            console.warn("Draft failed:", p.title, errs);
          } else {
            drafted++;
            console.log("Drafted:", p.title);
          }
        }
      }

      if (maxProducts && checked >= maxProducts) {
        return { checked, drafted };
      }
    }

    if (!products.pageInfo.hasNextPage) break;
    after = products.pageInfo.endCursor;
  }

  return { checked, drafted };
}