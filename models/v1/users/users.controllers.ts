import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { getImageUrl } from "../../../utils/base_utl";
import {
  generateOTP,
  sendRegistrationOTPEmail,
} from "../../../utils/emailService.utils";
import { transformUserResponse } from "../../../utils/userTransformer";

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
  console.log("Google Auth route hit");
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
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "360d" }
    );

    const userData = transformUserResponse(user);

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

export const addUserRole = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const { role } = req.body;
    if (!role) {
      res.status(400).json({
        success: false,
        message: "Role is required",
      });
      return;
    }

    if (!["DONOR", "RECIPIENT"].includes(role)) {
      res.status(400).json({
        success: false,
        message: "Invalid role. Role must be DONOR or RECIPIENT",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role, isFirstTime: false },
    });

    const token = jwt.sign(
      {
        userId: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "360d" }
    );

    const userData = transformUserResponse(updatedUser);

    res.status(200).json({
      success: true,
      message: "User role updated successfully",
      user: userData,
      token,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const sendSignupOtp = async (req: Request, res: Response) => {
  try {
    const otpExpiryTime = 5 * 60 * 1000;
    const { email, name, password } = req.body;
    const missingField = ["name", "email", "password"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }
    const otp = generateOTP();
    const expiry = new Date(Date.now() + otpExpiryTime);

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      res.status(400).json({
        success: false,
        message: "User already exists. Please log in.",
      });
      return;
    }

    await prisma.ucode.upsert({
      where: { email },
      update: {
        otp,
        expired_at: expiry,
        name,
        password,
      },
      create: {
        name,
        email,
        otp,
        password,
        expired_at: expiry,
      },
    });

    sendRegistrationOTPEmail(name, email, otp);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      email,
      name,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const signupverifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    const missingField = ["email", "otp"].find((field) => !req.body[field]);

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }

    const ucode = await prisma.ucode.findUnique({ where: { email } });

    if (!ucode) {
      res.status(400).json({
        success: false,
        error: "No OTP request found for this email",
      });
      return;
    }

    if (ucode.otp !== otp) {
      res.status(400).json({
        success: false,
        error: "Invalid OTP",
      });
      return;
    }

    if (!ucode.expired_at || new Date() > ucode.expired_at) {
      res.status(400).json({
        success: false,
        error: "OTP has expired",
      });
      return;
    }

    if (!ucode.password || !ucode.name) {
      res.status(400).json({
        success: false,
        error: "Registration data is incomplete",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(ucode.password, 10);

    const user = await prisma.user.create({
      data: {
        fullName: ucode.name,
        email: ucode.email,
        password: hashedPassword,
      },
    });

    await prisma.ucode.delete({
      where: { email },
    });

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "360d" }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.user;
    const { fullName, address, bio, bloodGroup, phoneNumber, birthDate } =
      req.body;

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const newImage = files?.image?.[0];
    const newBirthID = files?.birthID?.[0];

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "User ID is required",
      });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: String(userId) },
    });

    if (!existingUser) {
      if (newImage) {
        try {
          const imagePath = path.join(
            __dirname,
            "../../../uploads",
            newImage.filename
          );
          if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        } catch (fileError) {
          console.error("Error cleaning up image:", fileError);
        }
      }
      if (newBirthID) {
        try {
          const birthIDPath = path.join(
            __dirname,
            "../../../uploads",
            newBirthID.filename
          );
          if (fs.existsSync(birthIDPath)) fs.unlinkSync(birthIDPath);
        } catch (fileError) {
          console.error("Error cleaning up birthID:", fileError);
        }
      }
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const updateData: any = {
      fullName: fullName || existingUser.fullName,
      address: address !== undefined ? address : existingUser.address,
      bio: bio !== undefined ? bio : existingUser.bio,
      bloodGroup:
        bloodGroup !== undefined ? bloodGroup : existingUser.bloodGroup,
      phoneNumber:
        phoneNumber !== undefined ? phoneNumber : existingUser.phoneNumber,
      birthDate: birthDate ? new Date(birthDate) : existingUser.birthDate,
    };

    if (newImage) {
      if (existingUser.image) {
        try {
          const oldImagePath = path.join(
            __dirname,
            "../../../uploads",
            existingUser.image
          );
          if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
        } catch (fileError) {
          console.error("Error deleting old image:", fileError);
        }
      }
      updateData.image = newImage.filename;
    }

    if (newBirthID) {
      if (existingUser.birthID) {
        try {
          const oldBirthIDPath = path.join(
            __dirname,
            "../../../uploads",
            existingUser.birthID
          );
          if (fs.existsSync(oldBirthIDPath)) fs.unlinkSync(oldBirthIDPath);
        } catch (fileError) {
          console.error("Error deleting old birthID:", fileError);
        }
      }
      updateData.birthID = newBirthID.filename;
    }

    const updatedUser = await prisma.user.update({
      where: { id: String(userId) },
      data: updateData,
    });

    const responseData = transformUserResponse(updatedUser);

    res.status(200).json({
      success: true,
      message: "User profile updated successfully",
      user: responseData,
    });
  } catch (error) {
    console.error("Error in updateUserProfile:", error);

    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      for (const field in files) {
        const fileArray = files[field];
        for (const file of fileArray) {
          try {
            const filePath = path.join(
              __dirname,
              "../../../uploads",
              file.filename
            );
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (fileError) {
            console.error(`Error cleaning up ${field}:`, fileError);
          }
        }
      }
    }

    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const switchUserRole = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    if (!["DONOR", "RECIPIENT"].includes(user.role)) {
      res.status(400).json({
        success: false,
        message: "User role must be either DONOR or RECIPIENT",
      });
      return;
    }

    const newRole = user.role === "DONOR" ? "RECIPIENT" : "DONOR";

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    const token = jwt.sign(
      {
        userId: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "360d" }
    );

    const userData = transformUserResponse(updatedUser) 


    res.status(200).json({
      success: true,
      message: `User role switched to ${newRole} successfully`,
      user: userData,
      token,
    });
  } catch (error) {
    console.error("Error switching user role:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
