-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductAuditScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "missingDescription" BOOLEAN NOT NULL,
    "missingImages" BOOLEAN NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAuditScan_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductAuditRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductAuditScan" ("actionTaken", "createdAt", "id", "missingDescription", "missingImages", "productGid", "runId", "shop", "status", "title") SELECT "actionTaken", "createdAt", "id", "missingDescription", "missingImages", "productGid", "runId", "shop", "status", "title" FROM "ProductAuditScan";
DROP TABLE "ProductAuditScan";
ALTER TABLE "new_ProductAuditScan" RENAME TO "ProductAuditScan";
CREATE INDEX "ProductAuditScan_runId_idx" ON "ProductAuditScan"("runId");
CREATE INDEX "ProductAuditScan_shop_idx" ON "ProductAuditScan"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProductAuditRun_shop_idx" ON "ProductAuditRun"("shop");

-- CreateIndex
CREATE INDEX "ProductAuditRun_startedAt_idx" ON "ProductAuditRun"("startedAt");
