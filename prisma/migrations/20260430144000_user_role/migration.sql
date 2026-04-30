-- CreateEnum + AlterTable: per-user role for the RBAC scaffold.
-- Default `user`; flip specific rows to `admin` via SQL when needed.
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

ALTER TABLE "users"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'user';
