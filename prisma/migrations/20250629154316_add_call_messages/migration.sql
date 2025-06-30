-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'CALL');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('MISSED', 'DECLINED', 'COMPLETED');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "callDuration" INTEGER,
ADD COLUMN     "callStatus" "CallStatus",
ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'TEXT';
