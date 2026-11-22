// index.js
// Express application. On Vercel this file is detected automatically and the
// exported app runs as a single serverless function.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

// Import Routes
const userRoutes = require("./routes/user.routes");
const equipmentRoutes = require("./routes/equipment.routes");
const rentalBookingRoutes = require("./routes/rental-booking.routes");
const rentalFavoriteRoutes = require("./routes/rental-favorite.routes");
const rentalPaymentRoutes = require("./routes/rental-payment.routes");
const rentalAnalyticsRoutes = require("./routes/rental-analytics.routes");

const app = express();

// Middleware for Cross-Origin Resource Sharing
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
  })
);

// Connect to MongoDB before handling a request. The helper caches the
// connection, so after the first request this is only a cheap state check.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    res.status(503).json({ message: "Database unavailable" });
  }
});

// IMPORTANT: Payment routes are mounted BEFORE express.json() so the Stripe
// webhook can receive the raw body. Their JSON routes parse bodies individually.
app.use("/api/payments", rentalPaymentRoutes);

// Middleware to parse incoming JSON payloads (for all other routes)
app.use(express.json());

// A simple health check route
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "RentEasy API is running" });
});

// Mount Routes
app.use("/api/users", userRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/bookings", rentalBookingRoutes);
app.use("/api/favorites", rentalFavoriteRoutes);
app.use("/api/analytics", rentalAnalyticsRoutes);

// 404 Not Found Handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// Export the app so Vercel can run it as a serverless function.
module.exports = app;
