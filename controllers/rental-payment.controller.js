// server/controllers/rental-payment.controller.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const { bookingId } = req.body;
    const booking = await Booking.findById(bookingId).populate("equipmentId", "name");
    
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.customerId !== req.user.id) return res.status(403).json({ message: "Not your booking" });
    if (booking.paymentStatus === "paid") return res.status(400).json({ message: "Already paid" });
    
    // Check if equipment still exists
    if (!booking.equipmentId) {
      return res.status(400).json({ message: "Equipment no longer exists" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Rental: ${booking.equipmentId.name}` },
          unit_amount: Math.round(booking.totalAmount * 100), 
        },
        quantity: 1,
      }],
      metadata: { bookingId: booking._id.toString() },
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    // 👈 আসল এররটি ব্যাকএন্ড টার্মিনালে দেখার জন্য
    console.error("❌ Stripe Checkout Error:", err); 
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking) await confirmPayment(booking, session);
    }
  }
  res.json({ received: true });
};

const verifyPayment = async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (session.payment_status !== "paid") return res.status(400).json({ message: "Unpaid" });
    
    const booking = await Booking.findById(session.metadata?.bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    await confirmPayment(booking, session);
    res.json({ message: "Payment verified", booking });
  } catch (err) {
    console.error("❌ Stripe Verify Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { createCheckoutSession, stripeWebhook, verifyPayment };