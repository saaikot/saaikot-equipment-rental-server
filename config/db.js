// config/db.js
// Handles the MongoDB connection using Mongoose.
const dns = require("dns");
const mongoose = require("mongoose");

// Windows/Node can fail to resolve MongoDB Atlas SRV records with the system
// resolver, so force Google DNS locally. Vercel's resolver works as-is.
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

// Cache the connection promise so serverless invocations (Vercel) reuse a single
// connection instead of opening a new one on every request.
let connectionPromise = null;

const connectDB = async () => {
  // Already connected: nothing to do.
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  // Make the missing configuration obvious instead of failing deep inside Mongoose.
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in environment variables");
  }

  // Only start one connection attempt at a time.
  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGODB_URI)
      .then((conn) => {
        console.log(`✅ MongoDB connected: ${conn.connection.host}`);
        return conn.connection;
      })
      .catch((error) => {
        // Allow a later request to retry after a transient failure.
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
};

module.exports = connectDB;
