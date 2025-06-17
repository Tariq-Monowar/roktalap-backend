import { Router } from 'express';
import {  googleAuth, addUserRole } from './users.controllers';
 
import upload from "../../config/multer.config";
import { verifyUser } from '../../middleware/verifyUsers';

const router = Router();


router.post('/google', upload.single('image'), googleAuth);
router.patch('/role', verifyUser('ANY'), addUserRole)

export default router;
