import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rules = [
    { sku: "SWV9030/10", minPrice: 310.0 },
    { sku: "U278-8GB",   minPrice: 60.0 },
    { sku: "U278-16GB",  minPrice: 65.0 },
    { sku: "U278-32GB",  minPrice: 70.0 },
  ];

  for (const rule of rules) {
    await prisma.priceGuard.upsert({
      where: { sku: rule.sku },
      update: { minPrice: rule.minPrice },
      create: {
        sku: rule.sku,
        minPrice: rule.minPrice,
      },
    });

    console.log(
      `PriceGuard rule saved for ${rule.sku} at ${rule.minPrice.toFixed(2)}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
