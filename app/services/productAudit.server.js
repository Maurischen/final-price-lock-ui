import prisma from "../db.server";

function stripHtmlToText(html = "") {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function createManyInBatches(model, rows, batchSize = 200) {
  if (!rows?.length) return;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await model.createMany({
      data: batch,
      skipDuplicates: true,
    });
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

  // Save only a limited sample for UI visibility (max logScannedLimit)
  const scannedBuffer = [];
  // If you ever decide to bulk-insert changed items, buffer them too
  const changedBuffer = [];

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
          json?.data?.errors ||
          "No products payload returned";
        throw new Error(`Product list query failed: ${errText}`);
      }

      for (const p of products.nodes) {
        checked++;

        const descText = stripHtmlToText(p.descriptionHtml || "");
        const missingDescription = descText.length === 0;
        const missingImages = (p.images?.edges || []).length === 0;

        const shouldDraft = missingDescription || missingImages;

        // log only first N scanned rows (sample)
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
              console.warn("Draft failed:", p.title, errs);
            } else {
              drafted++;

              // You can keep this as single insert (fine), OR buffer and batch later.
              // Buffering is safer if you ever expect hundreds/thousands drafted.
              changedBuffer.push({
                runId: run.id,
                shop,
                productGid: p.id,
                title: p.title,
                prevStatus: "ACTIVE",
                newStatus: "DRAFT",
                missingDescription,
                missingImages,
              });
            }
          }
        }

        // manual stop
        if (maxProducts && checked >= maxProducts) {
          after = null;
          break;
        }
      }

      if (maxProducts && checked >= maxProducts) break;

      if (!products.pageInfo.hasNextPage) break;
      after = products.pageInfo.endCursor;
    }

    // ✅ Write scanned sample in batches (prevents oversized createMany)
    await createManyInBatches(prisma.productAuditScan, scannedBuffer, 200);

    // ✅ Write changed items (if any) in batches (safe + fast)
    await createManyInBatches(prisma.productAuditItem, changedBuffer, 200);

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
    // Try to save whatever we collected (best-effort)
    try {
      await createManyInBatches(prisma.productAuditScan, scannedBuffer, 200);
      await createManyInBatches(prisma.productAuditItem, changedBuffer, 200);
    } catch {
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