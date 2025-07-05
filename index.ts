import { PrismaClient } from "@prisma/client";
import { app, server } from "./app";
import { initializeSocket } from "./socket";

const PORT = process.env.PORT || 8000;
const prisma = new PrismaClient();

initializeSocket(server);

server.listen(PORT, async () => {
  try {
    console.log(`Server running on http://localhost:${PORT}`);
    await prisma.$connect();
    console.log("Database connected...");
  } catch (err) {
    console.error("Database connection error:", err);
  }
});
