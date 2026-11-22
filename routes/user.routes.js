// server/routes/user.routes.js
const express = require("express");
const { verifyToken, verifyAdmin } = require("../middleware/auth.middleware");
const User = require("../models/user.model");

const router = express.Router();

// GET /api/users/me (Get logged-in user's profile)
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// PUT /api/users/me (Update profile)
router.put("/me", verifyToken, async (req, res) => {
  try {
    const allowed = ["name", "phone", "address", "image"];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true });
    res.json({ message: "Profile updated", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET /api/users/admin/all (Admin only - list every registered user)
router.get("/admin/all", verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Newest accounts first; never return internal auth secrets.
    const users = await User.find()
      .select("name email role image phone address emailVerified createdAt")
      .sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;