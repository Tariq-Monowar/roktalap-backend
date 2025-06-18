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
      isFirstTime: user?.isFirstTime,
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

    const userData = {
      id: updatedUser.id,
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      image: updatedUser.image ? getImageUrl(updatedUser.image) : null,
      address: updatedUser.address || null,
      bio: updatedUser.bio || null,
      role: updatedUser.role,
      bloodGroup: updatedUser.bloodGroup || null,
      phoneNumber: updatedUser.phoneNumber || null,
      birthDate: updatedUser.birthDate
        ? updatedUser.birthDate.toISOString()
        : null,
      birthID: updatedUser.birthID
        ? getImageUrl(`/uploads/${updatedUser.birthID}`)
        : null,
      isFirstTime: updatedUser?.isFirstTime,
    };

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
    const { fullName, address, bio, bloodGroup, phoneNumber, birthDate } = req.body;
    const newImage = req.file;

    // Validate required fields
    if (!userId) {
       res.status(400).json({
        success: false,
        message: "User ID is required",
      });
      return
    }

    // Find existing user
    const existingUser = await prisma.user.findUnique({
      where: { id: String(userId) },
    });

    if (!existingUser) {
      // Clean up uploaded file if user not found
      if (newImage) {
        try {
          const imagePath = path.join(__dirname, "../../../uploads", newImage.filename);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        } catch (fileError) {
          console.error("Error cleaning up image:", fileError);
        }
      }
       res.status(404).json({
        success: false,
        message: "User not found",
      });
      return
    }

    // Prepare update data
    const updateData: any = {
      fullName: fullName || existingUser.fullName,
      address: address !== undefined ? address : existingUser.address,
      bio: bio !== undefined ? bio : existingUser.bio,
      bloodGroup: bloodGroup !== undefined ? bloodGroup : existingUser.bloodGroup,
      phoneNumber: phoneNumber !== undefined ? phoneNumber : existingUser.phoneNumber,
      birthDate: birthDate ? new Date(birthDate) : existingUser.birthDate,
    };

    // Handle image update
    if (newImage) {
      // Delete old image if exists
      if (existingUser.image) {
        try {
          const oldImagePath = path.join(__dirname, "../../../uploads", existingUser.image);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        } catch (fileError) {
          console.error("Error deleting old image:", fileError);
        }
      }
      updateData.image = newImage.filename;
    }

    // Handle birthID update
    if (req.body.birthID) {
      try {
        // Delete old birthID if exists
        if (existingUser.birthID) {
          const oldBirthIDPath = path.join(__dirname, "../../../uploads", existingUser.birthID);
          if (fs.existsSync(oldBirthIDPath)) {
            fs.unlinkSync(oldBirthIDPath);
          }
        }
        
        // Save new birthID
        const birthIDPath = await downloadAndSaveImage(req.body.birthID);
        updateData.birthID = birthIDPath;
      } catch (fileError) {
        console.error("Error handling birthID:", fileError);
        // Clean up uploaded image if birthID failed
        if (newImage) {
          try {
            const imagePath = path.join(__dirname, "../../../uploads", newImage.filename);
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
            }
          } catch (cleanupError) {
            console.error("Error cleaning up image:", cleanupError);
          }
        }
         res.status(500).json({
          success: false,
          message: "Failed to process birthID image",
        });
        return
      }
    }

    // Update user data
    const updatedUser = await prisma.user.update({
      where: { id: String(userId) },
      data: updateData,
    });

    // Generate new token
    const token = jwt.sign(
      {
        userId: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "360d" }
    );

    // Prepare response
    const responseData = {
      id: updatedUser.id,
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      image: updatedUser.image ? getImageUrl(updatedUser.image) : null,
      address: updatedUser.address,
      bio: updatedUser.bio,
      role: updatedUser.role,
      bloodGroup: updatedUser.bloodGroup,
      phoneNumber: updatedUser.phoneNumber,
      birthDate: updatedUser.birthDate?.toISOString(),
      birthID: updatedUser.birthID ? getImageUrl(`/uploads/${updatedUser.birthID}`) : null,
      isFirstTime: updatedUser.isFirstTime,
    };

     res.status(200).json({
      success: true,
      message: "User profile updated successfully",
      user: responseData,
      token,
    });

  } catch (error) {
    console.error("Error in updateUserProfile:", error);
    
    // Clean up uploaded file if error occurred
    if (req.file) {
      try {
        const imagePath = path.join(__dirname, "../../../uploads", req.file.filename);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (fileError) {
        console.error("Error cleaning up uploaded image:", fileError);
      }
    }

     res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};