import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getImageUrl } from "../../../utils/base_utl";

const prisma = new PrismaClient();

dotenv.config();

const downloadAndSaveImage = async (imageUrl: string): Promise<string> => {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to download image");

    const buffer = await response.arrayBuffer();
    const filename = `${uuidv4()}.jpg`;
    const filepath = path.join(__dirname, "../../../uploads", filename);

    fs.writeFileSync(filepath, Buffer.from(buffer));
    return filename;
  } catch (error) {
    console.error("Error saving image:", error);
    return imageUrl;
  }
};

export const googleAuth = async (req: Request, res: Response) => {
    console.log('Google Auth route hit');
  try {
    const { fullName, email, image } = req.body;

    if (!fullName || !email || !image) {
      res.status(400).json({
        success: false,
        message: "Something went wrong! Please try again",
      });
      return;
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      const savedImagePath = await downloadAndSaveImage(image);
      user = await prisma.user.create({
        data: {
          fullName,
          email,
          image: savedImagePath,
        },
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "360d" }
    );

    const userData = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      image: user.image ? getImageUrl(user.image) : null,
      address: user.address || null,
      bio: user.bio || null,
      role: user.role,
      bloodGroup: user.bloodGroup || null,
      phoneNumber: user.phoneNumber || null,
      birthDate: user.birthDate ? user.birthDate.toISOString() : null,
      birthID: user.birthID ? getImageUrl(`/uploads/${user.birthID}`) : null,
    };

    res.status(200).json({
      success: true,
      message: "User authenticated successfully",
      user: userData,
      token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
