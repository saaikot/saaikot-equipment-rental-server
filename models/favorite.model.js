// models/favorite.model.js
// Customers save equipment to their favorites list.
const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, index: true },
    equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Equipment", required: true },
  },
  { timestamps: true }
);

// Prevent duplicate favorite entries
favoriteSchema.index({ customerId: 1, equipmentId: 1 }, { unique: true });

module.exports = mongoose.model("Favorite", favoriteSchema);