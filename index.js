// index.js
// Express application. Locally it is started by local-server.js; on Vercel the
// zero-config Express preset runs this exported app as a single function.
const config = require("./config/env");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const mongoose = require("mongoose");
const connectDB = require("./config/db");

const { requestId, sanitizeRequest } = require("./middleware/request.middleware");
const { apiLimiter, writeLimiter } = require("./middleware/rateLimit.middleware");
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");
const { stripeWebhook } = require("./controllers/rental-payment.controller");

const userRoutes = require("./routes/user.routes");
const equipmentRoutes = require("./routes/equipment.routes");
const rentalBookingRoutes = require("./routes/rental-booking.routes");
const rentalFavoriteRoutes = require("./routes/rental-favorite.routes");
const rentalPaymentRoutes = require("./routes/rental-payment.routes");
const rentalAnalyticsRoutes = require("./routes/rental-analytics.routes");

const app = express();

// ---------------------------------------------------------------------------
// Platform / proxy settings
// ---------------------------------------------------------------------------
app.disable("x-powered-by");
// Vercel terminates TLS and forwards the client IP via X-Forwarded-For.
if (config.isVercel) app.set("trust proxy", 1);
app.set("etag", "strong");

// Fail loudly in the logs (without crashing the function) when configuration
// is incomplete. Individual routes return 503 when their dependency is missing.
for (const name of config.required) {
  console.error(`❌ Missing required environment variable: ${name}`);
}
for (const name of config.paymentWarnings) {
  console.warn(`⚠️ Payment feature disabled: ${name} is not set`);
}

// ---------------------------------------------------------------------------
// Cross-cutting middleware
// ---------------------------------------------------------------------------
app.use(requestId);

app.use(
  helmet({
    // This is a JSON API; a document CSP is not useful and can interfere with
    // developer tooling. Other hardening headers stay enabled.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

app.use(compression());

// CORS: explicit allow-list. Wildcard origins are unsafe together with
// `credentials: true`, so the previous `|| "*"` fallback is deliberately gone.
const allowedOrigins = new Set(config.clientOrigins);
const vercelPreviewOrigin = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const corsOptions = {
  origin(origin, callback) {
    // Requests without an Origin header (curl, server-to-server) are allowed.
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/+$/, "");
    if (allowedOrigins.has(normalized)) return callback(null, true);

    if (config.allowVercelPreviews && vercelPreviewOrigin.test(normalized)) {
      return callback(null, true);
    }

    const error = new Error("Origin is not allowed by CORS");
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "stripe-signature",
    "x-request-id",
  ],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// ---------------------------------------------------------------------------
// Liveness / readiness (no database required for the liveness probe)
// ---------------------------------------------------------------------------
const startedAt = Date.now();

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "RentEasy API",
    version: "1.0.0",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", async (req, res) => {
  const started = Date.now();
  try {
    await connectDB();
    res.json({
      status: "ok",
      database: mongoose.connection.readyState === 1 ? "connected" : "connecting",
      databaseLatencyMs: Date.now() - started,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`❌ [Health ${req.id}] Database unavailable: ${error.message}`);
    res.status(503).json({
      status: "degraded",
      database: "unavailable",
      message: "Database is unavailable",
      requestId: req.id,
    });
  }
});

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
// Stripe needs the untouched raw body, so this route is declared before the
// global JSON parser. It still needs the database connection.
const requireDatabase = async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    const unavailable = new Error("Database is unavailable");
    unavailable.status = 503;
    unavailable.cause = error;
    return next(unavailable);
  }
};

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  requireDatabase,
  stripeWebhook
);

app.use(express.json({ limit: "1mb" }));
app.use(sanitizeRequest);

// ---------------------------------------------------------------------------
// Rate limiting + database availability
// ---------------------------------------------------------------------------
app.use("/api", apiLimiter);
app.use("/api", requireDatabase);
app.use("/api", writeLimiter);

// ---------------------------------------------------------------------------
// Application routes
// ---------------------------------------------------------------------------
app.use("/api/users", userRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/bookings", rentalBookingRoutes);
app.use("/api/favorites", rentalFavoriteRoutes);
app.use("/api/payments", rentalPaymentRoutes);
app.use("/api/analytics", rentalAnalyticsRoutes);

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// Export the app so Vercel can run it as a serverless function.
module.exports = app;
