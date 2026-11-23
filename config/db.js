// server/config/db.js
const mongoose = require("mongoose");

// Cache the connection promise to reuse it across invocations
let cachedPromise = null;

const connectDB = async () => {
  // If we already have a connection promise, return it
  if (cachedPromise) {
    return cachedPromise;
  }

  // Create a new connection promise
  cachedPromise = mongoose
    .connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
    })
    .then((conn) => {
      console.log(`✅ MongoDB connected: ${conn.connection.host}`);
      return conn;
    })
    .catch((error) => {
      // If connection fails, clear the cache so the next request can retry
      cachedPromise = null;
      console.error("❌ MongoDB connection error:", error.message);
      throw error;
    });

  return cachedPromise;
};

module.exports = connectDB;