-- CreateTable
CREATE TABLE "hidden_categories" (
    "id" SERIAL NOT NULL,
    "categoryId" VARCHAR(4) NOT NULL,

    CONSTRAINT "hidden_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hidden_categories_categoryId_key" ON "hidden_categories"("categoryId");
