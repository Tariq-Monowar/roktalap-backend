import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import http from "http";
import { Server } from "socket.io";

import users from "./models/v1/users/users.routes";
import messages from "./models/v1/messages/messages.routes"; // We'll create this

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
      "http://localhost:5174"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
});


export const userSockets: Record<string, string> = {};


io.on("connection", (socket) => {
  console.log("User connected", socket.id);


  socket.on("register", (userId: string) => {
    userSockets[userId] = socket.id;
    console.log(`User ${userId} registered with socket ID ${socket.id}`);
  });


  socket.on("disconnect", () => {
    // Remove user from tracking
    for (const [userId, socketId] of Object.entries(userSockets)) {
      if (socketId === socket.id) {
        delete userSockets[userId];
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });

  socket.on("join_conversation", (conversationId: string) => {
    socket.join(conversationId);
    console.log(`User joined conversation ${conversationId}`);
  });

  socket.on("leave_conversation", (conversationId: string) => {
    socket.leave(conversationId);
    console.log(`User left conversation ${conversationId}`);
  });
});


app.use(cors({
  origin: [
    "http://192.168.30.102:3000",
    "http://192.168.30.102:*",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174"
  ],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));


app.use("/v1/users", users);
app.use("/v1/messages", messages); 
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ message: "404 route not found" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({ message: "500 Something broken!", error: err.message });
});

export default server;