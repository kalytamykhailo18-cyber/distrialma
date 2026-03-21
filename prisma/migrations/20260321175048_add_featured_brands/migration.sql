-- CreateTable
CREATE TABLE "featured_brands" (
    "id" SERIAL NOT NULL,
    "brandId" VARCHAR(4) NOT NULL,

    CONSTRAINT "featured_brands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "featured_brands_brandId_key" ON "featured_brands"("brandId");
