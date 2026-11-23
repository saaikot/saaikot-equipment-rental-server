// Stores Stripe transaction records.
const mongoose = require("mongoose");
const { PAYMENT_RECORD_STATUSES } = require("../utils/constants");

const paymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    customerId: { type: String, required: true },
    ownerId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "usd", maxlength: 10 },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, default: "" },
    stripeRefundId: { type: String, default: "" },
    status: {
      type: String,
      enum: PAYMENT_RECORD_STATUSES,
      default: "succeeded",
      index: true,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
paymentSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
