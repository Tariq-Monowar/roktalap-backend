// utils/userTransformer.ts
import { User } from "@prisma/client";
import { getImageUrl } from "./base_utl";
import jwt from "jsonwebtoken";

export function transformUserResponse(user: User) {
  return {
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
    birthID: user.birthID ? getImageUrl(user.birthID) : null,
    isFirstTime: user.isFirstTime,
  };
}


export function generateAuthToken(user: User) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "360d" }
  );
}