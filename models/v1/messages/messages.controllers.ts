import type { Request, Response } from "express"
import { PrismaClient } from "@prisma/client"
import { io, userSockets, onlineUsers } from "../../../app"

const prisma = new PrismaClient()

export const createConversation = async (req: Request, res: Response) => {
  try {
    const { userIds, name, type = "SINGLE" } = req.body
    const currentUserId = req.user?.userId

    if (!currentUserId) {
      res.status(401).json({ message: "User not authenticated" })
      return
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ message: "userIds is required and must be a non-empty array" })
      return
    }

    const validUserIds = userIds.filter((id) => id && typeof id === "string")

    if (validUserIds.length === 0) {
      res.status(400).json({ message: "No valid user IDs provided" })
      return
    }

    console.log("Creating conversation:", {
      currentUserId,
      validUserIds,
      type,
      name,
    })

    // For single chat, check if conversation already exists
    if (type === "SINGLE" && validUserIds.length === 1) {
      const participantIds = [currentUserId, ...validUserIds]

      const existingConversation = await prisma.conversation.findFirst({
        where: {
          type: "SINGLE",
          users: {
            every: {
              id: {
                in: participantIds,
              },
            },
          },
          AND: [
            {
              users: {
                some: {
                  id: currentUserId,
                },
              },
            },
            {
              users: {
                some: {
                  id: validUserIds[0],
                },
              },
            },
          ],
        },
        include: {
          users: {
            select: {
              id: true,
              fullName: true,
              email: true,
              image: true,
            },
          },
          admin: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          messages: {
            take: 1,
            orderBy: {
              createdAt: "desc",
            },
            include: {
              sender: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
              messageReads: {
                include: {
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                    },
                  },
                },
              },
            },
          },
        },
      })

      if (existingConversation) {
        console.log("Found existing conversation:", existingConversation.id)

        const conversationWithOnlineStatus = {
          ...existingConversation,
          users: existingConversation.users.map((user) => ({
            ...user,
            isOnline: !!onlineUsers[user.id],
          })),
        }

        res.status(200).json(conversationWithOnlineStatus)
        return
      }
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        type: type as "SINGLE" | "GROUP",
        name: type === "GROUP" ? name : null,
        adminId: type === "GROUP" ? currentUserId : null,
        users: {
          connect: [{ id: currentUserId }, ...validUserIds.map((id: string) => ({ id }))],
        },
      },
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            email: true,
            image: true,
          },
        },
        admin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
          include: {
            sender: {
              select: {
                id: true,
                fullName: true,
              },
            },
            messageReads: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    console.log("Created new conversation:", conversation.id)

    const conversationWithOnlineStatus = {
      ...conversation,
      users: conversation.users.map((user) => ({
        ...user,
        isOnline: !!onlineUsers[user.id],
      })),
    }

    res.status(201).json(conversationWithOnlineStatus)
  } catch (error) {
    console.error("Create conversation error:", error)
    res.status(500).json({
      message: "Failed to create conversation",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}

export const getConversations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ message: "User not authenticated" })
      return
    }

    console.log("Getting conversations for user:", userId)

    const conversations = await prisma.conversation.findMany({
      where: {
        users: {
          some: {
            id: userId,
          },
        },
      },
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            email: true,
            image: true,
          },
        },
        admin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: "desc",
          },
          include: {
            sender: {
              select: {
                id: true,
                fullName: true,
              },
            },
            messageReads: {
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    console.log(`Found ${conversations.length} conversations for user ${userId}`)

    // Add online status and unread count
    const conversationsWithStatus = await Promise.all(
      conversations.map(async (conversation) => {
        // Count unread messages for this user
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: {
              not: userId,
            },
            messageReads: {
              none: {
                userId: userId,
              },
            },
          },
        })

        return {
          ...conversation,
          unreadCount,
          users: conversation.users.map((user) => ({
            ...user,
            isOnline: !!onlineUsers[user.id],
          })),
        }
      })
    )

    res.status(200).json(conversationsWithStatus)
  } catch (error) {
    console.error("Get conversations error:", error)
    res.status(500).json({
      message: "Failed to get conversations",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const { content } = req.body
    const senderId = req.user?.userId

    if (!senderId) {
      res.status(401).json({ message: "User not authenticated" })
      return
    }

    if (!content || !content.trim()) {
      res.status(400).json({ message: "Message content is required" })
      return
    }

    console.log("Sending message:", { conversationId, senderId, content: content.substring(0, 50) + "..." })

    // Verify user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        users: {
          some: {
            id: senderId,
          },
        },
      },
      include: {
        users: true,
      },
    })

    if (!conversation) {
      res.status(403).json({ message: "Not authorized to send message to this conversation" })
      return
    }

    // Create message in database
    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        senderId,
        conversationId,
      },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
            image: true,
          },
        },
        conversation: {
          include: {
            users: true,
          },
        },
        messageReads: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    })

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    })

    console.log("Message created:", message.id)

    // Emit message to conversation room
    io.to(conversationId).emit("new_message", message)

    // Send notifications to online users only
    message.conversation.users.forEach((user) => {
      if (user.id !== senderId && userSockets[user.id]) {
        io.to(userSockets[user.id]).emit("message_notification", {
          conversationId,
          message: message.content,
          sender: message.sender,
        })
      }
    })

    res.status(201).json(message)
  } catch (error) {
    console.error("Send message error:", error)
    res.status(500).json({
      message: "Failed to send message",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const userId = req.user?.userId
    const page = Number.parseInt(req.query.page as string) || 1
    const limit = Number.parseInt(req.query.limit as string) || 50
    const skip = (page - 1) * limit

    if (!userId) {
      res.status(401).json({ message: "User not authenticated" })
      return
    }

    console.log("Getting messages:", { conversationId, userId, page, limit })

    // Verify user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        users: {
          some: {
            id: userId,
          },
        },
      },
    })

    if (!conversation) {
      res.status(403).json({ message: "Not authorized to view this conversation" })
      return
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
            image: true,
          },
        },
        messageReads: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    })

    // Reverse to get chronological order
    const reversedMessages = messages.reverse()

    console.log(`Found ${reversedMessages.length} messages for conversation ${conversationId}`)

    res.status(200).json(reversedMessages)
  } catch (error) {
    console.error("Get messages error:", error)
    res.status(500).json({
      message: "Failed to get messages",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}

// New function to mark a specific message as read
export const markMessageAsRead = async (req: Request, res: Response) => {
  try {
    const { conversationId, messageId } = req.params
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ message: "User not authenticated" })
      return
    }

    // Verify user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        users: {
          some: {
            id: userId,
          },
        },
      },
    })

    if (!conversation) {
      res.status(403).json({ message: "Not authorized to access this conversation" })
      return
    }

    // Verify message exists in this conversation
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId: conversationId,
      },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    })

    if (!message) {
      res.status(404).json({ message: "Message not found" })
      return
    }

    // Don't mark own messages as read
    if (message.senderId === userId) {
      res.status(400).json({ message: "Cannot mark own message as read" })
      return
    }

    // Create or update read receipt
    const messageRead = await prisma.messageRead.upsert({
      where: {
        messageId_userId: {
          messageId: messageId,
          userId: userId,
        },
      },
      update: {
        readAt: new Date(),
      },
      create: {
        messageId: messageId,
        userId: userId,
        readAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    })

    console.log(`Message ${messageId} marked as read by user ${userId}`)

    // Emit read receipt to conversation room
    io.to(conversationId).emit("message_read", {
      messageId: messageId,
      readBy: messageRead.user,
      readAt: messageRead.readAt,
    })

    // Notify the sender specifically
    if (userSockets[message.senderId]) {
      io.to(userSockets[message.senderId]).emit("message_read_receipt", {
        messageId: messageId,
        conversationId: conversationId,
        readBy: messageRead.user,
        readAt: messageRead.readAt,
      })
    }

    res.status(200).json({
      success: true,
      message: "Message marked as read",
      messageRead: messageRead,
    })
  } catch (error) {
    console.error("Mark message as read error:", error)
    res.status(500).json({
      message: "Failed to mark message as read",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}

// New function to mark all messages in a conversation as read
export const markConversationAsRead = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ message: "User not authenticated" })
      return
    }

    // Verify user is part of the conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        users: {
          some: {
            id: userId,
          },
        },
      },
    })

    if (!conversation) {
      res.status(403).json({ message: "Not authorized to access this conversation" })
      return
    }

    // Get all unread messages in this conversation (not sent by current user)
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId: conversationId,
        senderId: {
          not: userId,
        },
        messageReads: {
          none: {
            userId: userId,
          },
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    })

    if (unreadMessages.length === 0) {
      res.status(200).json({
        success: true,
        message: "No unread messages to mark",
        markedCount: 0,
      })
      return
    }

    // Create read receipts for all unread messages
    const readReceipts = await Promise.all(
      unreadMessages.map((message) =>
        prisma.messageRead.create({
          data: {
            messageId: message.id,
            userId: userId,
            readAt: new Date(),
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        })
      )
    )

    console.log(`Marked ${readReceipts.length} messages as read in conversation ${conversationId} by user ${userId}`)

    // Emit read receipts to conversation room
    readReceipts.forEach((receipt, index) => {
      const message = unreadMessages[index]
      
      io.to(conversationId).emit("message_read", {
        messageId: message.id,
        readBy: receipt.user,
        readAt: receipt.readAt,
      })

      // Notify the sender specifically
      if (userSockets[message.senderId]) {
        io.to(userSockets[message.senderId]).emit("message_read_receipt", {
          messageId: message.id,
          conversationId: conversationId,
          readBy: receipt.user,
          readAt: receipt.readAt,
        })
      }
    })

    res.status(200).json({
      success: true,
      message: "All messages marked as read",
      markedCount: readReceipts.length,
    })
  } catch (error) {
    console.error("Mark conversation as read error:", error)
    res.status(500).json({
      message: "Failed to mark conversation as read",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}

// Keep all your existing functions (addUserToGroup, removeUserFromGroup, etc.)
export const addUserToGroup = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const { userId } = req.body
    const currentUserId = req.user?.userId

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: "GROUP",
        adminId: currentUserId,
      },
    })

    if (!conversation) {
      res.status(403).json({ message: "Only group admin can add users" })
      return
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        users: {
          connect: { id: userId },
        },
      },
      include: {
        users: {
          select: {
            id: true,
            fullName: true,
            email: true,
            image: true,
          },
        },
      },
    })

    io.to(conversationId).emit("user_added_to_group", {
      conversationId,
      addedUser: updatedConversation.users.find((u) => u.id === userId),
      addedBy: req.user,
    })

    res.status(200).json({ message: "User added to group successfully" })
  } catch (error) {
    console.error("Add user to group error:", error)
    res.status(500).json({ message: "Failed to add user to group", error })
  }
}

