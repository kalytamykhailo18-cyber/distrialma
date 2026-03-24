-- AlterTable
ALTER TABLE "users" ADD COLUMN     "permissions" TEXT NOT NULL DEFAULT '[]',
ALTER COLUMN "role" SET DEFAULT 'staff';
