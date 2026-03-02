import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

// OR rule helpers
function stripHtmlToText(html = "") {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function auditShop(admin) {
  const LIST = `
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

  while (true) {
    const resp = await admin.graphql(LIST, { variables: { first: 100, after } });
    const json = await resp.json();

    const products = json?.data?.products;
    if (!products) break;

    for (const p of products.nodes) {
      checked++;

      const descText = stripHtmlToText(p.descriptionHtml || "");
      const missingDescription = descText.length === 0;
      const missingImages = (p.images?.edges || []).length === 0;

      const shouldDraft = missingDescription || missingImages; // ✅ OR rule

      // Safety: only move ACTIVE -> DRAFT
      if (shouldDraft && p.status === "ACTIVE") {
        const updResp = await admin.graphql(UPDATE, {
          variables: { input: { id: p.id, status: "DRAFT" } },
        });
        const updJson = await updResp.json();

        const errs = updJson?.data?.productUpdate?.userErrors || [];
        if (errs.length) {
          console.warn("Draft failed:", p.title, errs);
        } else {
          drafted++;
        }
      }
    }

    if (!products.pageInfo.hasNextPage) break;
    after = products.pageInfo.endCursor;
  }

  return { checked, drafted };
}

export const loader = async ({ request }) => {
  // ✅ Protect this route so nobody else can hit it
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get all distinct shops from stored sessions
  const shops = await prisma.session.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });

  const results = [];
  let totalChecked = 0;
  let totalDrafted = 0;

  for (const { shop } of shops) {
    try {
      // ✅ This is the key change: get an Admin client without a user request
      const { admin } = await unauthenticated.admin(shop);

      const { checked, drafted } = await auditShop(admin);

      totalChecked += checked;
      totalDrafted += drafted;

      results.push({ shop, ok: true, checked, drafted });

      // Gentle pause between shops
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      results.push({ shop, ok: false, error: String(e?.message || e) });
    }
  }

  return Response.json({
    ok: true,
    shops: results.length,
    totalChecked,
    totalDrafted,
    results,
  });
};