// routes/equipment.routes.js
const express = require("express");
const {
  createEquipment, getAllEquipment, getFeaturedEquipment, getSingleEquipment,
  getMyEquipment, updateEquipment, deleteEquipment,
  getAdminEquipment, approveEquipment, rejectEquipment,
} = require("../controllers/equipment.controller");
const { verifyToken, verifyOwner, verifyAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

// --- Public Routes ---
router.get("/", getAllEquipment);
router.get("/featured", getFeaturedEquipment);

// --- Owner Routes (Must be placed BEFORE /:id) ---
router.get("/owner/my", verifyToken, verifyOwner, getMyEquipment);
router.post("/", verifyToken, verifyOwner, createEquipment);

// --- Admin Routes (Must be placed BEFORE /:id) ---
router.get("/admin/all", verifyToken, verifyAdmin, getAdminEquipment);
router.patch("/:id/approve", verifyToken, verifyAdmin, approveEquipment);
router.patch("/:id/reject", verifyToken, verifyAdmin, rejectEquipment);

// --- Shared Private Routes ---
router.get("/:id", verifyToken, getSingleEquipment);
router.put("/:id", verifyToken, verifyOwner, updateEquipment);
router.delete("/:id", verifyToken, deleteEquipment); // Owner or Admin checked in controller

module.exports = router;