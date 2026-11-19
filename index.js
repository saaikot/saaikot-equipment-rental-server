// Force Node.js to use Google's public DNS servers to resolve MongoDB Atlas SRV records
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

// Import Routes
const userRoutes = require("./routes/user.routes");
const equipmentRoutes = require("./routes/equipment.routes");

const app = express();

// Middleware for Cross-Origin Resource Sharing
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
  })
);

// Middleware to parse incoming JSON payloads
app.use(express.json());

// A simple health check route
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "RentEasy API is running" });
});

// Mount Routes
app.use("/api/users", userRoutes);
app.use("/api/equipment", equipmentRoutes);

// 404 Not Found Handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

// Connect to DB, then start the server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});