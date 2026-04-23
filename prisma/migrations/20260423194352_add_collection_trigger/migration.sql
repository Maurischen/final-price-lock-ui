-- AlterTable
ALTER TABLE "UpsellRule" ADD COLUMN "triggerCollectionId" TEXT;

-- CreateIndex
CREATE INDEX "UpsellRule_shop_triggerCollectionId_idx" ON "UpsellRule"("shop", "triggerCollectionId");
