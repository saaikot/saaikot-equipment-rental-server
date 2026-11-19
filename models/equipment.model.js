// Stores all equipment listed by owners.
const mongoose = require("mongoose");

const equipmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: [
        "Construction Equipment", "Photography Equipment",
        "Vehicles & Transportation", "Agriculture Equipment",
        "Electronics", "Event Equipment",
      ],
    },
    location: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    rentalType: { type: String, required: true, enum: ["Daily", "Weekly", "Monthly"] },
    availableQuantity: { type: Number, required: true, min: 0, default: 1 },
    condition: { type: String, default: "" },
    brand: { type: String, default: "" },
    model: { type: String, default: "" },
    imageURL: { type: String, required: true }, // Direct image link (as you requested)
    rentalTerms: { type: String, default: "" },
    
    // Approval status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    
    // Owner Info (BetterAuth string ID)
    ownerId: { type: String, required: true, index: true },
    ownerName: { type: String, required: true },
    ownerEmail: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Equipment", equipmentSchema);