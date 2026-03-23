-- CreateTable
CREATE TABLE "archived_orders" (
    "id" SERIAL NOT NULL,
    "boleta" VARCHAR(9) NOT NULL,
    "nroped" VARCHAR(8) NOT NULL,
    "fechora" VARCHAR(14) NOT NULL,
    "clienteCod" VARCHAR(7) NOT NULL,
    "clienteName" VARCHAR(60) NOT NULL,
    "totalCant" DECIMAL(12,3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archived_order_items" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "productName" VARCHAR(60) NOT NULL,
    "cant" DECIMAL(12,3) NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "impo" DECIMAL(12,2) NOT NULL,
    "listaPrecio" INTEGER NOT NULL,

    CONSTRAINT "archived_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archived_orders_clienteCod_idx" ON "archived_orders"("clienteCod");

-- CreateIndex
CREATE INDEX "archived_orders_fechora_idx" ON "archived_orders"("fechora");

-- CreateIndex
CREATE INDEX "archived_order_items_orderId_idx" ON "archived_order_items"("orderId");

-- AddForeignKey
ALTER TABLE "archived_order_items" ADD CONSTRAINT "archived_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "archived_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
