// controllers/equipment.controller.js
const Equipment = require("../models/equipment.model");

// 1. Create Equipment (Owner Only)
const createEquipment = async (req, res) => {
  try {
    const { name, description, category, location, price, rentalType, availableQuantity, condition, brand, model, imageURL, rentalTerms } = req.body;

    if (!name || !description || !category || !location || !price || !rentalType || !imageURL) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const equipment = await Equipment.create({
      name, description, category, location, price, rentalType,
      availableQuantity: availableQuantity || 1, condition, brand, model, imageURL, rentalTerms,
      status: "pending", // New items require admin approval
      ownerId: req.user.id,
      ownerName: req.user.name,
      ownerEmail: req.user.email,
    });

    res.status(201).json({ message: "Equipment submitted for approval", equipment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 2. Get All Equipment (Public) - Handles Search, Filter, Sort (Challenge 1)
const getAllEquipment = async (req, res) => {
  try {
    const { search, category, rentalType, minPrice, maxPrice, availability, sort, page = 1, limit = 9 } = req.query;
    const filter = { status: "approved" }; // Only show approved items publicly

    // Search by name or location
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }
    if (category) filter.category = category;
    if (rentalType) filter.rentalType = rentalType;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (availability === "available") filter.availableQuantity = { $gt: 0 };
    if (availability === "unavailable") filter.availableQuantity = { $lte: 0 };

    // Sorting logic
    let sortOption = { createdAt: -1 }; // Default: Recently Added
    if (sort === "price-low") sortOption = { price: 1 };
    if (sort === "price-high") sortOption = { price: -1 };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Equipment.find(filter).sort(sortOption).skip(skip).limit(limitNum).lean(),
      Equipment.countDocuments(filter),
    ]);

    res.json({ items, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 3. Get Featured Equipment (Limit 6 for Home Page)
const getFeaturedEquipment = async (req, res) => {
  try {
    const items = await Equipment.find({ status: "approved" }).limit(6);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 4. Get Single Equipment (Requires Login)
const getSingleEquipment = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) return res.status(404).json({ message: "Equipment not found" });
    res.json({ equipment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 5. Get My Equipment (Owner Only)
const getMyEquipment = async (req, res) => {
  try {
    const items = await Equipment.find({ ownerId: req.user.id }).sort({ createdAt: -1 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 6. Update Equipment (Owner or Admin)
const updateEquipment = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) return res.status(404).json({ message: "Equipment not found" });
    if (equipment.ownerId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const allowed = ["name", "description", "category", "location", "price", "rentalType", "availableQuantity", "condition", "brand", "model", "imageURL", "rentalTerms"];
    allowed.forEach((k) => { if (req.body[k] !== undefined) equipment[k] = req.body[k]; });

    // Owner edits need re-approval; admin edits keep the current status.
    if (req.user.role !== "admin") {
      equipment.status = "pending";
    }
    await equipment.save();
    
    res.json({ message: "Equipment updated", equipment });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 7. Delete Equipment (Owner or Admin)
const deleteEquipment = async (req, res) => {
  try {
    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) return res.status(404).json({ message: "Equipment not found" });

    if (equipment.ownerId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to delete" });
    }

    await Equipment.findByIdAndDelete(req.params.id);
    res.json({ message: "Equipment deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 8. Admin: Get All Equipment (Regardless of Status)
const getAdminEquipment = async (req, res) => {
  try {
    const items = await Equipment.find().sort({ createdAt: -1 });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 9. Admin: Approve Equipment
const approveEquipment = async (req, res) => {
  try {
    const eq = await Equipment.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
    res.json({ message: "Approved", equipment: eq });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 10. Admin: Reject Equipment
const rejectEquipment = async (req, res) => {
  try {
    const eq = await Equipment.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
    res.json({ message: "Rejected", equipment: eq });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  createEquipment, getAllEquipment, getFeaturedEquipment, getSingleEquipment,
  getMyEquipment, updateEquipment, deleteEquipment,
  getAdminEquipment, approveEquipment, rejectEquipment,
};