import prisma from "../db.server";

/**
 * Convert comma/newline separated SKUs into a clean array.
 */
export function parseSkuList(value = "") {
  return String(value)
    .split(/[\n,]+/)
    .map((sku) => sku.trim())
    .filter(Boolean);
}

export function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listBundlerRules(shop) {
  return prisma.bundlerRule.findMany({
    where: { shop },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
}

export async function createBundlerRule({
  shop,
  name,
  triggerSkus,
  offerSkus,
  isActive = true,
  priority = 100,
}) {
  return prisma.bundlerRule.create({
    data: {
      shop,
      name,
      triggerSkusJson: JSON.stringify(triggerSkus),
      offerSkusJson: JSON.stringify(offerSkus),
      isActive,
      priority: Number(priority) || 100,
    },
  });
}

export async function updateBundlerRule({
  id,
  shop,
  name,
  triggerSkus,
  offerSkus,
  isActive,
  priority,
}) {
  return prisma.bundlerRule.updateMany({
    where: { id, shop },
    data: {
      name,
      triggerSkusJson: JSON.stringify(triggerSkus),
      offerSkusJson: JSON.stringify(offerSkus),
      isActive,
      priority: Number(priority) || 100,
    },
  });
}

export async function deleteBundlerRule({ id, shop }) {
  return prisma.bundlerRule.deleteMany({
    where: { id, shop },
  });
}

export async function getActiveBundlerRules(shop) {
  return prisma.bundlerRule.findMany({
    where: {
      shop,
      isActive: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
}