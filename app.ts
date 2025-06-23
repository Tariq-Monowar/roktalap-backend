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

import users from "./models/v1/users/users.routes";
import messages from "./models/v1/messages/messages.routes";

const app = express();
const server = http.createServer(app);

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

io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  // User registration - purely in-memory
  socket.on(
    "register",
    (userData: {
      id: string;
      fullName: string;
      email: string;
      image?: string;
    }) => {
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
