// routes/rental-booking.routes.js
const express = require("express");
const {
  createBooking, getMyRentals, getOwnerRentals, getAllBookings, getSingleBooking, updateBookingStatus,
} = require("../controllers/rental-booking.controller");
const { verifyToken, verifyRenter, verifyOwner, verifyAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

// --- Customer Routes ---
router.post("/", verifyToken, verifyRenter, createBooking);
router.get("/my-rentals", verifyToken, verifyRenter, getMyRentals);

// --- Owner Routes ---
router.get("/owner-rentals", verifyToken, verifyOwner, getOwnerRentals);

// --- Admin Routes ---
router.get("/", verifyToken, verifyAdmin, getAllBookings);

// --- Shared Routes (Access controlled inside controller) ---
router.patch("/:id/status", verifyToken, updateBookingStatus);
router.get("/:id", verifyToken, getSingleBooking);

module.exports = router;