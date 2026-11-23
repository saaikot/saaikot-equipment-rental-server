// Stores all equipment listed by owners.
const mongoose = require("mongoose");
const { EQUIPMENT_CATEGORIES, RENTAL_TYPES, EQUIPMENT_STATUSES } = require("../utils/constants");

const equipmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 5000 },
    category: {
      type: String,
      required: true,
      enum: EQUIPMENT_CATEGORIES,
      index: true,
    },
    location: { type: String, required: true, trim: true, maxlength: 200 },
    price: { type: Number, required: true, min: 0 },
    rentalType: { type: String, required: true, enum: RENTAL_TYPES },
    availableQuantity: { type: Number, required: true, min: 0, default: 1 },
    condition: { type: String, default: "", maxlength: 100 },
    brand: { type: String, default: "", maxlength: 100 },
    model: { type: String, default: "", maxlength: 100 },
    imageURL: { type: String, required: true, maxlength: 2000 },
    rentalTerms: { type: String, default: "", maxlength: 2000 },

    // Approval status
    status: {
      type: String,
      enum: EQUIPMENT_STATUSES,
      default: "pending",
      index: true,
    },

    // Owner info (BetterAuth string id)
    ownerId: { type: String, required: true },
    ownerName: { type: String, required: true, maxlength: 120 },
    ownerEmail: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: true }
);

// Indexes that back the public catalogue filters and dashboards.
equipmentSchema.index({ status: 1, createdAt: -1 });
equipmentSchema.index({ status: 1, category: 1, price: 1 });
equipmentSchema.index({ status: 1, rentalType: 1, price: 1 });
equipmentSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model("Equipment", equipmentSchema);
