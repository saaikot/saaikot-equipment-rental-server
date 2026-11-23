// routes/equipment.routes.js
const express = require("express");
const {
  createEquipment,
  getAllEquipment,
  getFeaturedEquipment,
  getSingleEquipment,
  getMyEquipment,
  updateEquipment,
  deleteEquipment,
  getAdminEquipment,
  approveEquipment,
  rejectEquipment,
} = require("../controllers/equipment.controller");
const { verifyToken, verifyOwner, verifyAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

// --- Public routes ---
router.get("/", getAllEquipment);
router.get("/featured", getFeaturedEquipment);

// --- Owner routes (must be declared before /:id) ---
router.get("/owner/my", verifyToken, verifyOwner, getMyEquipment);
router.post("/", verifyToken, verifyOwner, createEquipment);

// --- Admin routes (must be declared before /:id) ---
router.get("/admin/all", verifyToken, verifyAdmin, getAdminEquipment);
router.patch("/:id/approve", verifyToken, verifyAdmin, approveEquipment);
router.patch("/:id/reject", verifyToken, verifyAdmin, rejectEquipment);

// --- Shared private routes (ownership checked in the controller) ---
router.get("/:id", verifyToken, getSingleEquipment);
router.put("/:id", verifyToken, updateEquipment);
router.delete("/:id", verifyToken, deleteEquipment);

module.exports = router;
