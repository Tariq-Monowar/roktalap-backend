import { Router } from 'express';
import {  googleAuth } from './users.controllers';
 
import upload from "../../../config/multer.config";

const router = Router();


router.post('/google', upload.single('image'), googleAuth);


export default router;
