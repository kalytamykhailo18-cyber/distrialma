-- AlterTable: admin-only adjustment field for tax/rounding mismatches on recibos
ALTER TABLE "supplier_payments"
  ADD COLUMN     "montoAjuste"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "ajusteMotivo" VARCHAR(200);
