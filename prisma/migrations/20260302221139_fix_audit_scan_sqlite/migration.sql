-- DropIndex
DROP INDEX "ProductAuditRun_shop_startedAt_idx";

-- CreateIndex
CREATE INDEX "EmailLog_templateId_idx" ON "EmailLog"("templateId");

-- CreateIndex
CREATE INDEX "EmailLog_sentAt_idx" ON "EmailLog"("sentAt");

-- CreateIndex
CREATE INDEX "PriceGuard_shop_idx" ON "PriceGuard"("shop");

-- CreateIndex
CREATE INDEX "PriceGuard_sku_idx" ON "PriceGuard"("sku");

-- CreateIndex
CREATE INDEX "ProductAuditItem_productGid_idx" ON "ProductAuditItem"("productGid");

-- CreateIndex
CREATE INDEX "ProductAuditScan_productGid_idx" ON "ProductAuditScan"("productGid");

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");
