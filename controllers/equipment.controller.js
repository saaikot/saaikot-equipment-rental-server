// controllers/equipment.controller.js
const Booking = require("../models/booking.model");
const Equipment = require("../models/equipment.model");
const Favorite = require("../models/favorite.model");
const {
  EQUIPMENT_CATEGORIES,
  RENTAL_TYPES,
  ACTIVE_BOOKING_STATUSES,
} = require("../utils/constants");
const {
  cleanString,
  isValidObjectId,
  toFiniteNumber,
  toInteger,
  escapeRegex,
  parsePagination,
} = require("../utils/validators");

// Fields that change what the public sees. An owner edit to any of these sends
// the listing back to the admin approval queue; stock-only edits do not.
const CONTENT_FIELDS = [
  "name",
  "description",
  "category",
  "location",
  "price",
  "rentalType",
  "condition",
  "brand",
  "model",
  "imageURL",
  "rentalTerms",
];

const validateEquipmentBody = (body, { partial = false } = {}) => {
  const errors = [];
  const data = {};

  const stringField = (key, maxLength, { required = false } = {}) => {
    if (body[key] === undefined) {
      if (required && !partial) errors.push(`${key} is required`);
      return;
    }
    const value = cleanString(body[key], maxLength);
    if (required && !value) errors.push(`${key} is required`);
    data[key] = value;
  };

  stringField("name", 120, { required: true });
  stringField("description", 5000, { required: true });
  stringField("location", 200, { required: true });
  stringField("imageURL", 2000, { required: true });
  stringField("condition", 100);
  stringField("brand", 100);
  stringField("model", 100);
  stringField("rentalTerms", 2000);

  if (body.category !== undefined) {
    const category = cleanString(body.category, 100);
    if (!EQUIPMENT_CATEGORIES.includes(category)) {
      errors.push(`category must be one of: ${EQUIPMENT_CATEGORIES.join(", ")}`);
    }
    data.category = category;
  } else if (!partial) {
    errors.push("category is required");
  }

  if (body.rentalType !== undefined) {
    const rentalType = cleanString(body.rentalType, 20);
    if (!RENTAL_TYPES.includes(rentalType)) {
      errors.push(`rentalType must be one of: ${RENTAL_TYPES.join(", ")}`);
    }
    data.rentalType = rentalType;
  } else if (!partial) {
    errors.push("rentalType is required");
  }

  if (body.price !== undefined) {
    const price = toFiniteNumber(body.price);
    if (price === null || price < 0) {
      errors.push("price must be a non-negative number");
    } else {
      data.price = price;
    }
  } else if (!partial) {
    errors.push("price is required");
  }

  if (body.availableQuantity !== undefined) {
    const quantity = toInteger(body.availableQuantity);
    if (quantity === null || quantity < 0) {
      errors.push("availableQuantity must be a non-negative integer");
    } else {
      data.availableQuantity = quantity;
    }
  } else if (!partial) {
    data.availableQuantity = 1;
  }

  return { errors, data };
};

// 1. Create Equipment (Owner only)
const createEquipment = async (req, res, next) => {
  try {
    const { errors, data } = validateEquipmentBody(req.body || {});
    if (errors.length) {
      return res.status(400).json({ message: errors.join(", ") });
    }

    const equipment = await Equipment.create({
      ...data,
      status: "pending", // New items require admin approval
      ownerId: req.user.id,
      ownerName: req.user.name,
      ownerEmail: req.user.email,
    });

    return res.status(201).json({ message: "Equipment submitted for approval", equipment });
  } catch (error) {
    return next(error);
  }
};

