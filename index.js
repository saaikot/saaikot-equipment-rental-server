// Force Node.js to use Google's public DNS servers to resolve MongoDB Atlas SRV records
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require("dotenv").config();
// This is the main entry point for the Express server.
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

// Middleware for Cross-Origin Resource Sharing (allows Next.js frontend to communicate)
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    credentials: true,
  })
);

// Middleware to parse incoming JSON payloads
app.use(express.json());

// A simple health check route to test if the server is running
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "RentEasy API is running" });
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