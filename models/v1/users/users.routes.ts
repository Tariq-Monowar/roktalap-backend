import { Router } from "express";
import {
  googleAuth,
  addUserRole,
  sendSignupOtp,
  signupverifyOtp,
  updateUserProfile,
  switchUserRole
} from "./users.controllers";

import upload, { multipleUpload } from "../../../config/multer.config";
import { verifyUser } from "../../../middleware/verifyUsers";

const router = Router();

router.post("/google", upload.single("image"), googleAuth);
router.patch("/add-role", verifyUser("ANY"), addUserRole);

router.post("/signup/send-otp", sendSignupOtp);
router.post("/signup/verify-otp", signupverifyOtp);

router.patch("/update", verifyUser("ANY"), multipleUpload, updateUserProfile);

router.patch("/switch-role", verifyUser("ANY"), switchUserRole);

export default router;
