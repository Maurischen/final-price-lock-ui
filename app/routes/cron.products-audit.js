import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

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

function getOnlineStorePublicationId() {
  const id = process.env.ONLINE_STORE_PUBLICATION_ID;
  if (!id) {
    throw new Error(
      'Missing ONLINE_STORE_PUBLICATION_ID env var. Set it to the "Online Store" publication GID.'
    );
  }
  return id;
}

// --------- Core Audit Logic ---------

async function auditShop(admin) {
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

  const onlineStorePublicationId = getOnlineStorePublicationId();

  let after = null;

  let checked = 0;
  let drafted = 0;
  let unpublished = 0;

  let missingDescCount = 0;
  let missingImgCount = 0;
  let zeroStockCount = 0;

  const productQuery = "status:active";

  while (true) {
    const resp = await admin.graphql(LIST, {
      variables: { first: 100, after, query: productQuery },
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

      // 1) Draft if missing desc/images
      if (shouldDraft && p.status === "ACTIVE") {
        const updResp = await admin.graphql(DRAFT, {
          variables: { input: { id: p.id, status: "DRAFT" } },
        });

        const updJson = await updResp.json();
        const errs = updJson?.data?.productUpdate?.userErrors || [];

        if (errs.length) {
          console.warn("Draft failed:", p.title, JSON.stringify(errs, null, 2));
        } else {
          drafted++;
        }

        continue;
      }

      // 2) Otherwise unpublish from Online Store if zero stock
      if (zeroStock) {
        const onlinePub = (p.resourcePublications?.nodes || []).find(
          (rp) => rp.publication?.id === onlineStorePublicationId
        );

        const isPublishedOnOnlineStore = onlinePub?.isPublished === true;

        if (isPublishedOnOnlineStore) {
          const unpubResp = await admin.graphql(UNPUBLISH, {
            variables: {
              id: p.id,
              publicationId: onlineStorePublicationId,
            },
          });

          const unpubJson = await unpubResp.json();
          const errs = unpubJson?.data?.publishableUnpublish?.userErrors || [];

          if (errs.length) {
            console.warn(
              "Unpublish failed:",
              p.title,
              JSON.stringify(errs, null, 2)
            );
          } else {
            unpublished++;
          }
        }
      }
    }

    if (!products.pageInfo.hasNextPage) break;
    after = products.pageInfo.endCursor;
  }

  return {
    checked,
    drafted,
    unpublished,
    missingDescCount,
    missingImgCount,
    zeroStockCount,
  };
}

// --------- Cron Route ---------

export const loader = async ({ request }) => {
  const secret = request.headers.get("x-cron-secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shops = await prisma.session.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });

  const results = [];

  let totalChecked = 0;
  let totalDrafted = 0;
  let totalUnpublished = 0;

  for (const { shop } of shops) {
    try {
      const { admin } = await unauthenticated.admin(shop);

      const r = await auditShop(admin);

      totalChecked += r.checked;
      totalDrafted += r.drafted;
      totalUnpublished += r.unpublished;

      results.push({ shop, ok: true, ...r });

      // small delay to be gentle on rate limits
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (e) {
      results.push({ shop, ok: false, error: String(e?.message || e) });
    }
  }

  return Response.json({
    ok: true,
    shops: results.length,
    totalChecked,
    totalDrafted,
    totalUnpublished,
    results,
  });
};