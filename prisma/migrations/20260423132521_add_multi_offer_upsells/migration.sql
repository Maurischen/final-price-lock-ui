/*
  Warnings:

  - You are about to drop the `UpsellEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UpsellRuleTarget` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UpsellEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "UpsellRuleTarget";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "UpsellOfferProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "offerMode" TEXT NOT NULL,
    "offerProductId" TEXT,
    "offerVariantId" TEXT,
    "offerSku" TEXT,
    "offerTitleOverride" TEXT,
    "offerMessage" TEXT,
    "discountMode" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" REAL,
    "discountLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UpsellOfferProduct_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "UpsellRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UpsellOfferProduct_ruleId_idx" ON "UpsellOfferProduct"("ruleId");

-- CreateIndex
CREATE INDEX "UpsellOfferProduct_ruleId_position_idx" ON "UpsellOfferProduct"("ruleId", "position");
