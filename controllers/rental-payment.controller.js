// controllers/rental-payment.controller.js
const Booking = require("../models/booking.model");
const Equipment = require("../models/equipment.model");
const Payment = require("../models/payment.model");
const config = require("../config/env");
const { getStripe } = require("../utils/stripe");
const { isValidObjectId, cleanString } = require("../utils/validators");
const { confirmPayment } = require("../services/rental-payment.service");

// 1. Create a Stripe Checkout Session for a booking.
const createCheckoutSession = async (req, res, next) => {
  try {
    const bookingId = req.body?.bookingId;
    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({ message: "A valid bookingId is required" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.customerId !== req.user.id) {
      return res.status(403).json({ message: "This booking does not belong to you" });
    }
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "This booking has already been paid" });
    }
    if (booking.paymentStatus === "refunded") {
      return res.status(400).json({ message: "This booking was refunded" });
    }
    if (["cancelled", "completed"].includes(booking.bookingStatus)) {
      return res.status(400).json({ message: "This booking can no longer be paid" });
    }

    const equipment = await Equipment.findById(booking.equipmentId)
      .select("name availableQuantity")
      .lean();
    if (!equipment) {
      return res.status(400).json({ message: "This equipment is no longer available" });
    }
    if (equipment.availableQuantity < booking.requiredQuantity) {
      return res.status(409).json({ message: "The requested quantity is no longer available" });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Rental: ${equipment.name || booking.equipmentName || "Equipment"}`,
              },
              unit_amount: Math.round(booking.totalAmount * 100),
            },
            quantity: 1,
          },
        ],
        customer_email: booking.customerEmail,
        client_reference_id: booking._id.toString(),
        metadata: {
          bookingId: booking._id.toString(),
          customerId: booking.customerId,
        },
        success_url: `${config.clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.clientUrl}/payment/cancel`,
      },
      // Reusing the key prevents duplicate checkout sessions on double clicks.
      { idempotencyKey: `checkout-${booking._id}` }
    );

    if (!session.url) {
      return res.status(502).json({ message: "Payment provider did not return a checkout URL" });
    }

    if (booking.stripeSessionId !== session.id) {
      booking.stripeSessionId = session.id;
      await booking.save();
    }

    return res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    return next(error);
  }
};

// 2. Stripe webhook. Mounted with express.raw() before the JSON parser.
const stripeWebhook = async (req, res, next) => {
  if (!config.stripeWebhookSecret || !config.stripeConfigured) {
    return res.status(503).json({ message: "Stripe webhook is not configured" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ message: "Missing Stripe signature" });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.body,
      signature,
      config.stripeWebhookSecret
    );
  } catch (error) {
    console.error(`❌ [Webhook ${req.id || "-"}] Invalid signature: ${error.message}`);
    return res.status(400).json({ message: "Invalid Stripe signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const bookingId = session?.metadata?.bookingId;

        if (!isValidObjectId(bookingId)) {
          console.warn(`⚠️ [Webhook] Event ${event.id} has no valid bookingId`);
          break;
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
          // Acknowledge so Stripe stops retrying an event we cannot reconcile.
          console.warn(`⚠️ [Webhook] Booking ${bookingId} not found`);
          break;
        }

        await confirmPayment(booking, session);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;
        const bookingId = session?.metadata?.bookingId;
        if (isValidObjectId(bookingId)) {
          await Booking.updateOne(
            { _id: bookingId, paymentStatus: "unpaid", stripeSessionId: session.id },
            { $set: { stripeSessionId: "" } }
          );
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntent =
          typeof charge.payment_intent === "string" ? charge.payment_intent : "";
        if (paymentIntent) {
          await Payment.updateOne(
            { stripePaymentIntentId: paymentIntent },
            { $set: { status: "refunded" } }
          );
        }
        break;
      }

      default:
        // Other events are acknowledged and ignored.
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    // Returning 5xx makes Stripe retry, which is what we want on transient errors.
    return next(error);
  }
};

// 3. Verify a checkout session from the success page.
const verifyPayment = async (req, res, next) => {
  try {
    const sessionId = cleanString(req.params.sessionId, 300);
    if (!sessionId.startsWith("cs_")) {
      return res.status(400).json({ message: "Invalid checkout session id" });
    }

    const stripe = getStripe();
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (error) {
      if (error.code === "resource_missing") {
        return res.status(404).json({ message: "Payment session not found" });
      }
      throw error;
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Payment has not been completed" });
    }

    const bookingId = session.metadata?.bookingId;
    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({ message: "Payment session is missing a booking reference" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // A session id is not a secret: never let one customer confirm another's
    // booking. client_reference_id is the booking id, so only the signed
    // customerId metadata can be compared against the authenticated user.
    const sessionCustomerId = session.metadata?.customerId || "";
    if (
      booking.customerId !== req.user.id ||
      (sessionCustomerId && sessionCustomerId !== req.user.id)
    ) {
      return res.status(403).json({ message: "This payment does not belong to you" });
    }

    const result = await confirmPayment(booking, session);
    return res.json({
      message: "Payment verified",
      booking: result.booking,
      ...(result.refunded ? { refund: result.refund } : {}),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createCheckoutSession, stripeWebhook, verifyPayment };
