CREATE TABLE "BundleDiscountRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerSku" TEXT,
    "triggerProductId" TEXT,
    "triggerVariantId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "BundleDiscountAccessory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BundleDiscountAccessory_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BundleDiscountRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StandaloneDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "UpsellTrigger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'SKU',
    "sku" TEXT,
    "collectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UpsellTrigger_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "UpsellRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BundleDiscountRule_shop_idx" ON "BundleDiscountRule"("shop");
CREATE INDEX "BundleDiscountRule_shop_active_idx" ON "BundleDiscountRule"("shop", "active");
CREATE INDEX "BundleDiscountRule_triggerSku_idx" ON "BundleDiscountRule"("triggerSku");
CREATE INDEX "BundleDiscountRule_triggerProductId_idx" ON "BundleDiscountRule"("triggerProductId");
CREATE INDEX "BundleDiscountRule_triggerVariantId_idx" ON "BundleDiscountRule"("triggerVariantId");

CREATE INDEX "BundleDiscountAccessory_ruleId_idx" ON "BundleDiscountAccessory"("ruleId");
CREATE INDEX "BundleDiscountAccessory_sku_idx" ON "BundleDiscountAccessory"("sku");
CREATE INDEX "BundleDiscountAccessory_productId_idx" ON "BundleDiscountAccessory"("productId");
CREATE INDEX "BundleDiscountAccessory_variantId_idx" ON "BundleDiscountAccessory"("variantId");

CREATE INDEX "StandaloneDiscount_shop_idx" ON "StandaloneDiscount"("shop");
CREATE INDEX "StandaloneDiscount_productId_idx" ON "StandaloneDiscount"("productId");
CREATE INDEX "StandaloneDiscount_variantId_idx" ON "StandaloneDiscount"("variantId");
CREATE UNIQUE INDEX "StandaloneDiscount_shop_sku_key" ON "StandaloneDiscount"("shop", "sku");

CREATE INDEX "UpsellTrigger_ruleId_idx" ON "UpsellTrigger"("ruleId");
CREATE INDEX "UpsellTrigger_triggerType_idx" ON "UpsellTrigger"("triggerType");
CREATE INDEX "UpsellTrigger_sku_idx" ON "UpsellTrigger"("sku");
CREATE INDEX "UpsellTrigger_collectionId_idx" ON "UpsellTrigger"("collectionId");