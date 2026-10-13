-- AlterTable
ALTER TABLE "sources" ADD COLUMN     "etag" TEXT,
ADD COLUMN     "include" TEXT,
ADD COLUMN     "lastModified" TEXT;