export const removeUserFromGroup = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const { userId } = req.body
    const currentUserId = req.user?.userId

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: "GROUP",
        adminId: currentUserId,
      },
    })

    if (!conversation) {
      res.status(403).json({ message: "Only group admin can remove users" })
      return
    }

    if (userId === currentUserId) {
      res.status(400).json({ message: "Admin cannot remove themselves" })
      return
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        users: {
          disconnect: { id: userId },
        },
      },
    })

    io.to(conversationId).emit("user_removed_from_group", {
      conversationId,
      removedUserId: userId,
      removedBy: req.user,
    })

    res.status(200).json({ message: "User removed from group successfully" })
  } catch (error) {
    console.error("Remove user from group error:", error)
    res.status(500).json({ message: "Failed to remove user from group", error })
  }
}

export const updateGroupInfo = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const { name, description, image } = req.body
    const currentUserId = req.user?.userId

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: "GROUP",
        adminId: currentUserId,
      },
    })

    if (!conversation) {
      res.status(403).json({ message: "Only group admin can update group info" })
      return
    }

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        name,
        description,
        image,
      },
    })

    io.to(conversationId).emit("group_info_updated", {
      conversationId,
      updatedInfo: { name, description, image },
      updatedBy: req.user,
    })

    res.status(200).json(updatedConversation)
  } catch (error) {
    console.error("Update group info error:", error)
    res.status(500).json({ message: "Failed to update group info", error })
  }
}

