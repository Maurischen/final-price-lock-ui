import prisma from "../db.server";

// --------- Helpers ---------

function stripHtmlToText(html = "") {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/&nbsp;|&#160;|&zwnj;|&zwj;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Store ONLY problem/action rows for the UI (not a "random scan sample").
 * Idempotent per runId.
 */
async function writeActionLogRows(runId, rows) {
  await prisma.productAuditScan.deleteMany({ where: { runId } });
  if (!rows.length) return;

  const chunks = chunkArray(rows, 50); // safe for SQLite variable limits
  for (const chunk of chunks) {
    await prisma.$transaction(
      chunk.map((row) => prisma.productAuditScan.create({ data: row }))
    );
  }
}

/**
 * Get Online Store publication ID from env.
 * Set ONLINE_STORE_PUBLICATION_ID to the "Online Store" publication GID.
 */
function getOnlineStorePublicationId() {
  const id = process.env.ONLINE_STORE_PUBLICATION_ID;
  if (!id) {
    throw new Error(
      'Missing ONLINE_STORE_PUBLICATION_ID env var. Set it to the "Online Store" publication GID.'
    );
  }
  return id;
}

// --------- Main ---------

export async function runProductAudit({
  shop,
  admin,
  dryRun = false,
  maxProducts = null,
  actionLogLimit = 2000,
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
          totalInventory
          images(first: 1) { edges { node { id } } }
          resourcePublications(first: 50) {
            nodes {
              publication { id }
              isPublished
            }
          }
        }
      }
    }
  `;

  const DRAFT = `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id status }
        userErrors { field message }
      }
    }
  `;

  const UNPUBLISH = `
    mutation PublishableUnpublish($id: ID!, $publicationId: ID!) {
      publishableUnpublish(id: $id, input: { publicationId: $publicationId }) {
        userErrors { field message }
      }
    }
  `;

  let after = null;

  let checked = 0;
  let drafted = 0;

  let unpublished = 0;
  let alreadyDraft = 0;
  let errors = 0;

  let missingDescCount = 0;
  let missingImgCount = 0;
  let zeroStockCount = 0;

  const actionRows = [];

  let finalStatus = "completed";
  let finalError = null;

  const onlineStorePublicationId = getOnlineStorePublicationId();

  try {
    while (true) {
      // ✅ ACTIVE ONLY
      const resp = await admin.graphql(LIST, {
        variables: { first: 100, after, query: "status:active" },
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
        const missingDescription = descText.length < 30;
        const missingImages = (p.images?.edges || []).length === 0;
        const zeroStock = (p.totalInventory ?? 0) <= 0;

        if (missingDescription) missingDescCount++;
        if (missingImages) missingImgCount++;
        if (zeroStock) zeroStockCount++;

        const shouldDraft = missingDescription || missingImages;

        let actionTaken = "NONE";

        // 1) Draft if missing desc/images
        if (shouldDraft) {
          if (p.status === "DRAFT") {
            actionTaken = "ALREADY_DRAFT";
            alreadyDraft++;
          } else if (p.status === "ACTIVE") {
            if (dryRun) {
              actionTaken = "WOULD_DRAFT";
            } else {
              const updResp = await admin.graphql(DRAFT, {
                variables: { input: { id: p.id, status: "DRAFT" } },
              });

              const updJson = await updResp.json();
              const errs = updJson?.data?.productUpdate?.userErrors || [];

              if (errs.length) {
                actionTaken = "ERROR";
                errors++;
                console.warn("Draft failed:", p.title, JSON.stringify(errs, null, 2));
              } else {
                actionTaken = "DRAFT";
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
          } else {
            actionTaken = "ERROR";
            errors++;
            console.warn("Unexpected status during ACTIVE scan:", p.title, p.status);
          }
        } else if (zeroStock) {
          // 2) Otherwise unpublish if zero stock (Online Store)
          const onlinePub = (p.resourcePublications?.nodes || []).find(
            (rp) => rp.publication?.id === onlineStorePublicationId
          );

          const isPublishedOnOnlineStore = onlinePub?.isPublished === true;

          if (isPublishedOnOnlineStore) {
            if (dryRun) {
              actionTaken = "WOULD_UNPUBLISH_ZERO_STOCK";
            } else {
              const unpubResp = await admin.graphql(UNPUBLISH, {
                variables: {
                  id: p.id,
                  publicationId: onlineStorePublicationId,
                },
              });

              const unpubJson = await unpubResp.json();
              const errs = unpubJson?.data?.publishableUnpublish?.userErrors || [];

              if (errs.length) {
                actionTaken = "ERROR";
                errors++;
                console.warn("Unpublish failed:", p.title, JSON.stringify(errs, null, 2));
              } else {
                actionTaken = "UNPUBLISHED_ZERO_STOCK";
                unpublished++;
              }
            }
          }
        }

        // Store ONLY action/problem rows for UI
        if (actionTaken !== "NONE" && actionRows.length < actionLogLimit) {
          actionRows.push({
            runId: run.id,
            shop,
            productGid: p.id,
            title: p.title,
            status: p.status,
            missingDescription,
            missingImages,
            actionTaken,
          });
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
  } catch (e) {
    finalStatus = "failed";
    finalError = String(e?.message || e);
    throw e;
  } finally {
    try {
      await writeActionLogRows(run.id, actionRows);
    } catch (logErr) {
      const msg = String(logErr?.message || logErr);
      console.warn("Failed writing action log rows:", msg);
      finalStatus = "failed";
      finalError = finalError
        ? `${finalError} | Action log write failed: ${msg}`
        : msg;
    }

    console.log("AUDIT SUMMARY", {
      shop,
      checked,
      drafted,
      unpublished,
      alreadyDraft,
      errors,
      missingDescCount,
      missingImgCount,
      zeroStockCount,
      dryRun,
    });

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

  return {
    runId: run.id,
    checked,
    drafted,
    unpublished,
    alreadyDraft,
    errors,
    missingDescCount,
    missingImgCount,
    zeroStockCount,
    dryRun,
  };
}