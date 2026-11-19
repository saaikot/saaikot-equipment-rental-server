// routes/rental-favorite.routes.js
const express = require("express");
const { addFavorite, getMyFavorites, removeFavorite } = require("../controllers/rental-favorite.controller");
const { verifyToken, verifyRenter } = require("../middleware/auth.middleware");

const router = express.Router();

// All favorite routes require customer authentication
router.use(verifyToken, verifyRenter);

router.post("/", addFavorite);
router.get("/", getMyFavorites);
router.delete("/:equipmentId", removeFavorite);

module.exports = router;