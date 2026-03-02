import prisma from "../db.server";

function stripHtmlToText(html = "") {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function safeCreateManyScans(scans) {
  if (!scans.length) return;

  // Prisma on SQLite doesn't support skipDuplicates.
  // Also: SQLite has a max variables limit, so we chunk inserts.
  const chunks = chunkArray(scans, 200);

  for (const chunk of chunks) {
    try {
      await prisma.productAuditScan.createMany({ data: chunk });
    } catch (e) {
      // If you add a @@unique([runId, productGid]) later, duplicates would throw.
      // Fallback to per-row insert and ignore duplicates gracefully.
      for (const row of chunk) {
        try {
          await prisma.productAuditScan.create({ data: row });
        } catch (rowErr) {
          // Ignore unique constraint errors; throw anything else.
          const msg = String(rowErr?.message || rowErr);
          if (
            msg.includes("Unique constraint failed") ||
            msg.includes("P2002")
          ) {
            continue;
          }
          throw rowErr;
        }
      }
    }
  }
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
  maxProducts = null,
  logScannedLimit = 200,
} = {}) {
  if (!shop) throw new Error("runProductAudit: missing `shop`");
  if (!admin) throw new Error("runProductAudit: missing `admin` client");

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

  const scannedBuffer = [];

  try {
    while (true) {
      const resp = await admin.graphql(LIST, {
        variables: {
          first: 100,
          after,
          query: "status:active",
        },
      });

      const json = await resp.json();
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
        const missingDescription = descText.length === 0;
        const missingImages = (p.images?.edges || []).length === 0;

        const shouldDraft = missingDescription || missingImages;

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

        if (shouldDraft && p.status === "ACTIVE") {
          if (!dryRun) {
            const updResp = await admin.graphql(UPDATE, {
              variables: { input: { id: p.id, status: "DRAFT" } },
            });
            const updJson = await updResp.json();
            const errs = updJson?.data?.productUpdate?.userErrors || [];

            if (errs.length) {
              console.warn("Draft failed:", p.title, errs);
            } else {
              drafted++;

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
          }
        }

        if (maxProducts && checked >= maxProducts) {
          after = null;
          break;
        }
      }

      if (maxProducts && checked >= maxProducts) break;

      if (!products.pageInfo.hasNextPage) break;
      after = products.pageInfo.endCursor;
    }

    // Save scanned sample (SQLite-safe)
    await safeCreateManyScans(scannedBuffer);

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
    // Attempt to save scannedBuffer even on failure
    try {
      await safeCreateManyScans(scannedBuffer);
    } catch (ignored) {}

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