export const leaveGroup = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const currentUserId = req.user?.userId

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: "GROUP",
        users: {
          some: {
            id: currentUserId,
          },
        },
      },
    })

    if (!conversation) {
      res.status(404).json({ message: "Group not found" })
      return
    }

    if (conversation.adminId === currentUserId) {
      const otherUsers = await prisma.conversation.findFirst({
        where: { id: conversationId },
        include: {
          users: {
            where: {
              id: {
                not: currentUserId,
              },
            },
          },
        },
      })

      if (otherUsers && otherUsers.users.length > 0) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            adminId: otherUsers.users[0].id,
            users: {
              disconnect: { id: currentUserId },
            },
          },
        })

        io.to(conversationId).emit("admin_transferred", {
          conversationId,
          newAdminId: otherUsers.users[0].id,
          leftUserId: currentUserId,
        })
      } else {
        await prisma.conversation.delete({
          where: { id: conversationId },
        })
      }
    } else {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          users: {
            disconnect: { id: currentUserId },
          },
        },
      })

      io.to(conversationId).emit("user_left_group", {
        conversationId,
        leftUserId: currentUserId,
      })
    }

    res.status(200).json({ message: "Left group successfully" })
  } catch (error) {
    console.error("Leave group error:", error)
    res.status(500).json({ message: "Failed to leave group", error })
  }
}

export const searchDonors = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const searchText = (search as string)?.trim();

    if (!searchText) {
      const donors = await prisma.user.findMany({
        where: { role: "DONOR" },
        include: { location: true },
        take: 50
      });
       res.status(200).json(donors);
       return
    }

    const donors = await prisma.user.findMany({
      where: {
        role: "DONOR",
        OR: [
          { fullName: { contains: searchText, mode: "insensitive" } },
          { bloodGroup: { contains: searchText, mode: "insensitive" } },
          { location: { address: { contains: searchText, mode: "insensitive" } } }
        ]
      },
      include: {
        location: true,
      },
      take: 100
    });

    res.status(200).json(donors);
  } catch (error) {
    console.error("Donor search failed:", error);
    res.status(500).json({ message: "Donor search failed", error });
  }
}

export const searchRecepent = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const searchText = (search as string)?.trim();

    if (!searchText) {
      const donors = await prisma.user.findMany({
        where: { role: "RECIPIENT" },
        include: { location: true },
        take: 50
      });
       res.status(200).json(donors);
       return
    }

    const donors = await prisma.user.findMany({
      where: {
        role: "RECIPIENT",
        OR: [
          { fullName: { contains: searchText, mode: "insensitive" } },
          { bloodGroup: { contains: searchText, mode: "insensitive" } },
          { location: { address: { contains: searchText, mode: "insensitive" } } }
        ]
      },
      include: {
        location: true,
      },
      take: 100
    });

    res.status(200).json(donors);
  } catch (error) {
    console.error("Donor search failed:", error);
    res.status(500).json({ message: "Donor search failed", error });
  }
}