import type { Request, Response } from "express"
import { PrismaClient } from "@prisma/client"
import { io, userSockets, onlineUsers } from "../../../app"

const prisma = new PrismaClient()

export const createConversation = async (req: Request, res: Response) => {
  try {
    const { userIds, name, type = "SINGLE" } = req.body
    const currentUserId = req.user?.userId // ✅ FIXED: Changed from req.user?.id to req.user?.userId

    // Validate current user ID
    if (!currentUserId) {
      res.status(401).json({ message: "User not authenticated" })
      return
    }

    // Validate userIds
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ message: "userIds is required and must be a non-empty array" })
      return
    }

    // Filter out any undefined/null values from userIds
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
          // Ensure exactly 2 users in the conversation
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
            },
          },
        },
      })

      if (existingConversation) {
        console.log("Found existing conversation:", existingConversation.id)

        // Add online status from Socket.IO tracking
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
          },
        },
      },
    })

    console.log("Created new conversation:", conversation.id)

    // Add online status from Socket.IO tracking
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
    const userId = req.user?.userId // ✅ FIXED: Changed from req.user?.id to req.user?.userId

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
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    })

    console.log(`Found ${conversations.length} conversations for user ${userId}`)

    // Add online status from Socket.IO tracking
    const conversationsWithOnlineStatus = conversations.map((conversation) => ({
      ...conversation,
      users: conversation.users.map((user) => ({
        ...user,
        isOnline: !!onlineUsers[user.id],
      })),
    }))

    res.status(200).json(conversationsWithOnlineStatus)
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
    const senderId = req.user?.userId // ✅ FIXED: Changed from req.user?.id to req.user?.userId

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
    const userId = req.user?.userId // ✅ FIXED: Changed from req.user?.id to req.user?.userId
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

export const addUserToGroup = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params
    const { userId } = req.body
    const currentUserId = req.user?.userId // ✅ FIXED: Changed from req.user.id to req.user?.userId

    // Check if current user is admin of the group
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

    // Add user to group
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

    // Notify all users in the group
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
    const currentUserId = req.user?.userId // ✅ FIXED: Changed from req.user.id to req.user?.userId

    // Check if current user is admin of the group
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

    // Cannot remove admin
    if (userId === currentUserId) {
      res.status(400).json({ message: "Admin cannot remove themselves" })
      return
    }

    // Remove user from group
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        users: {
          disconnect: { id: userId },
        },
      },
    })

    // Notify all users in the group
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
    const currentUserId = req.user?.userId // ✅ FIXED: Changed from req.user.id to req.user?.userId

    // Check if current user is admin of the group
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

    // Notify all users in the group
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
    const currentUserId = req.user?.userId // ✅ FIXED: Changed from req.user.id to req.user?.userId

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

    // If admin is leaving, transfer admin rights or delete group
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
        // Transfer admin to first available user
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
        // Delete group if no other users
        await prisma.conversation.delete({
          where: { id: conversationId },
        })
      }
    } else {
      // Regular user leaving
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
        take: 50 // Limit results when no search term
      });
       res.status(200).json(donors);
       return
    }

    // Use full-text search if available, otherwise optimized query
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
      take: 100 // Limit results
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
        take: 50 // Limit results when no search term
      });
       res.status(200).json(donors);
       return
    }

    // Use full-text search if available, otherwise optimized query
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
      take: 100 // Limit results
    });

    res.status(200).json(donors);
  } catch (error) {
    console.error("Donor search failed:", error);
    res.status(500).json({ message: "Donor search failed", error });
  }
}