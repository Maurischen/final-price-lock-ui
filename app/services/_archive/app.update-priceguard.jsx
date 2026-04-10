import db from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  const sku = url.searchParams.get("sku");
  const mode = url.searchParams.get("mode");
  const lockedPrice = url.searchParams.get("lockedPrice");

  if (!sku) {
    return new Response("Missing sku");
  }

  const updated = await db.priceGuard.updateMany({
    where: { sku },
    data: {
      mode: mode || "EXACT_LOCK",
      lockedPrice: lockedPrice ? Number(lockedPrice) : null,
      isEnabled: true,
    },
  });

  return new Response(
    JSON.stringify(
      {
        success: true,
        updated,
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json" } }
  );
};