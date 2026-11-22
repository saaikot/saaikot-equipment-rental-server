// server/routes/rental-payment.routes.js
const express = require("express");
const { createCheckoutSession, stripeWebhook, verifyPayment } = require("../controllers/rental-payment.controller");
const { verifyToken, verifyRenter } = require("../middleware/auth.middleware");

const router = express.Router();

// This router is mounted BEFORE the global express.json() (so the webhook can
// receive the raw body), which means these routes must parse JSON themselves.
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);
router.post("/create-checkout-session", express.json(), verifyToken, verifyRenter, createCheckoutSession);
router.post("/verify/:sessionId", express.json(), verifyToken, verifyRenter, verifyPayment);

module.exports = router;