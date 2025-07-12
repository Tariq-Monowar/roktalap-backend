import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import http from "http";

import users from "./models/v1/users/users.routes";
import messages from "./models/v1/messages/messages.routes";
import bloodTransfer from "./models/v1/bloods/bloods.routes";

const app = express();
const server = http.createServer(app);

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
      "https://v0-firebase-backend-setup-khaki.vercel.app",
      "https://v0-firebase-api-documentation.vercel.app"
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.use("/v1/users", users);
app.use("/v1/messages", messages);
app.use("/v1/blord", bloodTransfer);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ message: "404 route not found" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res
    .status(500)
    .json({ message: "500 Something broken!", error: err.message });
});

export { app, server };