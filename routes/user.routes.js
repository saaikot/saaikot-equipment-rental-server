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

// PUT /api/users/:id/role (Admin only - change a user's role)
router.patch("/:id/role", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["customer", "owner", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    // Prevent an admin from locking themselves out of the dashboard.
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Role updated", user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// DELETE /api/users/:id (Admin only - remove an account)
router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;