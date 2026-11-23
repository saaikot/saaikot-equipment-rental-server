// Express application entry point for local development and Vercel.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const userRoutes = require("./routes/user.routes");
const equipmentRoutes = require("./routes/equipment.routes");
const rentalBookingRoutes = require("./routes/rental-booking.routes");
const rentalFavoriteRoutes = require("./routes/rental-favorite.routes");
const rentalPaymentRoutes = require("./routes/rental-payment.routes");
const rentalAnalyticsRoutes = require("./routes/rental-analytics.routes");

const app = express();

// Configure exact allowed frontend origins. CLIENT_URLS can contain a
// comma-separated list, for example production + preview frontend domains.
const configuredOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URLS || "").split(","),
]
  .map((value) => value && value.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins);

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://127.0.0.1:3000");
}

const corsOptions = {
  origin(origin, callback) {
    // Requests from server-to-server clients, curl, and health monitors may
    // not include an Origin header.
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }

    return callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Health endpoints intentionally do not depend on MongoDB. This lets us
// distinguish a function startup problem from a database connection problem.
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "RentEasy API is running",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "RentEasy API is running",
    database: "not checked",
  });
});

// Connect to MongoDB only for API requests. The connection is cached by
// config/db.js and reused by warm serverless invocations.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    return res.status(503).json({
      message: "Database unavailable",
      ...(process.env.NODE_ENV !== "production"
        ? { error: error.message }
        : {}),
    });
  }
});

// Keep the Stripe webhook before express.json() so Stripe receives the
// original raw request body for signature verification.
app.use("/api/payments", rentalPaymentRoutes);

// Parse JSON for the remaining API routes.
app.use(express.json({ limit: "1mb" }));

app.use("/api/users", userRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/bookings", rentalBookingRoutes);
app.use("/api/favorites", rentalFavoriteRoutes);
app.use("/api/analytics", rentalAnalyticsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Express 5 forwards rejected async route handlers to this middleware.
app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);

  if (res.headersSent) {
    return next(err);
  }

  if (err.message === "Origin is not allowed by CORS") {
    return res.status(403).json({ message: "Origin is not allowed by CORS" });
  }

  return res.status(500).json({
    message: "Internal server error",
    ...(process.env.NODE_ENV !== "production"
      ? { error: err.message }
      : {}),
  });
});

module.exports = app;
