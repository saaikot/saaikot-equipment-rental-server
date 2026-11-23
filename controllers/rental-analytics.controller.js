// controllers/rental-analytics.controller.js
const User = require("../models/user.model");
const Equipment = require("../models/equipment.model");
const Booking = require("../models/booking.model");
const Payment = require("../models/payment.model");
const { roundMoney } = require("../utils/validators");

// First day of the month `monthsBack` months ago (UTC), so charts always cover
// the same rolling window regardless of server timezone.
const monthsAgo = (monthsBack) => {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
  return date;
};

const monthKey = (id) => `${id.year}-${String(id.month).padStart(2, "0")}`;

const sortMonths = (a, b) =>
  a._id.year - b._id.year || a._id.month - b._id.month;

const getAdminAnalytics = async (req, res, next) => {
  try {
    const since = monthsAgo(11);

    const [
      totalUsers,
      totalEquipment,
      totalBookings,
      pendingApprovals,
      completedRentals,
      revenueAgg,
      monthlyBookingAgg,
      monthlyRevenueAgg,
    ] = await Promise.all([
      User.countDocuments(),
      Equipment.countDocuments(),
      Booking.countDocuments(),
      Equipment.countDocuments({ status: "pending" }),
      Booking.countDocuments({ bookingStatus: "completed" }),
      Payment.aggregate([
        { $match: { status: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Booking.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
      ]),
      Payment.aggregate([
        { $match: { status: "succeeded", createdAt: { $gte: since } } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            revenue: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    // Merge booking counts with captured revenue per month.
    const byMonth = new Map();
    for (const entry of monthlyBookingAgg) {
      byMonth.set(monthKey(entry._id), {
        _id: entry._id,
        count: entry.count,
        revenue: 0,
      });
    }
    for (const entry of monthlyRevenueAgg) {
      const key = monthKey(entry._id);
      const existing = byMonth.get(key) || {
        _id: entry._id,
        count: 0,
        revenue: 0,
      };
      existing.revenue = roundMoney(entry.revenue);
      byMonth.set(key, existing);
    }

    const monthlyBookings = [...byMonth.values()].sort(sortMonths);
    const totalRevenue = roundMoney(revenueAgg[0]?.total || 0);

    return res.json({
      totals: {
        totalUsers,
        totalEquipment,
        totalBookings,
        pendingApprovals,
        completedRentals,
        totalRevenue,
      },
      monthlyBookings,
    });
  } catch (error) {
    return next(error);
  }
};

const getOwnerAnalytics = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const since = monthsAgo(11);

    const [totalEquipment, completedRentals, revenueAgg, monthlyEarningsAgg] =
      await Promise.all([
        Equipment.countDocuments({ ownerId }),
        Booking.countDocuments({ ownerId, bookingStatus: "completed" }),
        Payment.aggregate([
          { $match: { ownerId, status: "succeeded" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Payment.aggregate([
          { $match: { ownerId, status: "succeeded", createdAt: { $gte: since } } },
          {
            $group: {
              _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
              earnings: { $sum: "$amount" },
            },
          },
        ]),
      ]);

    const totalEarnings = roundMoney(revenueAgg[0]?.total || 0);
    const monthlyEarnings = monthlyEarningsAgg
      .map((entry) => ({ ...entry, earnings: roundMoney(entry.earnings) }))
      .sort(sortMonths);

    return res.json({
      totals: { totalEquipment, completedRentals, totalEarnings },
      monthlyEarnings,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAdminAnalytics, getOwnerAnalytics };
