import { Request, Response } from "express";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../../middleware/verifyUsers";

const prisma = new PrismaClient();

// Helper function to validate email format
const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};


export const createDonor = async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      email,
      password,
      address,
      bio,
      bloodGroup,
      phoneNumber,
      birthDate,
      locationId,
    } = req.body;

    const missingField = ["fullName", "email", "password", "bloodGroup", "phoneNumber", "birthDate"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required for donor registration!`,
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ message: "Invalid email format" });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ message: "User already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        role: "DONOR",
        address,
        bio,
        bloodGroup,
        phoneNumber,
        birthDate: new Date(birthDate),
        locationId,
        birthIdUrl: req.file?.path,
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      message: "Donor account created successfully",
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Error in createDonor:", error);
    res.status(500).json({ message: "Internal server error" });
    return;
  }
};

export const createRecipient = async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      email,
      password,
      address,
      bio,
      bloodGroup,
      phoneNumber,
      locationId,
    } = req.body;

    const missingField = ["fullName", "email", "password"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required for recipient registration!`,
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ message: "Invalid email format" });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ message: "User already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        role: "RECIPIENT",
        address,
        bio,
        bloodGroup,
        phoneNumber,
        locationId,
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      message: "Recipient account created successfully",
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Error in createRecipient:", error);
    res.status(500).json({ message: "Internal server error" });
    return;
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

 
    const missingField = ["email", "password"].find(
        (field) => !req.body[field]
      );
  
      if (missingField) {
        res.status(400).json({
          message: `${missingField} is required!`,
        });
        return;
      }
  
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: "Login successful",
      user: userWithoutPassword,
      token,
    });
  } catch (error) {
    console.error("Error in loginUser:", error);
    res.status(500).json({ message: "Internal server error" });
    return;
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      fullName,
      email,
      address,
      bio,
      bloodGroup,
      phoneNumber,
      birthDate,
      locationId,
    } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Validate email if it's being updated
    if (email && email !== existingUser.email) {
      if (!isValidEmail(email)) {
        res.status(400).json({ message: "Invalid email format" });
        return;
      }

      // Check if new email is already taken
      const emailExists = await prisma.user.findUnique({
        where: { email }
      });

      if (emailExists) {
        res.status(400).json({ message: "Email already in use" });
        return;
      }
    }

    // Additional validation for donors
    if (existingUser.role === "DONOR") {
      if (bloodGroup === "" || phoneNumber === "") {
        res.status(400).json({
          message: "Blood group and phone number cannot be empty for donors"
        });
        return;
      }
    }

    // Prepare update data based on user role
    const updateData: any = {
      fullName: fullName || undefined,
      email: email || undefined,
      address: address || undefined,
      bio: bio || undefined,
      bloodGroup: bloodGroup || undefined,
      phoneNumber: phoneNumber || undefined,
      locationId: locationId || undefined,
    };

    // Add donor-specific fields only if user is a donor
    if (existingUser.role === "DONOR") {
      updateData.birthDate = birthDate ? new Date(birthDate) : undefined;
      updateData.birthIdUrl = req.file?.path || undefined;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    const { password: _, ...userWithoutPassword } = updatedUser;

    res.json({
      message: "Profile updated successfully",
      user: userWithoutPassword
    });

  } catch (error) {
    console.error("Error in updateProfile:", error);
    res.status(500).json({ message: "Internal server error" });
    return;
  }
};

