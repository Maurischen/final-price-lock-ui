import prisma from "../db.server";

function stripHtmlToText(html = "") {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Runs an audit for ONE shop using the provided authenticated `admin` client.
 * - Scans ACTIVE products only
 * - Drafts product if missing description OR missing images
 * - Logs:
 *    - A limited sample of scanned products (for UI visibility)
 *    - All changed products (drafted) with reasons
 */
export async function runProductAudit({
  shop,
  admin,
  dryRun = false,
  maxProducts = null, // e.g. 200 for manual quick runs
  logScannedLimit = 200, // store only first N scanned items so DB doesn't explode
} = {}) {
  if (!shop) throw new Error("runProductAudit: missing `shop`");
  if (!admin) throw new Error("runProductAudit: missing `admin` client");

  // Create run record
  const run = await prisma.productAuditRun.create({
    data: { shop, status: "running" },
  });

  const LIST = `
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

  const UPDATE = `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id status }
        userErrors { field message }
      }
    }
  `;

  let after = null;
  let checked = 0;
  let drafted = 0;

  // We'll store a limited "scanned sample" for UI visibility
  const scannedBuffer = [];

  try {
    while (true) {
      const resp = await admin.graphql(LIST, {
        variables: {
          first: 100,
          after,
          query: "status:active", // ✅ only ACTIVE products
        },
      });

      const json = await resp.json();
      const products = json?.data?.products;

      if (!products) {
        // Helpful debug info if Shopify returns something unexpected
        const errText =
          json?.errors?.map((e) => e.message).join("; ") ||
          json?.data?.errors ||
          "No products payload returned";
        throw new Error(`Product list query failed: ${errText}`);
      }

      for (const p of products.nodes) {
        checked++;

        const descText = stripHtmlToText(p.descriptionHtml || "");
        const missingDescription = descText.length === 0;
        const missingImages = (p.images?.edges || []).length === 0;

        const shouldDraft = missingDescription || missingImages; // ✅ OR rule

        // Log a sample of scanned products (first N only)
        if (scannedBuffer.length < logScannedLimit) {
          scannedBuffer.push({
            runId: run.id,
            shop,
            productGid: p.id,
            title: p.title,
            status: p.status,
            missingDescription,
            missingImages,
            actionTaken: shouldDraft ? (dryRun ? "WOULD_DRAFT" : "DRAFT") : "NONE",
          });
        }

        if (shouldDraft) {
          if (!dryRun) {
            const updResp = await admin.graphql(UPDATE, {
              variables: { input: { id: p.id, status: "DRAFT" } },
            });
            const updJson = await updResp.json();
            const errs = updJson?.data?.productUpdate?.userErrors || [];

            if (errs.length) {
              // keep going, but note we couldn't change it
              console.warn("Draft failed:", p.title, errs);
            } else {
              drafted++;

              // Log every product we actually changed
              await prisma.productAuditItem.create({
                data: {
                  runId: run.id,
                  shop,
                  productGid: p.id,
                  title: p.title,
                  prevStatus: "ACTIVE",
                  newStatus: "DRAFT",
                  missingDescription,
                  missingImages,
                },
              });
            }
          } else {
            // DRY RUN counts "would draft" as drafted? usually no.
            // We'll NOT increment drafted in dry run.
          }
        }

        // Optional: stop early for manual runs
        if (maxProducts && checked >= maxProducts) {
          // Stop scanning further pages
          after = null;
          break;
        }
      }

      if (maxProducts && checked >= maxProducts) break;

      if (!products.pageInfo.hasNextPage) break;
      after = products.pageInfo.endCursor;
    }

    // Save scanned sample in one go (if you add the ProductAuditScan model)
    if (scannedBuffer.length) {
      await prisma.productAuditScan.createMany({
        data: scannedBuffer,
        skipDuplicates: true,
      });
    }

    await prisma.productAuditRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        checked,
        drafted,
        status: "completed",
        error: null,
      },
    });

    return { runId: run.id, checked, drafted, dryRun };
  } catch (e) {
    // Attempt to save scannedBuffer even on failure (useful for debugging)
    try {
      if (scannedBuffer.length) {
        await prisma.productAuditScan.createMany({
          data: scannedBuffer,
          skipDuplicates: true,
        });
      }
    } catch (ignored) {
      // ignore secondary logging errors
    }

    await prisma.productAuditRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        checked,
        drafted,
        status: "failed",
        error: String(e?.message || e),
      },
    });

    throw e;
  }
}