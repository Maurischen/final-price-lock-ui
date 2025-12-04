// scripts/seed-price-guard.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Matrix’s primary shop domain
const MATRIX_SHOP = "matrix-warehouse-sa.myshopify.com";

// 🔹 Put all your seeded rules here
const RULES = [
    { sku: "SWV9030/10", minPrice: 310.0 },
    { sku: "U278-8GB",   minPrice: 60.0 },
    { sku: "U278-16GB",  minPrice: 65.0 },
    { sku: "U278-32GB",  minPrice: 70.0 },
  // { sku: "ANOTHER-SKU", minPrice: 1234 },
  // ...
];

async function main() {
  for (const { sku, minPrice } of RULES) {
    await prisma.priceGuard.upsert({
      where: {
        // use the compound unique key
        shop_sku: { shop: MATRIX_SHOP, sku },
      },
      update: { minPrice },
      create: { shop: MATRIX_SHOP, sku, minPrice },
    });
  }

  console.log("✅ Seeded PriceGuard rules for Matrix");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding PriceGuard", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
