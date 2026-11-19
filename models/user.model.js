// This model mirrors BetterAuth's "user" collection.
// BetterAuth uses string IDs (not MongoDB ObjectIds), so _id is defined as a String.
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // BetterAuth generates string IDs
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: "" },
    
    // Custom fields we add via BetterAuth configuration
    role: {
      type: String,
      enum: ["customer", "owner", "admin"],
      default: "customer",
    },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  {
    collection: "user", // Must match BetterAuth's default collection name
    strict: false,      // Allow BetterAuth to store extra internal fields
  }
);

module.exports = mongoose.model("User", userSchema);