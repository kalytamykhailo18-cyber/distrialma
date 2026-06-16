-- Explicit proveedor↔marca associations (overrides the implicit Productos×Stock cross-query in recibo PDF)
CREATE TABLE "proveedor_marcas" (
    "id" SERIAL NOT NULL,
    "proveedorCod" VARCHAR(7) NOT NULL,
    "marcaCod" VARCHAR(7) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedor_marcas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proveedor_marcas_proveedorCod_marcaCod_key"
  ON "proveedor_marcas"("proveedorCod", "marcaCod");

CREATE INDEX "proveedor_marcas_proveedorCod_idx"
  ON "proveedor_marcas"("proveedorCod");
