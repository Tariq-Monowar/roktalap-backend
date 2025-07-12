import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { onlineUsers } from "../../../socket";

const prisma = new PrismaClient();

interface NearbyDonor {
  id: string;
  fullName: string;
  email: string;
  bloodGroup: string;
  distance: number;
  phoneNumber: string | null;
  isOnline: boolean;
  location: {
    latitude: number;
    longitude: number;
    address: string | null;
  };
}

const findDonorsWithRadius = async (currentUser: any, userId: string, radius: number): Promise<NearbyDonor[]> => {
  const donors = await prisma.$queryRaw<Omit<NearbyDonor, 'isOnline'>[]>`
    WITH donor_distances AS (
      SELECT 
        u.id,
        u."fullName",
        u.email,
        u."bloodGroup",
        u."phoneNumber",
        l.latitude,
        l.longitude,
        l.address,
        (
          6371 * acos(
            cos(radians(${currentUser.location.latitude})) * 
            cos(radians(l.latitude)) * 
            cos(radians(l.longitude) - radians(${currentUser.location.longitude})) + 
            sin(radians(${currentUser.location.latitude})) * 
            sin(radians(l.latitude))
          )
        ) as distance
      FROM "User" u
      JOIN "Location" l ON u.id = l."userId"
      WHERE 
        u."bloodGroup" = ${currentUser.bloodGroup}::"BloodGroup"
        AND u.role = 'DONOR'
        AND u.id != ${userId}
    )
    SELECT *
    FROM donor_distances
    WHERE distance <= ${radius}
    ORDER BY distance ASC
  `;

  // Add online status to each donor
  return donors.map(donor => ({
    ...donor,
    isOnline: !!onlineUsers[donor.id]
  }));
};

export const findNearbyDonors = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    let searchRadius = 20; // Start with 20km
    const maxRadius = 200; // Maximum search radius in km
    const radiusIncrement = 20; // Increment by 20km each time

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

    let nearbyDonors: NearbyDonor[] = [];
    
    // Keep expanding the radius until donors are found or max radius is reached
    while (searchRadius <= maxRadius) {
      nearbyDonors = await findDonorsWithRadius(currentUser, userId, searchRadius);
      
      if (nearbyDonors.length > 0) {
        break;
      }
      searchRadius += radiusIncrement;
    }

    const responseMessage = nearbyDonors.length > 0
      ? `Found ${nearbyDonors.length} donors within ${searchRadius}km radius`
      : "No donors found even after expanding search radius to maximum";

    res.status(200).json({
      success: true,
      message: responseMessage,
      data: {
        yourBloodGroup: currentUser.bloodGroup,
        yourLocation: {
          latitude: currentUser.location.latitude,
          longitude: currentUser.location.longitude,
          address: currentUser.location.address,
        },
        searchRadius,
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

export const createBloodDonation = async (req: Request, res: Response) => {
  try {
    const donorId = req.user?.userId;
    const { recipientId } = req.body;

    if (!donorId || !recipientId) {
      res.status(400).json({
        success: false,
        message: "Both donor and recipient IDs are required",
      });
      return;
    }

    // Check if donor exists and is a DONOR
    const donor = await prisma.user.findUnique({
      where: { id: donorId },
    });

    if (!donor || donor.role !== 'DONOR') {
      res.status(400).json({
        success: false,
        message: "Invalid donor ID or user is not a donor",
      });
      return;
    }

    //     if (!donor) {
    //   res.status(400).json({
    //     success: false,
    //     message: "Invalid donor ID or user is not a donor",
    //   });
    //   return;
    // }

    // Check if recipient exists and is a RECIPIENT
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
    });

    if (!recipient || recipient.role !== 'RECIPIENT') {
      res.status(400).json({
        success: false,
        message: "Invalid recipient ID or user is not a recipient",
      });
      return;
    }

    // Check donor's last donation
    const lastDonation = await prisma.bloodTransfer.findFirst({
      where: { donorId },
      orderBy: { donationTime: 'desc' },
    });

    if (lastDonation) {
      const lastDonationDate = new Date(lastDonation.donationTime);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      if (lastDonationDate > sixMonthsAgo) {
        const nextDonationDate = new Date(lastDonationDate);
        nextDonationDate.setMonth(nextDonationDate.getMonth() + 6);
        res.status(400).json({
          success: false,
          message: `You cannot donate blood yet. Next donation possible after ${nextDonationDate.toISOString().split('T')[0]}`,
        });
        return;
      }
    }

    // Create blood donation record
    const donation = await prisma.bloodTransfer.create({
      data: {
        donorId,
        recipientId,
        donationTime: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      message: "Blood donation recorded successfully",
      data: donation,
    });
  } catch (error) {
    console.error("Error creating blood donation:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const getDonationHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { role } = req.query;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "User ID is required",
      });
      return;
    }

    let donations;
    if (role === 'donor') {
      donations = await prisma.bloodTransfer.findMany({
        where: { donorId: userId },
        include: {
          recipient: {
            select: {
              id: true,
              fullName: true,
              email: true,
              bloodGroup: true,
            },
          },
        },
        orderBy: { donationTime: 'desc' },
      });
    } else if (role === 'recipient') {
      donations = await prisma.bloodTransfer.findMany({
        where: { recipientId: userId },
        include: {
          donor: {
            select: {
              id: true,
              fullName: true,
              email: true,
              bloodGroup: true,
            },
          },
        },
        orderBy: { donationTime: 'desc' },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid role specified",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Found ${donations.length} ${role === 'donor' ? 'donations' : 'received donations'}`,
      data: donations,
    });
  } catch (error) {
    console.error("Error fetching donation history:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};
