// controllers/user.controller.js
const mongoose = require("mongoose");
const User = require("../models/user.model");
const Equipment = require("../models/equipment.model");
const Booking = require("../models/booking.model");
const Favorite = require("../models/favorite.model");
const { USER_ROLES, ACTIVE_BOOKING_STATUSES } = require("../utils/constants");
const { cleanString } = require("../utils/validators");

// Never return BetterAuth internals (tokens, account ids, ...).
const SAFE_USER_FIELDS = "name email role image phone address emailVerified createdAt";

// 1. Get the logged-in user's profile
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select(SAFE_USER_FIELDS).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
};

// 2. Update the logged-in user's profile (self-service fields only)
const updateMe = async (req, res, next) => {
  try {
    const body = req.body || {};
    const updates = {};

    if (body.name !== undefined) {
      const name = cleanString(body.name, 120);
      if (name.length < 2) {
        return res.status(400).json({ message: "Name must be at least 2 characters" });
      }
      updates.name = name;
    }
    if (body.phone !== undefined) {
      updates.phone = cleanString(body.phone, 30);
    }
    if (body.address !== undefined) {
      updates.address = cleanString(body.address, 500);
    }
    if (body.image !== undefined) {
      updates.image = cleanString(body.image, 2000);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    updates.updatedAt = new Date();

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      returnDocument: "after",
      runValidators: true,
      select: SAFE_USER_FIELDS,
    }).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "Profile updated", user });
  } catch (error) {
    return next(error);
  }
};

// 3. Admin: list every registered user
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select(SAFE_USER_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
};

// 4. Admin: change a user's role
const updateUserRole = async (req, res, next) => {
  try {
    const role = cleanString(req.body?.role, 20);
    if (!USER_ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }

    const target = await User.findById(req.params.id).select("role").lean();
    if (!target) return res.status(404).json({ message: "User not found" });

    // Do not allow the platform to lose its last admin.
    if (target.role === "admin" && role !== "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ message: "At least one admin account is required" });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role, updatedAt: new Date() },
      { returnDocument: "after", runValidators: true, select: SAFE_USER_FIELDS }
    ).lean();

    return res.json({ message: "Role updated", user });
  } catch (error) {
    return next(error);
  }
};

// 5. Admin: delete an account and its owned content
const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const target = await User.findById(req.params.id).select("role").lean();
    if (!target) return res.status(404).json({ message: "User not found" });

    if (target.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ message: "At least one admin account is required" });
      }
    }

    // Protect live rentals: the account can be removed once they are settled.
    const activeBookings = await Booking.countDocuments({
      $or: [{ customerId: req.params.id }, { ownerId: req.params.id }],
      bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
    });
    if (activeBookings > 0) {
      return res.status(409).json({
        message: "This user has pending or confirmed rentals and cannot be deleted yet",
      });
    }

    const ownedEquipment = await Equipment.find({ ownerId: req.params.id })
      .select("_id")
      .lean();
    const equipmentIds = ownedEquipment.map((item) => item._id);

    await Promise.all([
      Favorite.deleteMany({ customerId: req.params.id }),
      equipmentIds.length
        ? Favorite.deleteMany({ equipmentId: { $in: equipmentIds } })
        : Promise.resolve(),
      equipmentIds.length
        ? Equipment.deleteMany({ ownerId: req.params.id })
        : Promise.resolve(),
      User.deleteOne({ _id: req.params.id }),
      // BetterAuth keeps credentials/sessions in separate collections.
      mongoose.connection.collection("session").deleteMany({ userId: req.params.id }),
      mongoose.connection.collection("account").deleteMany({ userId: req.params.id }),
    ]);

    return res.json({ message: "User deleted" });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getMe, updateMe, getAllUsers, updateUserRole, deleteUser };
