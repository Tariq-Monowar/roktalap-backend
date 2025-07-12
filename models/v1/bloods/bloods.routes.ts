import express from "express"
import { verifyUser } from "../../../middleware/verifyUsers"
import { findNearbyDonors, createBloodDonation, getDonationHistory } from "./bloods.controllers";

const router = express.Router()

router.get("/nearby-donors", verifyUser("ANY"), findNearbyDonors);
router.post("/donate", verifyUser("DONOR"), createBloodDonation);
router.get("/history", verifyUser("ANY"), getDonationHistory);

export default router