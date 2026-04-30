-- AlterTable: add per-assistant-message AI usage telemetry columns.
-- All four are nullable so existing user messages and pre-migration assistant
-- rows stay valid without a backfill.
ALTER TABLE "messages"
  ADD COLUMN "promptTokens"     INTEGER,
  ADD COLUMN "completionTokens" INTEGER,
  ADD COLUMN "provider"         TEXT,
  ADD COLUMN "model"            TEXT;
