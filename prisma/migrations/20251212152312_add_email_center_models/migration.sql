/*
  Warnings:

  - You are about to drop the column `isActive` on the `EmailTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `key` on the `EmailTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `reason` on the `EmailTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `sortOrder` on the `EmailTemplate` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "EmailLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderGid" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmailTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "label" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_EmailTemplate" ("bodyHtml", "createdAt", "id", "label", "subject", "updatedAt") SELECT "bodyHtml", "createdAt", "id", "label", "subject", "updatedAt" FROM "EmailTemplate";
DROP TABLE "EmailTemplate";
ALTER TABLE "new_EmailTemplate" RENAME TO "EmailTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
