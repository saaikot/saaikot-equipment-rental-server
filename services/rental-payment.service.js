// Payment + stock side effects shared by the webhook, verification and booking
// cancellation flows. Every operation is idempotent so Stripe retries cannot
// double-charge, double-decrement or double-restore stock.
const Booking = require("../models/booking.model");
const Equipment = require("../models/equipment.model");
const Payment = require("../models/payment.model");
const { getStripe } = require("../utils/stripe");

// Create/update the local payment record for a Stripe checkout session.
const recordPayment = async (booking, session) => {
  const amount = Number.isFinite(session.amount_total)
    ? session.amount_total / 100
    : booking.totalAmount;

  return Payment.findOneAndUpdate(
    { stripeSessionId: session.id },
    {
      $set: {
        bookingId: booking._id,
        customerId: booking.customerId,
        ownerId: booking.ownerId,
        amount,
        currency: session.currency || "usd",
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : "",
      },
      // Never overwrite a refunded status on a webhook retry.
      $setOnInsert: { stripeSessionId: session.id, status: "succeeded" },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
};

// Refund the most recent successful payment for a booking.
// Returns a result object instead of throwing so cancellation can still proceed
// when Stripe is temporarily unavailable (the failure is logged for follow-up).
const refundPayment = async (booking, reason = "requested_by_customer") => {
  const payment = await Payment.findOne({
    bookingId: booking._id,
    status: "succeeded",
  }).sort({ createdAt: -1 });

  if (!payment || !payment.stripePaymentIntentId) {
    return { refunded: false, reason: "No successful Stripe payment intent on record" };
  }

  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: payment.stripePaymentIntentId,
        reason:
          reason === "duplicate" || reason === "fraudulent"
            ? reason
            : "requested_by_customer",
        metadata: { bookingId: String(booking._id) },
      },
      { idempotencyKey: `refund-${booking._id}` }
    );

    payment.status = "refunded";
    payment.stripeRefundId = refund.id;
    await payment.save();

    return { refunded: true, refundId: refund.id };
  } catch (error) {
    console.error(`❌ [Refund ${booking._id}] ${error.message}`);
    return { refunded: false, error: error.message };
  }
};

// Restore reserved stock exactly once for a cancelled booking.
const restoreBookingStock = async (bookingId) => {
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, stockAllocated: true, stockRestored: { $ne: true } },
    { $set: { stockRestored: true } },
    { returnDocument: "after" }
  );

  if (!claimed) return false;

  await Equipment.updateOne(
    { _id: claimed.equipmentId },
    { $inc: { availableQuantity: claimed.requiredQuantity } }
  );

  return true;
};

// Confirm a paid checkout session.
// Safe to call from both the webhook and the success-page verification endpoint:
// concurrent/retried calls converge on the same state.
const confirmPayment = async (booking, session) => {
  if (!booking) {
    const error = new Error("Booking not found");
    error.status = 404;
    throw error;
  }

  // `checkout.session.completed` can arrive before an asynchronous payment
  // method settles; only allocate stock once money is actually captured.
  if (session.payment_status && session.payment_status !== "paid") {
    return { processed: false, reason: "Payment is not completed yet", booking };
  }

  await recordPayment(booking, session);

  // A checkout can complete after the owner cancelled the booking. Never
  // resurrect a cancelled booking: capture the record and refund instead.
  if (booking.bookingStatus === "cancelled") {
    const refund = await refundPayment(booking);
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          paymentStatus: refund.refunded ? "refunded" : "paid",
          stockAllocated: false,
          stockRestored: true,
          cancellationReason: "Payment completed after the booking was cancelled",
        },
      }
    );
    return {
      processed: false,
      refunded: refund.refunded,
      refund,
      reason: "Booking was already cancelled",
      booking: await Booking.findById(booking._id),
    };
  }

  // Late webhook retries after a refund must be a no-op.
  if (booking.paymentStatus === "refunded") {
    return { processed: false, reason: "Booking was already refunded", booking };
  }

  // Claim the paid state. Only the winning call continues to stock allocation.
  const paid = await Booking.findOneAndUpdate(
    { _id: booking._id, paymentStatus: { $ne: "paid" } },
    { $set: { paymentStatus: "paid", bookingStatus: "confirmed" } },
    { returnDocument: "after" }
  );

  // Claim stock allocation separately so retries after a crash cannot decrement
  // twice. Old records created before this flag existed are intentionally not
  // matched by `stockAllocated: false`.
  const stockClaim = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      paymentStatus: "paid",
      stockAllocated: false,
      stockRestored: { $ne: true },
    },
    { $set: { stockAllocated: true } },
    { returnDocument: "after" }
  );

  if (stockClaim) {
    const equipment = await Equipment.findOneAndUpdate(
      {
        _id: stockClaim.equipmentId,
        availableQuantity: { $gte: stockClaim.requiredQuantity },
      },
      { $inc: { availableQuantity: -stockClaim.requiredQuantity } },
      { returnDocument: "after" }
    );

    // Paid, but someone else rented the last unit first. Refund automatically.
    if (!equipment) {
      const refund = await refundPayment(stockClaim);
      await Booking.updateOne(
        { _id: stockClaim._id },
        {
          $set: {
            paymentStatus: "refunded",
            bookingStatus: "cancelled",
            stockAllocated: false,
            stockRestored: true,
            cancellationReason: "Equipment became unavailable before payment completed",
          },
        }
      );
      return { processed: true, refunded: true, refund, booking: stockClaim };
    }
  }

  // Re-read so callers receive the final stock flags as well as the status.
  const fresh = await Booking.findById(booking._id);
  return { processed: Boolean(paid), booking: fresh };
};

module.exports = { confirmPayment, refundPayment, restoreBookingStock, recordPayment };
