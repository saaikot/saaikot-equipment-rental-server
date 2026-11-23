// controllers/rental-favorite.controller.js
const Favorite = require("../models/favorite.model");
const Equipment = require("../models/equipment.model");
const { isValidObjectId } = require("../utils/validators");

// 1. Add to favorites (idempotent)
const addFavorite = async (req, res, next) => {
  try {
    const { equipmentId } = req.body || {};
    if (!isValidObjectId(equipmentId)) {
      return res.status(400).json({ message: "A valid equipmentId is required" });
    }

    const equipment = await Equipment.findOne({
      _id: equipmentId,
      status: "approved",
    })
      .select("_id")
      .lean();
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    // upsert + the unique index makes concurrent requests safe.
    await Favorite.updateOne(
      { customerId: req.user.id, equipmentId: equipment._id },
      { $setOnInsert: { customerId: req.user.id, equipmentId: equipment._id } },
      { upsert: true }
    );

    return res.status(201).json({ message: "Added to favorites" });
  } catch (error) {
    // A duplicate key means another request won the race; treat it as success.
    if (error.code === 11000) {
      return res.json({ message: "Already in favorites" });
    }
    return next(error);
  }
};

// 2. Get my favorites
const getMyFavorites = async (req, res, next) => {
  try {
    const favorites = await Favorite.find({ customerId: req.user.id })
      .populate("equipmentId")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ favorites });
  } catch (error) {
    return next(error);
  }
};

// 3. Remove from favorites
const removeFavorite = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.equipmentId)) {
      return res.status(400).json({ message: "Invalid equipment id" });
    }

    await Favorite.deleteOne({
      customerId: req.user.id,
      equipmentId: req.params.equipmentId,
    });

    return res.json({ message: "Removed from favorites" });
  } catch (error) {
    return next(error);
  }
};

module.exports = { addFavorite, getMyFavorites, removeFavorite };
