// models/booking.model.js
// Stores rental bookings made by customers.
const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // References
    equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Equipment", required: true },
    ownerId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },

    // Customer info snapshot (saved at time of booking)
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },

    // Booking details
    rentalStartDate: { type: Date, required: true },
    rentalEndDate: { type: Date, required: true },
    requiredQuantity: { type: Number, required: true, min: 1 },
    contactNumber: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    additionalNotes: { type: String, default: "" },

    // Price snapshot (so it doesn't change if owner edits price later)
    pricePerUnit: { type: Number, required: true },
    rentalType: { type: String, required: true },
    totalAmount: { type: Number, required: true },

    // Status trackers
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid",
    },
    bookingStatus: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);