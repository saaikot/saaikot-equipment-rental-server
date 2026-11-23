// MongoDB connection helper with serverless connection reuse.
const mongoose = require("mongoose");

let cachedConnectionPromise = null;

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured in environment variables");
  }

  // A connection may already be active even if this module was reloaded.
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Reuse an in-progress connection attempt across warm invocations.
  if (cachedConnectionPromise) {
    return cachedConnectionPromise;
  }

  cachedConnectionPromise = mongoose
    .connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 0,
      bufferCommands: false,
    })
    .then((connection) => {
      console.log("MongoDB connected:", connection.connection.host);
      return connection;
    })
    .catch((error) => {
      cachedConnectionPromise = null;
      console.error("MongoDB connection error:", error.message);
      throw error;
    });

  return cachedConnectionPromise;
}

module.exports = connectDB;
