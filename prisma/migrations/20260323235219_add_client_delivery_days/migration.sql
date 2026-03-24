-- CreateTable
CREATE TABLE "client_delivery_days" (
    "id" SERIAL NOT NULL,
    "clientId" VARCHAR(7) NOT NULL,
    "day" VARCHAR(20) NOT NULL,

    CONSTRAINT "client_delivery_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_delivery_days_clientId_idx" ON "client_delivery_days"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_delivery_days_clientId_day_key" ON "client_delivery_days"("clientId", "day");
