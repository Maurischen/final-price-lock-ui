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
    "triggerCollectionId" TEXT,
    "triggerDiscountMode" TEXT NOT NULL DEFAULT 'NONE',
    "triggerDiscountValue" REAL,
    "triggerDiscountLabel" TEXT,
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
INSERT INTO "new_UpsellRule" ("createdAt", "endsAt", "hideIfOfferInCart", "hideIfOfferOutOfStock", "id", "isActive", "limitOnePerCart", "maxCartValue", "minCartValue", "name", "placement", "priority", "shop", "startsAt", "triggerCollectionId", "triggerMode", "triggerProductId", "triggerSku", "triggerTag", "triggerVariantId", "type", "updatedAt") SELECT "createdAt", "endsAt", "hideIfOfferInCart", "hideIfOfferOutOfStock", "id", "isActive", "limitOnePerCart", "maxCartValue", "minCartValue", "name", "placement", "priority", "shop", "startsAt", "triggerCollectionId", "triggerMode", "triggerProductId", "triggerSku", "triggerTag", "triggerVariantId", "type", "updatedAt" FROM "UpsellRule";
DROP TABLE "UpsellRule";
ALTER TABLE "new_UpsellRule" RENAME TO "UpsellRule";
CREATE INDEX "UpsellRule_shop_idx" ON "UpsellRule"("shop");
CREATE INDEX "UpsellRule_shop_isActive_idx" ON "UpsellRule"("shop", "isActive");
CREATE INDEX "UpsellRule_shop_placement_idx" ON "UpsellRule"("shop", "placement");
CREATE INDEX "UpsellRule_shop_triggerProductId_idx" ON "UpsellRule"("shop", "triggerProductId");
CREATE INDEX "UpsellRule_shop_triggerVariantId_idx" ON "UpsellRule"("shop", "triggerVariantId");
CREATE INDEX "UpsellRule_shop_triggerSku_idx" ON "UpsellRule"("shop", "triggerSku");
CREATE INDEX "UpsellRule_shop_triggerTag_idx" ON "UpsellRule"("shop", "triggerTag");
CREATE INDEX "UpsellRule_shop_triggerCollectionId_idx" ON "UpsellRule"("shop", "triggerCollectionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
