/*
  Warnings:

  - A unique constraint covering the columns `[runId,productGid]` on the table `ProductAuditItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[runId,productGid]` on the table `ProductAuditScan` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ProductAuditItem_runId_productGid_key" ON "ProductAuditItem"("runId", "productGid");

-- CreateIndex
CREATE INDEX "ProductAuditRun_shop_startedAt_idx" ON "ProductAuditRun"("shop", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAuditScan_runId_productGid_key" ON "ProductAuditScan"("runId", "productGid");