// 2. Get All Equipment (Public) - search, filter, sort, pagination
const getAllEquipment = async (req, res, next) => {
  try {
    const { search, category, rentalType, minPrice, maxPrice, availability, sort } = req.query;
    const filter = { status: "approved" };

    const searchTerm = cleanString(search, 100);
    if (searchTerm) {
      const safePattern = escapeRegex(searchTerm);
      filter.$or = [
        { name: { $regex: safePattern, $options: "i" } },
        { location: { $regex: safePattern, $options: "i" } },
      ];
    }

    if (category !== undefined) {
      if (!EQUIPMENT_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: "Invalid category filter" });
      }
      filter.category = category;
    }

    if (rentalType !== undefined) {
      if (!RENTAL_TYPES.includes(rentalType)) {
        return res.status(400).json({ message: "Invalid rentalType filter" });
      }
      filter.rentalType = rentalType;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const min = minPrice === undefined ? null : toFiniteNumber(minPrice);
      const max = maxPrice === undefined ? null : toFiniteNumber(maxPrice);
      if ((min !== null && min < 0) || (max !== null && max < 0)) {
        return res.status(400).json({ message: "Price filters must be positive numbers" });
      }
      if (min !== null && max !== null && min > max) {
        return res.status(400).json({ message: "minPrice cannot be greater than maxPrice" });
      }
      filter.price = {};
      if (min !== null) filter.price.$gte = min;
      if (max !== null) filter.price.$lte = max;
    }

    if (availability !== undefined) {
      if (availability === "available") {
        filter.availableQuantity = { $gt: 0 };
      } else if (availability === "unavailable") {
        filter.availableQuantity = { $lte: 0 };
      } else {
        return res.status(400).json({ message: "Invalid availability filter" });
      }
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      "price-low": { price: 1 },
      "price-high": { price: -1 },
    };
    const sortKey = sort === undefined ? "newest" : String(sort);
    if (!sortOptions[sortKey]) {
      return res.status(400).json({ message: "Invalid sort option" });
    }

    const { page, limit } = parsePagination(req.query.page, req.query.limit, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Equipment.find(filter).sort(sortOptions[sortKey]).skip(skip).limit(limit).lean(),
      Equipment.countDocuments(filter),
    ]);

    // Public catalogue data can be cached briefly at the edge.
    res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");

    return res.json({ items, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return next(error);
  }
};

// 3. Get Featured Equipment (limit 6 for the home page)
const getFeaturedEquipment = async (req, res, next) => {
  try {
    const items = await Equipment.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
};

// 4. Get Single Equipment (requires login)
const getSingleEquipment = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid equipment id" });
    }

    const equipment = await Equipment.findById(req.params.id).lean();
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    // Pending/rejected listings are only visible to their owner and admins.
    const isOwner = equipment.ownerId === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (equipment.status !== "approved" && !isOwner && !isAdmin) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    return res.json({ equipment });
  } catch (error) {
    return next(error);
  }
};

// 5. Get My Equipment (Owner only)
const getMyEquipment = async (req, res, next) => {
  try {
    const items = await Equipment.find({ ownerId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
};

// 6. Update Equipment (owner or admin)
const updateEquipment = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid equipment id" });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    const isAdmin = req.user.role === "admin";
    if (equipment.ownerId !== req.user.id && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to edit this equipment" });
    }

    const { errors, data } = validateEquipmentBody(req.body || {}, { partial: true });
    if (errors.length) {
      return res.status(400).json({ message: errors.join(", ") });
    }

    const keys = Object.keys(data);
    if (!keys.length) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    for (const key of keys) {
      equipment[key] = data[key];
    }

    // Owner content edits need re-approval; stock-only edits keep the status.
    if (!isAdmin && keys.some((key) => CONTENT_FIELDS.includes(key))) {
      equipment.status = "pending";
    }

    await equipment.save();
    return res.json({ message: "Equipment updated", equipment });
  } catch (error) {
    return next(error);
  }
};

// 7. Delete Equipment (owner or admin)
const deleteEquipment = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid equipment id" });
    }

    const equipment = await Equipment.findById(req.params.id);
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    const isAdmin = req.user.role === "admin";
    if (equipment.ownerId !== req.user.id && !isAdmin) {
      return res.status(403).json({ message: "Not authorized to delete this equipment" });
    }

    // Deleting an item with live rentals would strand customers/owners.
    const activeBookings = await Booking.countDocuments({
      equipmentId: equipment._id,
      bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
    });
    if (activeBookings > 0) {
      return res.status(409).json({
        message: "Cannot delete equipment with pending or confirmed rentals",
      });
    }

    await Promise.all([
      Equipment.deleteOne({ _id: equipment._id }),
      Favorite.deleteMany({ equipmentId: equipment._id }),
    ]);

    return res.json({ message: "Equipment deleted" });
  } catch (error) {
    return next(error);
  }
};

// 8. Admin: get all equipment regardless of status
const getAdminEquipment = async (req, res, next) => {
  try {
    const items = await Equipment.find().sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
};

// 9. Admin: approve equipment
const approveEquipment = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid equipment id" });
    }

    const equipment = await Equipment.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { returnDocument: "after", runValidators: true }
    );
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    return res.json({ message: "Equipment approved", equipment });
  } catch (error) {
    return next(error);
  }
};

// 10. Admin: reject equipment
const rejectEquipment = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid equipment id" });
    }

    const equipment = await Equipment.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { returnDocument: "after", runValidators: true }
    );
    if (!equipment) {
      return res.status(404).json({ message: "Equipment not found" });
    }

    return res.json({ message: "Equipment rejected", equipment });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createEquipment,
  getAllEquipment,
  getFeaturedEquipment,
  getSingleEquipment,
  getMyEquipment,
  updateEquipment,
  deleteEquipment,
  getAdminEquipment,
  approveEquipment,
  rejectEquipment,
};
