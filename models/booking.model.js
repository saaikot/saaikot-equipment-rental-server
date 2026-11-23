// Stores rental bookings made by customers.
const mongoose = require("mongoose");
const {
  RENTAL_TYPES,
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
} = require("../utils/constants");

const bookingSchema = new mongoose.Schema(
  {
    // References
    equipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Equipment",
      required: true,
      index: true,
    },
    ownerId: { type: String, required: true },
    customerId: { type: String, required: true },

    // Snapshot so history survives equipment edits/deletion.
    equipmentName: { type: String, default: "", maxlength: 120 },
    equipmentImage: { type: String, default: "", maxlength: 2000 },

    // Customer info snapshot (saved at time of booking)
    customerName: { type: String, required: true, maxlength: 120 },
    customerEmail: { type: String, required: true, maxlength: 200 },

    // Booking details
    rentalStartDate: { type: Date, required: true },
    rentalEndDate: { type: Date, required: true },
    requiredQuantity: { type: Number, required: true, min: 1 },
    contactNumber: { type: String, required: true, maxlength: 30 },
    deliveryAddress: { type: String, required: true, maxlength: 500 },
    additionalNotes: { type: String, default: "", maxlength: 1000 },

    // Price snapshot (so it doesn't change if the owner edits price later)
    pricePerUnit: { type: Number, required: true, min: 0 },
    rentalType: { type: String, required: true, enum: RENTAL_TYPES },
    totalAmount: { type: Number, required: true, min: 0 },

    // Status trackers
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "unpaid",
      index: true,
    },
    bookingStatus: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "pending",
      index: true,
    },

    // Stock bookkeeping. These flags make payment confirmation and cancellation
    // idempotent (a webhook retry must never decrement/restore twice).
    stockAllocated: { type: Boolean, default: false },
    stockRestored: { type: Boolean, default: false },
    cancellationReason: { type: String, default: "", maxlength: 500 },

    // Latest Stripe checkout session, used for idempotent session creation.
    stripeSessionId: { type: String, default: "", maxlength: 300 },
  },
  { timestamps: true }
);

bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ ownerId: 1, createdAt: -1 });
bookingSchema.index({ equipmentId: 1, bookingStatus: 1, rentalStartDate: 1, rentalEndDate: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
