import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const verifyUser = (...allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    console.log(authHeader)

    if (!authHeader) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

     // Handle 'Bearer <token>' or just '<token>'
    let token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    try {
  
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
      req.user = decoded;

      if (
        allowedRoles.length &&
        !allowedRoles.includes("ANY") &&
        !allowedRoles.includes(req.user?.role)
      ) {
        res
          .status(403)
          .json({ message: "Access denied. Insufficient permission." });
        return;
      }

      next();
    } catch (error) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }
  };
};