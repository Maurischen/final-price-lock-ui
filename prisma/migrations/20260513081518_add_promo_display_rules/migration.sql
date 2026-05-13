/*
  Warnings:

  - You are about to drop the `StandalonePromoDiscount` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "StandalonePromoDiscount";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "PromoDisplayRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "sku" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "discountType" TEXT NOT NULL,
    "discountAmount" INTEGER,
    "discountPercent" REAL,
    "label" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PromoDisplayRule_shop_idx" ON "PromoDisplayRule"("shop");

-- CreateIndex
CREATE INDEX "PromoDisplayRule_sku_idx" ON "PromoDisplayRule"("sku");

-- CreateIndex
CREATE INDEX "PromoDisplayRule_source_idx" ON "PromoDisplayRule"("source");

-- CreateIndex
CREATE INDEX "PromoDisplayRule_variantId_idx" ON "PromoDisplayRule"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoDisplayRule_shop_source_sku_key" ON "PromoDisplayRule"("shop", "source", "sku");
