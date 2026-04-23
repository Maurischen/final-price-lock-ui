/*
  Warnings:

  - You are about to drop the column `discountLabel` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `discountMode` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `discountValue` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `offerMessage` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `offerMode` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `offerProductId` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `offerSku` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `offerTitleOverride` on the `UpsellRule` table. All the data in the column will be lost.
  - You are about to drop the column `offerVariantId` on the `UpsellRule` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UpsellRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "triggerMode" TEXT NOT NULL,
    "triggerProductId" TEXT,
    "triggerVariantId" TEXT,
    "triggerSku" TEXT,
    "triggerTag" TEXT,
    "minCartValue" REAL,
    "maxCartValue" REAL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "limitOnePerCart" BOOLEAN NOT NULL DEFAULT true,
    "hideIfOfferInCart" BOOLEAN NOT NULL DEFAULT true,
    "hideIfOfferOutOfStock" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UpsellRule" ("createdAt", "endsAt", "hideIfOfferInCart", "hideIfOfferOutOfStock", "id", "isActive", "limitOnePerCart", "maxCartValue", "minCartValue", "name", "placement", "priority", "shop", "startsAt", "triggerMode", "triggerProductId", "triggerSku", "triggerTag", "triggerVariantId", "type", "updatedAt") SELECT "createdAt", "endsAt", "hideIfOfferInCart", "hideIfOfferOutOfStock", "id", "isActive", "limitOnePerCart", "maxCartValue", "minCartValue", "name", "placement", "priority", "shop", "startsAt", "triggerMode", "triggerProductId", "triggerSku", "triggerTag", "triggerVariantId", "type", "updatedAt" FROM "UpsellRule";
DROP TABLE "UpsellRule";
ALTER TABLE "new_UpsellRule" RENAME TO "UpsellRule";
CREATE INDEX "UpsellRule_shop_idx" ON "UpsellRule"("shop");
CREATE INDEX "UpsellRule_shop_isActive_idx" ON "UpsellRule"("shop", "isActive");
CREATE INDEX "UpsellRule_shop_placement_idx" ON "UpsellRule"("shop", "placement");
CREATE INDEX "UpsellRule_shop_triggerProductId_idx" ON "UpsellRule"("shop", "triggerProductId");
CREATE INDEX "UpsellRule_shop_triggerVariantId_idx" ON "UpsellRule"("shop", "triggerVariantId");
CREATE INDEX "UpsellRule_shop_triggerSku_idx" ON "UpsellRule"("shop", "triggerSku");
CREATE INDEX "UpsellRule_shop_triggerTag_idx" ON "UpsellRule"("shop", "triggerTag");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
