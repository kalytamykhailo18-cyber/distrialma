-- AlterTable: SupplierPayment new fields for recibos de pago
ALTER TABLE "supplier_payments"
  ADD COLUMN     "efectivoImagen" VARCHAR(500),
  ADD COLUMN     "tipoPago" VARCHAR(20) DEFAULT 'legacy',
  ADD COLUMN     "montoCheques" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "montoEfectivo" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "montoTransferencia" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN     "transferenciaRef" VARCHAR(100),
  ADD COLUMN     "pdfUrl" VARCHAR(500),
  ADD COLUMN     "driveUrl" VARCHAR(500),
  ADD COLUMN     "anuladoAt" TIMESTAMP(3),
  ADD COLUMN     "anuladoBy" VARCHAR(60);

-- AlterTable: Cheque link to SupplierPayment + photo URL
ALTER TABLE "cheques"
  ADD COLUMN     "supplierPaymentId" INTEGER,
  ADD COLUMN     "fotoUrl" VARCHAR(500);

-- CreateIndex
CREATE INDEX "cheques_supplierPaymentId_idx" ON "cheques"("supplierPaymentId");

-- AddForeignKey
ALTER TABLE "cheques"
  ADD CONSTRAINT "cheques_supplierPaymentId_fkey"
  FOREIGN KEY ("supplierPaymentId") REFERENCES "supplier_payments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
