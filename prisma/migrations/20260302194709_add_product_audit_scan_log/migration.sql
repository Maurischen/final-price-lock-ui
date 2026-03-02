-- CreateTable
CREATE TABLE "ProductAuditScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "missingDescription" BOOLEAN NOT NULL,
    "missingImages" BOOLEAN NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ProductAuditScan_runId_idx" ON "ProductAuditScan"("runId");

-- CreateIndex
CREATE INDEX "ProductAuditScan_shop_idx" ON "ProductAuditScan"("shop");
