-- Rename + retype: Cheque.fotoUrl (VARCHAR 500, single URL) -> fotoUrls (TEXT, JSON array)
ALTER TABLE "cheques" RENAME COLUMN "fotoUrl" TO "fotoUrls";
ALTER TABLE "cheques" ALTER COLUMN "fotoUrls" TYPE TEXT;

-- Convert existing single-URL values to JSON arrays so the new code reads them uniformly
UPDATE "cheques"
SET "fotoUrls" = ('["' || REPLACE("fotoUrls", '"', '\"') || '"]')
WHERE "fotoUrls" IS NOT NULL
  AND "fotoUrls" != ''
  AND "fotoUrls" NOT LIKE '[%';
