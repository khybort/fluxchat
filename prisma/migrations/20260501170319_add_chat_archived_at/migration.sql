-- AlterTable
ALTER TABLE "chats" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "chats_userId_archivedAt_createdAt_idx" ON "chats"("userId", "archivedAt", "createdAt" DESC);
