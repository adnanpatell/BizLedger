-- AlterTable: drop Indian columns, add NA columns
ALTER TABLE "Business" DROP COLUMN IF EXISTS "gstin";
ALTER TABLE "Business" DROP COLUMN IF EXISTS "fyStartMonth";
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "taxNumber" TEXT;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "province" TEXT NOT NULL DEFAULT 'AB';
ALTER TABLE "Business" ALTER COLUMN "currency" SET DEFAULT 'CAD';
