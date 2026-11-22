// server/controllers/rental-analytics.controller.js
const User = require("../models/user.model");
const Equipment = require("../models/equipment.model");
const Booking = require("../models/booking.model");
const Payment = require("../models/payment.model");

const getAdminAnalytics = async (req, res) => {
  try {
    const [totalUsers, totalEquipment, totalBookings, pendingApprovals, completedRentals] = await Promise.all([
      User.countDocuments(),
      Equipment.countDocuments(),
      Booking.countDocuments(),
      Equipment.countDocuments({ status: "pending" }),
      Booking.countDocuments({ bookingStatus: "completed" }),
    ]);

    const revenueAgg = await Payment.aggregate([
      { $match: { status: "succeeded" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    const monthlyBookings = await Booking.aggregate([
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
      // Take the most recent 12 months, then flip back to chronological order for charting.
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.json({ totals: { totalUsers, totalEquipment, totalBookings, pendingApprovals, completedRentals, totalRevenue }, monthlyBookings });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getOwnerAnalytics = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const [totalEquipment, completedRentals] = await Promise.all([
      Equipment.countDocuments({ ownerId }),
      Booking.countDocuments({ ownerId, bookingStatus: "completed" }),
    ]);

    const revenueAgg = await Payment.aggregate([
      { $match: { ownerId, status: "succeeded" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalEarnings = revenueAgg[0]?.total || 0;

    const monthlyEarnings = await Payment.aggregate([
      { $match: { ownerId, status: "succeeded" } },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, earnings: { $sum: "$amount" } } },
      // Most recent 12 months, displayed chronologically.
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.json({ totals: { totalEquipment, completedRentals, totalEarnings }, monthlyEarnings });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { getAdminAnalytics, getOwnerAnalytics };