import express from "express"
import { verifyUser } from "../../../middleware/verifyUsers"
import { findNearbyDonors } from "./bloods.controllers";

const router = express.Router()

router.get("/nearby-donors", verifyUser("DONOR"), findNearbyDonors);

export default router