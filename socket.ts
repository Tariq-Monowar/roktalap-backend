// socket.ts
import { Server } from "socket.io";
import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { PrismaClient } from "@prisma/client";
import http from "http";
import { performanceMonitor } from "./utils/performanceMonitor";
import { socketCache } from "./utils/socketCache";

const prisma = new PrismaClient();

interface CustomSocket extends Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap> {
  userId?: string;
  heartbeatTimer?: NodeJS.Timeout;
}

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

export let io: Server | null = null;

export const initializeSocket = (server: http.Server) => {
  io = new Server(server, {
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
        "https://v0-firebase-backend-setup-khaki.vercel.app",
        "https://v0-firebase-api-documentation.vercel.app"
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket: CustomSocket) => {
    console.log("User connected", socket.id);
    performanceMonitor.trackConnection(true);

    socket.on("register",(userData: {id: string; fullName: string; email: string; image?: string}) => {
        const { id, fullName, email, image } = userData;


        socket.userId = id;
        userSockets[id] = socket.id;

        onlineUsers[id] = {
          id,
          fullName,
          email,
          image,
          connectedAt: new Date(),
        };

        // Start heartbeat timer
        socket.heartbeatTimer = setInterval(() => {
          if (onlineUsers[id]) {
            socket.emit("heartbeat_ping");
          }
        }, 30000); // Ping every 30 seconds

        socket.broadcast.emit("user_online", {
          userId: id,
          userInfo: onlineUsers[id],
          isOnline: true,
        });

        socket.emit("online_users_list", Object.values(onlineUsers));

        console.log(`User ${fullName} (${id}) is now online`);
      }
    );

    socket.on("disconnect", () => {
      const userId = socket.userId;
      
      if (userId) {
        const userInfo = onlineUsers[userId];

        // Clear heartbeat timer
        if (socket.heartbeatTimer) {
          clearInterval(socket.heartbeatTimer);
        }

        delete userSockets[userId];
        delete onlineUsers[userId];

        socket.broadcast.emit("user_online", {
          userId,
          userInfo,
          isOnline: false,
        });

        // Clean up typing indicators more efficiently
        Object.keys(typingUsers).forEach((conversationId) => {
          if (typingUsers[conversationId]?.has(userId)) {
            typingUsers[conversationId].delete(userId);
            
            // Emit typing stop to conversation
            socket.to(conversationId).emit("user_typing", {
              conversationId,
              userId,
              isTyping: false,
            });

            if (typingUsers[conversationId].size === 0) {
              delete typingUsers[conversationId];
            }
          }
        });

        console.log(`User ${userInfo?.fullName} (${userId}) went offline`);
        performanceMonitor.trackConnection(false);
        socketCache.removeUser(userId);
      }
    });

    socket.on("get_online_users", () => {
      socket.emit("online_users_list", Object.values(onlineUsers));
    });

    socket.on("check_user_online", (userId: string) => {
      const isOnline = !!onlineUsers[userId];
      socket.emit("user_online_status", {
        userId,
        isOnline,
        userInfo: isOnline ? onlineUsers[userId] : null,
      });
    });


    socket.on("join_conversation", (conversationId: string) => {
      socket.join(conversationId);
      console.log(`User joined conversation ${conversationId}`);
    });

    // Leave conversation
    socket.on("leave_conversation", (conversationId: string) => {
      socket.leave(conversationId);
      console.log(`User left conversation ${conversationId}`);
    });

    // Improved typing indicators with auto-timeout
    const typingTimeouts: Record<string, NodeJS.Timeout> = {};

    socket.on(
      "typing_start",
      (data: { conversationId: string; userId: string; userName: string }) => {
        const { conversationId, userId, userName } = data;

        if (!typingUsers[conversationId]) {
          typingUsers[conversationId] = new Set();
        }

        typingUsers[conversationId].add(userId);

        // Clear existing timeout
        const timeoutKey = `${conversationId}_${userId}`;
        if (typingTimeouts[timeoutKey]) {
          clearTimeout(typingTimeouts[timeoutKey]);
        }

        // Auto-stop typing after 3 seconds if no typing_stop received
        typingTimeouts[timeoutKey] = setTimeout(() => {
          if (typingUsers[conversationId]) {
            typingUsers[conversationId].delete(userId);
            
            if (typingUsers[conversationId].size === 0) {
              delete typingUsers[conversationId];
            }

            socket.to(conversationId).emit("user_typing", {
              conversationId,
              userId,
              isTyping: false,
            });
          }
          delete typingTimeouts[timeoutKey];
        }, 3000);

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

        // Clear timeout
        const timeoutKey = `${conversationId}_${userId}`;
        if (typingTimeouts[timeoutKey]) {
          clearTimeout(typingTimeouts[timeoutKey]);
          delete typingTimeouts[timeoutKey];
        }

        socket.to(conversationId).emit("user_typing", {
          conversationId,
          userId,
          isTyping: false,
        });
      }
    );


    socket.on("heartbeat_pong", () => {
      const userId = socket.userId;
      if (userId && onlineUsers[userId]) {
        onlineUsers[userId].connectedAt = new Date();
      }
    });

    socket.on("heartbeat", (userId: string) => {
      if (onlineUsers[userId]) {
        onlineUsers[userId].connectedAt = new Date();
      }
    });

    socket.on("initiate_call", async (data: { conversationId: string }) => {
      try {
        const userId = socket.userId;
        
        if (!userId) {
          socket.emit("call_error", { message: "User not authenticated" });
          return;
        }

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

        // Set timeout to mark call as missed if not answered in 60 seconds
        setTimeout(async () => {
          try {
            const callMessage = await prisma.message.findUnique({
              where: { id: message.id },
              select: { callStatus: true }
            });
            
            if (callMessage?.callStatus === "MISSED") {
              await prisma.message.update({
                where: { id: message.id },
                data: { callStatus: "MISSED" }
              });

              // Notify all users that call was missed
              message.conversation.users.forEach(user => {
                if (userSockets[user.id]) {
                  io.to(userSockets[user.id]).emit("call_missed", {
                    messageId: message.id,
                    conversationId: data.conversationId
                  });
                }
              });
            }
          } catch (error) {
            console.error("Call timeout error:", error);
          }
        }, 60000);

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
        socket.emit("call_error", { message: "Failed to initiate call" });
      }
    });

    socket.on("call_response", async (data: { 
      messageId: string,
      response: "accept" | "decline"
    }) => {
      try {
        const userId = socket.userId;

        if (!userId) {
          socket.emit("call_error", { message: "User not authenticated" });
          return;
        }

        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
          include: { sender: true }
        });

        if (!message) {
          socket.emit("call_error", { message: "Call not found" });
          return;
        }

        // Update call status based on response
        const callStatus = data.response === "accept" ? "COMPLETED" : "DECLINED";
        await prisma.message.update({
          where: { id: data.messageId },
          data: { callStatus }
        });

        if (userSockets[message.senderId]) {
          io.to(userSockets[message.senderId]).emit("call_answered", {
            messageId: data.messageId,
            userId: userId,
            response: data.response
          });
        }

      } catch (error) {
        console.error("Call response error:", error);
        socket.emit("call_error", { message: "Failed to respond to call" });
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


    socket.on("webrtc_signal", (data: {
      messageId: string,
      targetUserId: string,
      signal: any
    }) => {
      const userId = socket.userId;

      if (!userId) {
        socket.emit("call_error", { message: "User not authenticated" });
        return;
      }

      if (!userSockets[data.targetUserId]) {
        socket.emit("call_error", { message: "Target user not online" });
        return;
      }

      if (userSockets[data.targetUserId] && userId) {
        io.to(userSockets[data.targetUserId]).emit("webrtc_signal", {
          messageId: data.messageId,
          userId: userId,
          signal: data.signal
        });
      }
    });
  });

  return io;
};