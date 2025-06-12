import { Router } from "express";
import { 
  createDonor, 
  createRecipient, 
  loginUser,
  updateProfile
} from "./users.controllers";
import upload from "../../config/multer.config";
import { verifyUser } from "../../middleware/verifyUsers";

const router = Router();

// Registration routes
router.post("/register/donor", upload.single('birthId'), createDonor);
router.post("/register/recipient", createRecipient);

// Login route
router.post("/login", loginUser);

// Protected update profile route
router.put(
  "/profile", 
  verifyUser("ANY"), 
  upload.single('birthId'), 
  updateProfile
);

export default router;
