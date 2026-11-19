// controllers/rental-favorite.controller.js
const Favorite = require("../models/favorite.model");
const Equipment = require("../models/equipment.model");

// 1. Add to Favorites
const addFavorite = async (req, res) => {
  try {
    const { equipmentId } = req.body;
    if (!equipmentId) return res.status(400).json({ message: "equipmentId required" });

    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) return res.status(404).json({ message: "Equipment not found" });

    const existing = await Favorite.findOne({ customerId: req.user.id, equipmentId });
    if (existing) return res.json({ message: "Already in favorites" });

    await Favorite.create({ customerId: req.user.id, equipmentId });
    res.status(201).json({ message: "Added to favorites" });
  } catch (err) {
    if (err.code === 11000) return res.json({ message: "Already in favorites" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 2. Get My Favorites
const getMyFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({ customerId: req.user.id })
      .populate("equipmentId")
      .sort({ createdAt: -1 });
    res.json({ favorites });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 3. Remove from Favorites
const removeFavorite = async (req, res) => {
  try {
    await Favorite.findOneAndDelete({
      customerId: req.user.id,
      equipmentId: req.params.equipmentId,
    });
    res.json({ message: "Removed from favorites" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { addFavorite, getMyFavorites, removeFavorite };