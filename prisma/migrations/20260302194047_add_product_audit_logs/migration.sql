-- CreateTable
CREATE TABLE "ProductAuditRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "drafted" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error" TEXT
);

-- CreateTable
CREATE TABLE "ProductAuditItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prevStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "missingDescription" BOOLEAN NOT NULL,
    "missingImages" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAuditItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductAuditRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProductAuditItem_runId_idx" ON "ProductAuditItem"("runId");

-- CreateIndex
CREATE INDEX "ProductAuditItem_shop_idx" ON "ProductAuditItem"("shop");
