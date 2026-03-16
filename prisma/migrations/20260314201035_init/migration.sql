-- CreateTable
CREATE TABLE "product_images" (
    "id" SERIAL NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_descriptions" (
    "id" SERIAL NOT NULL,
    "sku" VARCHAR(7) NOT NULL,
    "description" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'customer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_images_sku_idx" ON "product_images"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_descriptions_sku_key" ON "product_descriptions"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
