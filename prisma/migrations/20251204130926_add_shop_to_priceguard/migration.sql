-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PriceGuard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL DEFAULT 'matrix-warehouse-sa.myshopify.com',
    "sku" TEXT NOT NULL,
    "minPrice" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PriceGuard" ("createdAt", "id", "minPrice", "sku", "updatedAt") SELECT "createdAt", "id", "minPrice", "sku", "updatedAt" FROM "PriceGuard";
DROP TABLE "PriceGuard";
ALTER TABLE "new_PriceGuard" RENAME TO "PriceGuard";
CREATE UNIQUE INDEX "PriceGuard_shop_sku_key" ON "PriceGuard"("shop", "sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
