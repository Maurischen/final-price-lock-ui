-- CreateTable
CREATE TABLE "UpsellRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "triggerMode" TEXT NOT NULL,
    "triggerProductId" TEXT,
    "triggerVariantId" TEXT,
    "triggerSku" TEXT,
    "triggerTag" TEXT,
    "minCartValue" REAL,
    "maxCartValue" REAL,
    "offerMode" TEXT NOT NULL,
    "offerProductId" TEXT,
    "offerVariantId" TEXT,
    "offerSku" TEXT,
    "offerTitleOverride" TEXT,
    "offerMessage" TEXT,
    "discountMode" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" REAL,
    "discountLabel" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "limitOnePerCart" BOOLEAN NOT NULL DEFAULT true,
    "hideIfOfferInCart" BOOLEAN NOT NULL DEFAULT true,
    "hideIfOfferOutOfStock" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UpsellRuleTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UpsellRuleTarget_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "UpsellRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UpsellEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sessionId" TEXT,
    "cartToken" TEXT,
    "productId" TEXT,
    "variantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UpsellEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "UpsellRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UpsellRule_shop_idx" ON "UpsellRule"("shop");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_isActive_idx" ON "UpsellRule"("shop", "isActive");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_placement_idx" ON "UpsellRule"("shop", "placement");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_triggerProductId_idx" ON "UpsellRule"("shop", "triggerProductId");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_triggerVariantId_idx" ON "UpsellRule"("shop", "triggerVariantId");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_triggerSku_idx" ON "UpsellRule"("shop", "triggerSku");

-- CreateIndex
CREATE INDEX "UpsellRule_shop_triggerTag_idx" ON "UpsellRule"("shop", "triggerTag");

-- CreateIndex
CREATE INDEX "UpsellRuleTarget_ruleId_idx" ON "UpsellRuleTarget"("ruleId");

-- CreateIndex
CREATE INDEX "UpsellRuleTarget_targetType_targetValue_idx" ON "UpsellRuleTarget"("targetType", "targetValue");

-- CreateIndex
CREATE INDEX "UpsellEvent_shop_idx" ON "UpsellEvent"("shop");

-- CreateIndex
CREATE INDEX "UpsellEvent_ruleId_idx" ON "UpsellEvent"("ruleId");

-- CreateIndex
CREATE INDEX "UpsellEvent_eventType_idx" ON "UpsellEvent"("eventType");

-- CreateIndex
CREATE INDEX "UpsellEvent_createdAt_idx" ON "UpsellEvent"("createdAt");
