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

/**
 * SQLite-safe createMany helper:
 * - SQLite doesn't support skipDuplicates
 * - SQLite has a max variable limit (so chunk inserts)
 * - We clear scans for this runId first so the UI always reflects the latest attempt
 */
async function writeScannedSample(runId, scans) {
  // Always reset for this run (idempotent + keeps UI clean)
  await prisma.productAuditScan.deleteMany({ where: { runId } });

  if (!scans.length) return;

  const chunks = chunkArray(scans, 200);

  for (const chunk of chunks) {
    // createMany is fastest; chunking avoids sqlite variable limits
    await prisma.productAuditScan.createMany({ data: chunk });
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

  // Buffer only the first N scanned items for UI preview
  const scannedBuffer = [];

  let finalStatus = "completed";
  let finalError = null;

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

        // sample for UI
        if (scannedBuffer.length < logScannedLimit) {
          scannedBuffer.push({
            runId: run.id,
            shop,
            productGid: p.id,
            title: p.title,
            status: p.status,
            missingDescription,
            missingImages,
            actionTaken: shouldDraft
              ? dryRun
                ? "WOULD_DRAFT"
                : "DRAFT"
              : "NONE",
          });
        }

        // Only draft ACTIVE products; we already query active, but keep it safe
        if (shouldDraft && p.status === "ACTIVE" && !dryRun) {
          const updResp = await admin.graphql(UPDATE, {
            variables: { input: { id: p.id, status: "DRAFT" } },
          });

          const updJson = await updResp.json();
          const errs = updJson?.data?.productUpdate?.userErrors || [];

          if (errs.length) {
            // Keep going, but record the warning
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

        // Stop early for manual runs
        if (maxProducts && checked >= maxProducts) {
          after = null;
          break;
        }
      }

      if (maxProducts && checked >= maxProducts) break;

      if (!products.pageInfo.hasNextPage) break;
      after = products.pageInfo.endCursor;
    }
  } catch (e) {
    finalStatus = "failed";
    finalError = String(e?.message || e);
    throw e;
  } finally {
    // Always try write the scanned sample for UI (even if the run failed)
    try {
      await writeScannedSample(run.id, scannedBuffer);
    } catch (logErr) {
      // If logging fails, still update run record with original error + logging error hint
      const msg = String(logErr?.message || logErr);
      console.warn("Failed writing scanned sample:", msg);

      if (!finalError) finalError = `Scan logging failed: ${msg}`;
      else finalError = `${finalError} | Scan logging failed: ${msg}`;
      finalStatus = "failed";
    }

    await prisma.productAuditRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        checked,
        drafted,
        status: finalStatus,
        error: finalError,
      },
    });
  }

  return { runId: run.id, checked, drafted, dryRun };
}