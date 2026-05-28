CREATE TABLE "BundlerRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerSkusJson" TEXT NOT NULL,
    "offerSkusJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "BundlerRule_shop_idx" ON "BundlerRule"("shop");
CREATE INDEX "BundlerRule_shop_isActive_idx" ON "BundlerRule"("shop", "isActive");