import shopify from "../shopify.server";
import prisma from "../db.server";

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
    const resp = await admin.query({
      data: { query: LIST, variables: { first: 100, after } },
    });

    const products = resp.body.data.products;

    for (const p of products.nodes) {
      checked++;

      const descText = stripHtmlToText(p.descriptionHtml || "");
      const missingDescription = descText.length === 0;
      const missingImages = (p.images?.edges || []).length === 0;

      const shouldDraft = missingDescription || missingImages; // ✅ OR rule

      // Safety: only move ACTIVE -> DRAFT
      if (shouldDraft && p.status === "ACTIVE") {
        await admin.query({
          data: { query: UPDATE, variables: { input: { id: p.id, status: "DRAFT" } } },
        });
        drafted++;
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

  // 1) Find all distinct shops that have sessions
  // Prisma model name is usually "session" in Shopify CLI apps.
  // If yours differs (e.g., Session), change prisma.session -> prisma.session
  const shops = await prisma.session.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });

  const results = [];
  let totalChecked = 0;
  let totalDrafted = 0;

  for (const { shop } of shops) {
    try {
      // 2) Prefer OFFLINE sessions for background jobs (isOnline = false)
      // Also prefer the most recently updated one.
      const offline = await prisma.session.findFirst({
        where: { shop, isOnline: false },
        orderBy: { updatedAt: "desc" },
      });

      if (!offline) {
        results.push({ shop, ok: false, error: "No offline session found" });
        continue;
      }

      // 3) Build Admin client for this shop
      const admin = new shopify.api.clients.Graphql({ session: offline });

      // 4) Audit & draft
      const { checked, drafted } = await auditShop(admin);

      totalChecked += checked;
      totalDrafted += drafted;

      results.push({ shop, ok: true, checked, drafted });

      // Optional: small pause between shops to be gentle with rate limits
      await new Promise((r) => setTimeout(r, 250));
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