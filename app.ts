import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";

import path from "path";

import users from "./models/v1/users/users.routes";

const app = express();

app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",
      "http://192.168.30.102:*",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      "http://localhost:5174"
    ],
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan("dev"));


// app.use("/", (req: Request, res: Response, next: NextFunction) => {
//    res.status(200).json({
//     message: "Welcome to the API",
//   });
// })

app.use("/v1/users", users)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    message: `404 route not found`,
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});


export default app;