// controllers/rental-booking.controller.js
const Booking = require("../models/booking.model");
const Equipment = require("../models/equipment.model");
const User = require("../models/user.model");

// Helper: Calculate how many units (days/weeks/months) to bill
const calcRentalUnits = (start, end, rentalType) => {
  const ms = new Date(end) - new Date(start);
  if (ms <= 0) return 0;
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  
  if (rentalType === "Daily") return days;
  if (rentalType === "Weekly") return Math.ceil(days / 7);
  if (rentalType === "Monthly") return Math.ceil(days / 30);
  return days;
};

// 1. Create Booking (Customer Only)
const createBooking = async (req, res) => {
  try {
    const { equipmentId, rentalStartDate, rentalEndDate, requiredQuantity, contactNumber, deliveryAddress, additionalNotes } = req.body;

    if (!equipmentId || !rentalStartDate || !rentalEndDate || !requiredQuantity || !contactNumber || !deliveryAddress) {
      return res.status(400).json({ message: "Missing required booking fields" });
    }

    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) return res.status(404).json({ message: "Equipment not found" });
    if (equipment.status !== "approved") return res.status(400).json({ message: "Equipment not available for booking" });

    // Check stock
    if (equipment.availableQuantity < requiredQuantity) {
      return res.status(400).json({ message: `Only ${equipment.availableQuantity} unit(s) available` });
    }

    // Calculate Price
    const units = calcRentalUnits(rentalStartDate, rentalEndDate, equipment.rentalType);
    if (units <= 0) return res.status(400).json({ message: "End date must be after start date" });
    
    const totalAmount = equipment.price * requiredQuantity * units;

    // Create Record
    const booking = await Booking.create({
      equipmentId: equipment._id,
      ownerId: equipment.ownerId,
      customerId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      rentalStartDate, rentalEndDate, requiredQuantity, contactNumber, deliveryAddress,
      additionalNotes: additionalNotes || "",
      pricePerUnit: equipment.price,
      rentalType: equipment.rentalType,
      totalAmount,
      paymentStatus: "unpaid",
      bookingStatus: "pending",
    });

    res.status(201).json({ message: "Booking created, proceed to payment", booking });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 2. Get Customer's Own Bookings
const getMyRentals = async (req, res) => {
  try {
    const bookings = await Booking.find({ customerId: req.user.id })
      .populate("equipmentId", "name imageURL category")
      .sort({ createdAt: -1 });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 3. Get Bookings for Owner's Equipment
const getOwnerRentals = async (req, res) => {
  try {
    const bookings = await Booking.find({ ownerId: req.user.id })
      .populate("equipmentId", "name imageURL category")
      .sort({ createdAt: -1 });
    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 4. Get All Bookings (Admin Only)
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("equipmentId", "name imageURL category")
      .sort({ createdAt: -1 })
      .lean();

    // Attach the owner's name/email so the admin table can show both parties.
    const ownerIds = [...new Set(bookings.map((booking) => booking.ownerId))];
    const owners = await User.find({ _id: { $in: ownerIds } })
      .select("name email")
      .lean();
    const ownerMap = new Map(owners.map((owner) => [owner._id, owner]));

    const enriched = bookings.map((booking) => ({
      ...booking,
      ownerName: ownerMap.get(booking.ownerId)?.name || "",
      ownerEmail: ownerMap.get(booking.ownerId)?.email || "",
    }));

    res.json({ bookings: enriched });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 5. Get Single Booking (Used for Payment page)
const getSingleBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("equipmentId", "name imageURL");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Allow only the customer, the owner, or an admin to view
    if (booking.customerId !== req.user.id && booking.ownerId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to view this booking" });
    }
    res.json({ booking });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 6. Update Booking Status (Owner or Admin)
const updateBookingStatus = async (req, res) => {
  try {
    const { bookingStatus } = req.body;
    if (!["pending", "confirmed", "completed", "cancelled"].includes(bookingStatus)) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.ownerId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to update status" });
    }

    booking.bookingStatus = bookingStatus;
    await booking.save();
    res.json({ message: "Booking status updated", booking });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  createBooking, getMyRentals, getOwnerRentals, getAllBookings, getSingleBooking, updateBookingStatus,
};