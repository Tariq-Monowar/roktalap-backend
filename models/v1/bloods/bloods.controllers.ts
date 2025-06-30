import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface NearbyDonor {
  id: string;
  fullName: string;
  email: string;
  bloodGroup: string;
  distance: number;
  phoneNumber: string | null;
  location: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
}

export const findNearbyDonors = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const MAX_DISTANCE_KM = 20;

    // Get current user's details
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { location: true },
    });

    if (!currentUser) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (!currentUser.bloodGroup) {
      res.status(400).json({
        success: false,
        message: "Your blood group is not set in your profile",
      });
      return;
    }

    if (!currentUser.location) {
      res.status(400).json({
        success: false,
        message: "Your location is not set",
      });
      return;
    }

    // Using raw SQL query for PostGIS distance calculation
    const nearbyDonors = await prisma.$queryRaw<NearbyDonor[]>`
      SELECT 
        u.id,
        u."fullName",
        u.email,
        u."bloodGroup",
        u."phoneNumber",
        l.latitude,
        l.longitude,
        l.address,
        ST_Distance(
          ST_MakePoint(l.longitude, l.latitude)::geography,
          ST_MakePoint(${currentUser.location.longitude}, ${
      currentUser.location.latitude
    })::geography
        ) / 1000 AS distance
      FROM "User" u
      JOIN "Location" l ON u.id = l."userId"
      WHERE 
        u."bloodGroup" = ${currentUser.bloodGroup}
        AND u.role = 'DONOR'
        AND u.id != ${userId}
        AND ST_DWithin(
          ST_MakePoint(l.longitude, l.latitude)::geography,
          ST_MakePoint(${currentUser.location.longitude}, ${
      currentUser.location.latitude
    })::geography,
          ${MAX_DISTANCE_KM * 1000}
        )
      ORDER BY distance ASC
    `;

    res.status(200).json({
      success: true,
      message: "Nearby donors found successfully",
      data: {
        yourBloodGroup: currentUser.bloodGroup,
        yourLocation: {
          latitude: currentUser.location.latitude,
          longitude: currentUser.location.longitude,
          address: currentUser.location.address,
        },
        donors: nearbyDonors.map((donor) => ({
          ...donor,
          distance: parseFloat(donor.distance.toFixed(2)),
        })),
      },
    });
  } catch (error) {
    console.error("Error finding nearby donors:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
