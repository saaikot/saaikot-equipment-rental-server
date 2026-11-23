// Stripe payment controller.
// Stripe is initialized lazily so a missing Stripe key does not crash the
// entire Express function during module loading. Payment endpoints will return
// a clear configuration error until the key is added in Vercel Environment Variables.
let stripeClient;

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripeClient) {
    const Stripe = require("stripe");
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

const Booking = require("../models/booking.model");
const Equipment = require("../models/equipment.model");
const Payment = require("../models/payment.model");

const confirmPayment = async (booking, session) => {
  await Payment.findOneAndUpdate(
    { stripeSessionId: session.id },
    {
      bookingId: booking._id,
      customerId: booking.customerId,
      ownerId: booking.ownerId,
      amount: session.amount_total / 100,
      currency: session.currency,
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent || "",
      status: "succeeded",
    },
    { upsert: true, new: true }
  );

  if (booking.paymentStatus !== "paid") {
    booking.paymentStatus = "paid";
    booking.bookingStatus = "confirmed";
    await booking.save();

    const equipment = await Equipment.findById(booking.equipmentId);
    if (equipment && equipment.availableQuantity >= booking.requiredQuantity) {
      equipment.availableQuantity -= booking.requiredQuantity;
      await equipment.save();
    }
  }
};

const createCheckoutSession = async (req, res) => {
  try {
    const stripe = getStripe();
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const booking = await Booking.findById(bookingId).populate("equipmentId", "name");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (String(booking.customerId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not your booking" });
    }

    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "Already paid" });
    }

    if (!booking.equipmentId) {
      return res.status(400).json({ message: "Equipment no longer exists" });
    }

    if (!process.env.CLIENT_URL) {
      throw new Error("CLIENT_URL is not configured");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Rental: ${booking.equipmentId.name}` },
            unit_amount: Math.round(booking.totalAmount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: { bookingId: booking._id.toString() },
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error.message);
    return res.status(500).json({
      message: "Unable to create checkout session",
      ...(process.env.NODE_ENV !== "production"
        ? { error: error.message }
        : {}),
    });
  }
};

const stripeWebhook = async (req, res) => {
  try {
    const stripe = getStripe();

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }

    const signature = req.headers["stripe-signature"];
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;

      if (bookingId) {
        const booking = await Booking.findById(bookingId);
        if (booking) {
          await confirmPayment(booking, session);
        }
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error.message);
    return res.status(400).json({
      message: "Webhook processing failed",
      ...(process.env.NODE_ENV !== "production"
        ? { error: error.message }
        : {}),
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Unpaid" });
    }

    const bookingId = session.metadata?.bookingId;
    const booking = bookingId ? await Booking.findById(bookingId) : null;

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // A renter may only verify payment for their own booking.
    if (String(booking.customerId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not your booking" });
    }

    await confirmPayment(booking, session);
    return res.json({ message: "Payment verified", booking });
  } catch (error) {
    console.error("Stripe payment verification error:", error.message);
    return res.status(500).json({
      message: "Unable to verify payment",
      ...(process.env.NODE_ENV !== "production"
        ? { error: error.message }
        : {}),
    });
  }
};

module.exports = {
  createCheckoutSession,
  stripeWebhook,
  verifyPayment,
};
