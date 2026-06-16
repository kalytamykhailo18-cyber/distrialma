-- Rename + retype: efectivoImagen (VARCHAR 500, single URL) -> efectivoImagenes (TEXT, JSON array)
ALTER TABLE "supplier_payments" RENAME COLUMN "efectivoImagen" TO "efectivoImagenes";
ALTER TABLE "supplier_payments" ALTER COLUMN "efectivoImagenes" TYPE TEXT;

-- Convert existing single-URL values to JSON arrays so the new code reads them uniformly
UPDATE "supplier_payments"
SET "efectivoImagenes" = ('["' || REPLACE("efectivoImagenes", '"', '\"') || '"]')
WHERE "efectivoImagenes" IS NOT NULL
  AND "efectivoImagenes" != ''
  AND "efectivoImagenes" NOT LIKE '[%';
