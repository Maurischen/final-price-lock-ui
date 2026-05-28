import prisma from "../db.server.js";

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function resolveBundlerOffers({
  shop,
  sku,
}) {
  if (!sku) return [];

  const rules = await prisma.bundlerRule.findMany({
    where: {
      shop,
      isActive: true,
    },
    orderBy: [
      { priority: "asc" },
      { createdAt: "desc" },
    ],
  });

  const matchingRules = rules.filter((rule) => {
    const triggerSkus = safeJsonArray(rule.triggerSkusJson);

    return triggerSkus.some(
      (triggerSku) =>
        String(triggerSku).trim().toLowerCase() ===
        String(sku).trim().toLowerCase(),
    );
  });

  return matchingRules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    triggerSkus: safeJsonArray(rule.triggerSkusJson),
    offerSkus: safeJsonArray(rule.offerSkusJson),
    priority: rule.priority,
  }));
}