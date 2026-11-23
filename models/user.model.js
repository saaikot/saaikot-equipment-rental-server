// This model mirrors BetterAuth's "user" collection.
// BetterAuth uses string IDs (not MongoDB ObjectIds), so _id is a String.
const mongoose = require("mongoose");
const { USER_ROLES } = require("../utils/constants");

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // BetterAuth generates string IDs
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, unique: true, required: true, lowercase: true, maxlength: 200 },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: "", maxlength: 2000 },

    // Custom fields added through BetterAuth's additionalFields config.
    role: {
      type: String,
      enum: USER_ROLES,
      default: "customer",
      index: true,
    },
    phone: { type: String, default: "", maxlength: 30 },
    address: { type: String, default: "", maxlength: 500 },

    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  {
    collection: "user", // Must match BetterAuth's default collection name
    strict: false, // Allow BetterAuth to store extra internal fields
  }
);

module.exports = mongoose.model("User", userSchema);
