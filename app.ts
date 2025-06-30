import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

interface CustomSocket extends Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap> {
  userId?: string;
}

import users from "./models/v1/users/users.routes";
import messages from "./models/v1/messages/messages.routes";
import { PrismaClient } from "@prisma/client";

const app = express();
const server = http.createServer(app);


const prisma = new PrismaClient();

export const io = new Server(server, {
  pingTimeout: 60000,
  cors: {
    origin: [
      "http://192.168.30.102:3000",
      "http://192.168.30.102:*",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://v0-fix-previous-code.vercel.app",
      "https://v0-firebase-backend-setup-khaki.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// In-memory tracking using Socket.IO only
export const userSockets: Record<string, string> = {};
export const onlineUsers: Record<
  string,
  {
    id: string;
    fullName: string;
    email: string;
    image?: string;
    connectedAt: Date;
  }
> = {};
export const typingUsers: Record<string, Set<string>> = {};

io.on("connection", (socket: CustomSocket) => {
  console.log("User connected", socket.id);

  // User registration - purely in-memory
  socket.on("register",(userData: {id: string; fullName: string; email: string; image?: string}) => {
      const { id, fullName, email, image } = userData;

      // Store socket mapping
      userSockets[id] = socket.id;

      // Store user info in memory
      onlineUsers[id] = {
        id,
        fullName,
        email,
        image,
        connectedAt: new Date(),
      };

      // Broadcast to all clients that user is online
      socket.broadcast.emit("user_online", {
        userId: id,
        userInfo: onlineUsers[id],
        isOnline: true,
      });

      // Send current online users to the newly connected user
      socket.emit("online_users_list", Object.values(onlineUsers));

      console.log(`User ${fullName} (${id}) is now online`);
    }
  );

  // Handle disconnect
  socket.on("disconnect", () => {
    // Find user by socket ID and remove from online tracking
    for (const [userId, socketId] of Object.entries(userSockets)) {
      if (socketId === socket.id) {
        const userInfo = onlineUsers[userId];

        // Remove from tracking
        delete userSockets[userId];
        delete onlineUsers[userId];

        // Broadcast to all clients that user is offline
        socket.broadcast.emit("user_online", {
          userId,
          userInfo,
          isOnline: false,
        });

        // Remove from typing users
        Object.keys(typingUsers).forEach((conversationId) => {
          typingUsers[conversationId]?.delete(userId);
          if (typingUsers[conversationId]?.size === 0) {
            delete typingUsers[conversationId];
          }
        });

        console.log(`User ${userInfo?.fullName} (${userId}) went offline`);
        break;
      }
    }
  });

  // Get online users
  socket.on("get_online_users", () => {
    socket.emit("online_users_list", Object.values(onlineUsers));
  });

  // Check if specific user is online
  socket.on("check_user_online", (userId: string) => {
    const isOnline = !!onlineUsers[userId];
    socket.emit("user_online_status", {
      userId,
      isOnline,
      userInfo: isOnline ? onlineUsers[userId] : null,
    });
  });

  // Join conversation
  socket.on("join_conversation", (conversationId: string) => {
    socket.join(conversationId);
    console.log(`User joined conversation ${conversationId}`);
  });

  // Leave conversation
  socket.on("leave_conversation", (conversationId: string) => {
    socket.leave(conversationId);
    console.log(`User left conversation ${conversationId}`);
  });

  // Typing indicators
  socket.on(
    "typing_start",
    (data: { conversationId: string; userId: string; userName: string }) => {
      const { conversationId, userId, userName } = data;

      if (!typingUsers[conversationId]) {
        typingUsers[conversationId] = new Set();
      }

      typingUsers[conversationId].add(userId);

      // Notify other users in the conversation
      socket.to(conversationId).emit("user_typing", {
        conversationId,
        userId,
        userName,
        isTyping: true,
      });
    }
  );

  socket.on(
    "typing_stop",
    (data: { conversationId: string; userId: string }) => {
      const { conversationId, userId } = data;

      if (typingUsers[conversationId]) {
        typingUsers[conversationId].delete(userId);

        if (typingUsers[conversationId].size === 0) {
          delete typingUsers[conversationId];
        }
      }

      // Notify other users in the conversation
      socket.to(conversationId).emit("user_typing", {
        conversationId,
        userId,
        isTyping: false,
      });
    }
  );

  // Heartbeat to keep connection alive and verify user is still active
  socket.on("heartbeat", (userId: string) => {
    if (onlineUsers[userId]) {
      onlineUsers[userId].connectedAt = new Date();
    }
  });

  // Call signaling events
  socket.on("initiate_call", async (data: { conversationId: string }) => {
    try {
      // Find userId by socket ID
      const userId = Object.keys(userSockets).find(
        (id) => userSockets[id] === socket.id
      );
      
      if (!userId) {
        throw new Error("User not found for this socket connection");
      }
      
      // Create a call message
      const message = await prisma.message.create({
        data: {
          type: "CALL" as const,
          content: "Started a call",
          senderId: userId,
          conversationId: data.conversationId,
          callStatus: "MISSED"
        },
        include: {
          sender: true,
          conversation: {
            include: {
              users: true
            }
          }
        }
      });

      // Notify other participants
      message.conversation.users.forEach(user => {
        if (user.id !== userId && userSockets[user.id]) {
          io.to(userSockets[user.id]).emit("incoming_call", {
            messageId: message.id,
            conversationId: data.conversationId,
            caller: message.sender
          });
        }
      });

    } catch (error) {
      console.error("Call initiation error:", error);
    }
  });

  socket.on("call_response", async (data: { 
    messageId: string,
    response: "accept" | "decline"
  }) => {
    try {
      const userId = Object.keys(userSockets).find(
        (id) => userSockets[id] === socket.id
      );

      if (!userId) {
        throw new Error("User not found for this socket connection");
      }

      const message = await prisma.message.findUnique({
        where: { id: data.messageId },
        include: { sender: true }
      });

      if (message) {
        // Notify the caller
        if (userSockets[message.senderId]) {
          io.to(userSockets[message.senderId]).emit("call_answered", {
            messageId: data.messageId,
            userId: userId,
            response: data.response
          });
        }
      }
    } catch (error) {
      console.error("Call response error:", error);
    }
  });

  socket.on("end_call", async (data: { messageId: string; duration: number }) => {
    try {
      const message = await prisma.message.update({
        where: { id: data.messageId },
        data: {
          callStatus: "COMPLETED",
          callDuration: data.duration
        },
        include: {
          conversation: {
            include: {
              users: true
            }
          }
        }
      });

      // Notify all participants
      message.conversation.users.forEach(user => {
        if (userSockets[user.id]) {
          io.to(userSockets[user.id]).emit("call_ended", {
            messageId: data.messageId,
            duration: data.duration
          });
        }
      });
    } catch (error) {
      console.error("End call error:", error);
    }
  });

  // WebRTC signaling
  socket.on("webrtc_signal", (data: {
    messageId: string,
    targetUserId: string,
    signal: any
  }) => {
    const userId = Object.keys(userSockets).find(
      (id) => userSockets[id] === socket.id
    );

    if (userSockets[data.targetUserId] && userId) {
      io.to(userSockets[data.targetUserId]).emit("webrtc_signal", {
        messageId: data.messageId,
        userId: userId,
        signal: data.signal
      });
    }
  });
});

// CORS configuration
app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",
      "http://192.168.30.102:*",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://v0-fix-previous-code.vercel.app",
      "https://v0-firebase-backend-setup-khaki.vercel.app"
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Routes
app.use("/v1/users", users);
app.use("/v1/messages", messages);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Error handling
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ message: "404 route not found" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res
    .status(500)
    .json({ message: "500 Something broken!", error: err.message });
});

export default server;
