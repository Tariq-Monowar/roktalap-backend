import { Router } from 'express';
import {  googleAuth, addUserRole, sendSignupOtp, signupverifyOtp, updateUserProfile } from './users.controllers';
 
import upload from "../../../config/multer.config";
import { verifyUser } from '../../../middleware/verifyUsers';

const router = Router();


router.post('/google', upload.single('image'), googleAuth);
router.patch('/role', verifyUser('ANY'), addUserRole)

router.post('/signup/send-otp', sendSignupOtp)
router.post("/signup/verify-otp", signupverifyOtp);

router.patch('/update', verifyUser('ANY'), upload.single('image'), updateUserProfile);

export default router;
