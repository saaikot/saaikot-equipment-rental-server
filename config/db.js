
// This file handles the MongoDB database connection using Mongoose.
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Check if MONGODB_URI exists in the .env file
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing in environment variables");
    }
    
    // Attempt to connect to the database
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    // Exit the process if connection fails
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;