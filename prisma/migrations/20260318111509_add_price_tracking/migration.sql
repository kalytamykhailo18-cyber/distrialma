-- CreateTable
CREATE TABLE "price_snapshots" (
    "id" SERIAL NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "precio2" DECIMAL(12,2) NOT NULL,
    "precio4" DECIMAL(12,2) NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_changes" (
    "id" SERIAL NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "field" VARCHAR(20) NOT NULL,
    "oldPrice" DECIMAL(12,2) NOT NULL,
    "newPrice" DECIMAL(12,2) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_snapshots_sku_key" ON "price_snapshots"("sku");

-- CreateIndex
CREATE INDEX "price_changes_detectedAt_idx" ON "price_changes"("detectedAt");

-- CreateIndex
CREATE INDEX "price_changes_sku_idx" ON "price_changes"("sku");
