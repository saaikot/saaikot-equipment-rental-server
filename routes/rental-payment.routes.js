// routes/rental-payment.routes.js
const express = require("express");
const {
  createCheckoutSession,
  verifyPayment,
} = require("../controllers/rental-payment.controller");
const { verifyToken, verifyRenter } = require("../middleware/auth.middleware");
const { checkoutLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

// The raw-body webhook route is mounted directly in index.js before
// express.json(); these routes use the app-wide JSON parser.
router.post(
  "/create-checkout-session",
  checkoutLimiter,
  verifyToken,
  verifyRenter,
  createCheckoutSession
);
router.post("/verify/:sessionId", verifyToken, verifyRenter, verifyPayment);

module.exports = router;
