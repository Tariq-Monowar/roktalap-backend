-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "adminId" TEXT,
ADD COLUMN     "description" TEXT;

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
