-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" SERIAL NOT NULL,
    "proveedorCod" VARCHAR(7) NOT NULL,
    "proveedorName" VARCHAR(60) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "concepto" VARCHAR(100),
    "usuario" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_payments_proveedorCod_idx" ON "supplier_payments"("proveedorCod");

-- CreateIndex
CREATE INDEX "supplier_payments_createdAt_idx" ON "supplier_payments"("createdAt");
