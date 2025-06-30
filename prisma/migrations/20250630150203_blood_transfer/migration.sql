/*
  Warnings:

  - You are about to drop the `Donation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Donation" DROP CONSTRAINT "Donation_userId_fkey";

-- DropTable
DROP TABLE "Donation";

-- CreateTable
CREATE TABLE "BloodTransfer" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "donationTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloodTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BloodTransfer_donorId_idx" ON "BloodTransfer"("donorId");

-- CreateIndex
CREATE INDEX "BloodTransfer_recipientId_idx" ON "BloodTransfer"("recipientId");

-- AddForeignKey
ALTER TABLE "BloodTransfer" ADD CONSTRAINT "BloodTransfer_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodTransfer" ADD CONSTRAINT "BloodTransfer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
