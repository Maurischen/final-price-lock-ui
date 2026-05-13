-- CreateTable
CREATE TABLE "StandalonePromoDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "label" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "productId" TEXT,
    "variantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "StandalonePromoDiscount_shop_idx" ON "StandalonePromoDiscount"("shop");

-- CreateIndex
CREATE INDEX "StandalonePromoDiscount_sku_idx" ON "StandalonePromoDiscount"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "StandalonePromoDiscount_shop_sku_key" ON "StandalonePromoDiscount"("shop", "sku");
