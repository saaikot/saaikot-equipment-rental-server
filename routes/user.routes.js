// routes/user.routes.js
const express = require("express");
const { verifyToken, verifyAdmin } = require("../middleware/auth.middleware");
const {
  getMe,
  updateMe,
  getAllUsers,
  updateUserRole,
  deleteUser,
} = require("../controllers/user.controller");

const router = express.Router();

// Current user
router.get("/me", verifyToken, getMe);
router.put("/me", verifyToken, updateMe);

// Admin-only account management
router.get("/admin/all", verifyToken, verifyAdmin, getAllUsers);
router.patch("/:id/role", verifyToken, verifyAdmin, updateUserRole);
router.delete("/:id", verifyToken, verifyAdmin, deleteUser);

module.exports = router;
