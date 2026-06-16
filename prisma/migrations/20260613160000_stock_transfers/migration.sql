-- Stock transfers between deposits (traslados entre sucursales)
CREATE TABLE "stock_transfers" (
    "id" SERIAL NOT NULL,
    "depositoOrigen" VARCHAR(3) NOT NULL,
    "depositoDestino" VARCHAR(3) NOT NULL,
    "usuario" VARCHAR(60) NOT NULL,
    "notas" VARCHAR(300),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'realizado',
    "pdfUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPor" VARCHAR(60),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_transfers_createdAt_idx" ON "stock_transfers"("createdAt");
CREATE INDEX "stock_transfers_depositoOrigen_idx" ON "stock_transfers"("depositoOrigen");
CREATE INDEX "stock_transfers_depositoDestino_idx" ON "stock_transfers"("depositoDestino");

CREATE TABLE "stock_transfer_items" (
    "id" SERIAL NOT NULL,
    "transferId" INTEGER NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "productName" VARCHAR(120) NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");
CREATE INDEX "stock_transfer_items_sku_idx" ON "stock_transfer_items"("sku");

ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
