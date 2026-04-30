-- CreateTable: admin-edited feature-flag overrides. One row per flag, the
-- `definition` JSON column carries the rich-form `{ default, rules?, percentage? }`
-- shape. DB rows are layered on top of the FEATURE_FLAGS_FILE merge at reload
-- time, so a UI edit always wins over a static deploy artifact.
CREATE TABLE "feature_flag_overrides" (
    "name"       TEXT         NOT NULL,
    "definition" JSONB        NOT NULL,
    "updatedBy"  TEXT         NOT NULL,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("name")
);
