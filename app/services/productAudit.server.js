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

async function writeScannedSample(runId, scans) {
  // Keep UI clean + idempotent
  await prisma.productAuditScan.deleteMany({ where: { runId } });

  if (!scans.length) return;

  // Insert one-by-one (chunked) so we never rely on createMany
  const chunks = chunkArray(scans, 50);

  for (const chunk of chunks) {
    await prisma.$transaction(
      chunk.map((row) => prisma.productAuditScan.create({ data: row }))
    );
  }
}

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
  let finalStatus = "completed";
  let finalError = null;

  try {
    while (true) {
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
            actionTaken: shouldDraft
              ? dryRun
                ? "WOULD_DRAFT"
                : "DRAFT"
              : "NONE",
          });
        }

        if (shouldDraft && p.status === "ACTIVE" && !dryRun) {
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
      await writeScannedSample(run.id, scannedBuffer);
    } catch (logErr) {
      const msg = String(logErr?.message || logErr);
      console.warn("Failed writing scanned sample:", msg);
      finalStatus = "failed";
      finalError = finalError ? `${finalError} | Scan logging failed: ${msg}` : msg;
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