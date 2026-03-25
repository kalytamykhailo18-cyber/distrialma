-- CreateTable
CREATE TABLE "stock_entries" (
    "id" SERIAL NOT NULL,
    "proveedorCod" VARCHAR(7) NOT NULL,
    "proveedorName" VARCHAR(60) NOT NULL,
    "usuario" VARCHAR(50) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_entry_items" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "productName" VARCHAR(60) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "costo" DECIMAL(12,2),
    "costeado" BOOLEAN NOT NULL DEFAULT false,
    "isNewProduct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stock_entry_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_margins" (
    "id" SERIAL NOT NULL,
    "lista" INTEGER NOT NULL,
    "margen" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "price_margins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_entries_estado_idx" ON "stock_entries"("estado");

-- CreateIndex
CREATE INDEX "stock_entries_createdAt_idx" ON "stock_entries"("createdAt");

-- CreateIndex
CREATE INDEX "stock_entry_items_entryId_idx" ON "stock_entry_items"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "price_margins_lista_key" ON "price_margins"("lista");

-- AddForeignKey
ALTER TABLE "stock_entry_items" ADD CONSTRAINT "stock_entry_items_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "stock_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
