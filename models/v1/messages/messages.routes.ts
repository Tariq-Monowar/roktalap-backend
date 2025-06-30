import express from "express"
import { verifyUser } from "../../../middleware/verifyUsers"
import {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  addUserToGroup,
  removeUserFromGroup,
  updateGroupInfo,
  leaveGroup,
  searchDonors,
  searchRecepent,
  markMessageAsRead
} from "./messages.controllers"

const router = express.Router()

// search user

router.get("/search-donors",  searchDonors)
router.get("/search-recipient",  searchRecepent)




// Create new conversation
router.post("/conversations", verifyUser("ANY"), createConversation)

// Get user's conversations
router.get("/conversations", verifyUser("ANY"), getConversations)

// Send message
router.post("/:conversationId", verifyUser("ANY"), sendMessage)

// Get messages in conversation
router.get("/:conversationId", verifyUser("ANY"), getMessages)

// Mark message as read
router.post("/:conversationId/messages/:messageId/read", verifyUser("ANY"), markMessageAsRead)

// Group management routes
router.post("/:conversationId/add-user", verifyUser("ANY"), addUserToGroup)
router.post("/:conversationId/remove-user", verifyUser("ANY"), removeUserFromGroup)
router.put("/:conversationId/update", verifyUser("ANY"), updateGroupInfo)
router.post("/:conversationId/leave", verifyUser("ANY"), leaveGroup)

export default router
