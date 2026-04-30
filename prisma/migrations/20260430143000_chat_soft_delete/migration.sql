-- AlterTable: add a nullable `deletedAt` tombstone for soft-deletes on chats.
-- Repository queries filter `deletedAt IS NULL` so deletes hide rows from the
-- user without losing data. Hard-delete sweep is a future cron concern.
ALTER TABLE "chats"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index supporting cursor pagination of *active* chats: matches the existing
-- (userId, createdAt DESC) index but adds the deletedAt predicate so the
-- planner can use an index-only scan when filtering soft-deleted rows.
CREATE INDEX "chats_userId_deletedAt_createdAt_idx"
  ON "chats" ("userId", "deletedAt", "createdAt" DESC);
