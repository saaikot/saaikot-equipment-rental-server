// Rate limiting. Serverless instances each keep their own counter, so these
// limits are a first line of defence rather than a hard global quota.
const rateLimit = require("express-rate-limit");

const tooMany = { message: "Too many requests. Please try again later." };

const skipOptions = (req) => req.method === "OPTIONS";

// General API budget: generous enough for normal dashboard usage.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => skipOptions(req) || req.path === "/api/health",
  message: tooMany,
});

// Mutating requests are more expensive and more attractive to abusers.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => skipOptions(req) || ["GET", "HEAD"].includes(req.method),
  message: tooMany,
});

// Checkout creation calls Stripe, so keep it tighter.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many payment attempts. Please wait and try again." },
});

module.exports = { apiLimiter, writeLimiter, checkoutLimiter };
