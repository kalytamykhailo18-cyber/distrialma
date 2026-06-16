-- Per-deposit stock adjustment audit log
CREATE TABLE "stock_audit_entries" (
    "id" SERIAL NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "productName" VARCHAR(120),
    "deposito" VARCHAR(3) NOT NULL,
    "stkAnterior" DECIMAL(14,3) NOT NULL,
    "stkNuevo" DECIMAL(14,3) NOT NULL,
    "motivo" VARCHAR(200) NOT NULL,
    "usuario" VARCHAR(60) NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_audit_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_audit_entries_sku_idx" ON "stock_audit_entries"("sku");
CREATE INDEX "stock_audit_entries_deposito_idx" ON "stock_audit_entries"("deposito");
CREATE INDEX "stock_audit_entries_createdAt_idx" ON "stock_audit_entries"("createdAt");
