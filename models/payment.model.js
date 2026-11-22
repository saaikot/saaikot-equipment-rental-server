// server/models/payment.model.js
// Stores successful Stripe transaction records.
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    customerId: { type: String, required: true },
    ownerId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, default: "" },
    status: { type: String, enum: ["succeeded", "failed"], default: "succeeded" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);