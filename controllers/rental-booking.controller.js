// controllers/rental-booking.controller.js
const Booking = require("../models/booking.model");
const Equipment = require("../models/equipment.model");
const User = require("../models/user.model");
const { BOOKING_STATUSES } = require("../utils/constants");
const {
  cleanString,
  isValidObjectId,
  toPositiveInteger,
  parseDate,
  roundMoney,
} = require("../utils/validators");
const {
  refundPayment,
  restoreBookingStock,
} = require("../services/rental-payment.service");

// Allowed status transitions. Terminal states cannot be reopened.
const TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// Calculate how many units (days/weeks/months) to bill.
const calcRentalUnits = (start, end, rentalType) => {
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));

  if (rentalType === "Daily") return days;
  if (rentalType === "Weekly") return Math.ceil(days / 7);
  if (rentalType === "Monthly") return Math.ceil(days / 30);
  return days;
};

// 1. Create Booking (customer only)
const createBooking = async (req, res, next) => {
  try {
    const body = req.body || {};
    const equipmentId = body.equipmentId;
    if (!isValidObjectId(equipmentId)) {
      return res.status(400).json({ message: "A valid equipmentId is required" });
    }

    const startDate = parseDate(body.rentalStartDate);
    const endDate = parseDate(body.rentalEndDate);
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Valid rental start and end dates are required" });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (startDate.getTime() < today.getTime() - 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Rental start date cannot be in the past" });
    }
    if (endDate.getTime() <= startDate.getTime()) {
      return res.status(400).json({ message: "Rental end date must be after the start date" });
    }

    const requiredQuantity = toPositiveInteger(body.requiredQuantity);
    if (!requiredQuantity || requiredQuantity > 1000) {
      return res.status(400).json({ message: "requiredQuantity must be a positive integer" });
    }

    const contactNumber = cleanString(body.contactNumber, 30);
    if (contactNumber.length < 3) {
      return res.status(400).json({ message: "A valid contact number is required" });
    }

    const deliveryAddress = cleanString(body.deliveryAddress, 500);
    if (deliveryAddress.length < 5) {
      return res.status(400).json({ message: "A valid delivery address is required" });
    }

    const equipment = await Equipment.findById(equipmentId).lean();
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" });
    }
    if (equipment.status !== "approved") {
      return res.status(400).json({ message: "Equipment is not available for booking" });
    }
    if (equipment.availableQuantity < requiredQuantity) {
      return res.status(400).json({
        message: `Only ${equipment.availableQuantity} unit(s) available`,
      });
    }

    const units = calcRentalUnits(startDate, endDate, equipment.rentalType);
    if (units <= 0) {
      return res.status(400).json({ message: "Invalid rental period" });
    }

    const totalAmount = roundMoney(equipment.price * requiredQuantity * units);

    const booking = await Booking.create({
      equipmentId: equipment._id,
      equipmentName: equipment.name,
      equipmentImage: equipment.imageURL,
      ownerId: equipment.ownerId,
      customerId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      rentalStartDate: startDate,
      rentalEndDate: endDate,
      requiredQuantity,
      contactNumber,
      deliveryAddress,
      additionalNotes: cleanString(body.additionalNotes, 1000),
      pricePerUnit: equipment.price,
      rentalType: equipment.rentalType,
      totalAmount,
      paymentStatus: "unpaid",
      bookingStatus: "pending",
    });

    return res.status(201).json({ message: "Booking created, proceed to payment", booking });
  } catch (error) {
    return next(error);
  }
};

// 2. Get the customer's own bookings
const getMyRentals = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ customerId: req.user.id })
      .populate("equipmentId", "name imageURL category")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
};

// 3. Get bookings for the owner's equipment
const getOwnerRentals = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ ownerId: req.user.id })
      .populate("equipmentId", "name imageURL category")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ bookings });
  } catch (error) {
    return next(error);
  }
};

// 4. Get all bookings (admin only)
const getAllBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .populate("equipmentId", "name imageURL category")
      .sort({ createdAt: -1 })
      .lean();

    // Attach owner contact details for the admin table.
    const ownerIds = [...new Set(bookings.map((booking) => booking.ownerId).filter(Boolean))];
    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } }).select("name email").lean()
      : [];
    const ownerMap = new Map(owners.map((owner) => [String(owner._id), owner]));

    const enriched = bookings.map((booking) => ({
      ...booking,
      ownerName: ownerMap.get(String(booking.ownerId))?.name || "",
      ownerEmail: ownerMap.get(String(booking.ownerId))?.email || "",
    }));

    return res.json({ bookings: enriched });
  } catch (error) {
    return next(error);
  }
};

// 5. Get a single booking (customer, owner or admin)
const getSingleBooking = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking id" });
    }

    const booking = await Booking.findById(req.params.id)
      .populate("equipmentId", "name imageURL category")
      .lean();
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isCustomer = booking.customerId === req.user.id;
    const isOwner = booking.ownerId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isCustomer && !isOwner && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to view this booking" });
    }

    return res.json({ booking });
  } catch (error) {
    return next(error);
  }
};

// 6. Update booking status (owner or admin)
const updateBookingStatus = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid booking id" });
    }

    const bookingStatus = cleanString(req.body?.bookingStatus, 20);
    if (!BOOKING_STATUSES.includes(bookingStatus)) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isAdmin = req.user.role === "admin";
    if (booking.ownerId !== req.user.id && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to update this booking" });
    }

    // Idempotent: repeated requests should not fail or re-run side effects.
    if (booking.bookingStatus === bookingStatus) {
      return res.json({ message: "Booking status unchanged", booking });
    }

    const allowed = TRANSITIONS[booking.bookingStatus] || [];
    if (!allowed.includes(bookingStatus)) {
      return res.status(400).json({
        message: `Cannot change a ${booking.bookingStatus} booking to ${bookingStatus}`,
      });
    }

    let refund = null;

    if (bookingStatus === "cancelled") {
      // Give the unit back exactly once.
      await restoreBookingStock(booking._id);

      // If money was captured, attempt a Stripe refund. A failure is reported
      // but should not prevent the cancellation itself.
      if (booking.paymentStatus === "paid") {
        refund = await refundPayment(booking);
        if (refund.refunded) {
          booking.paymentStatus = "refunded";
        }
      }

      booking.cancellationReason = cleanString(req.body?.cancellationReason, 500);
    }

    booking.bookingStatus = bookingStatus;
    await booking.save();

    return res.json({
      message: "Booking status updated",
      booking,
      ...(refund ? { refund } : {}),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createBooking,
  getMyRentals,
  getOwnerRentals,
  getAllBookings,
  getSingleBooking,
  updateBookingStatus,
};
