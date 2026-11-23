// routes/rental-analytics.routes.js
const express = require("express");
const { getAdminAnalytics, getOwnerAnalytics } = require("../controllers/rental-analytics.controller");
const { verifyToken, verifyAdmin, verifyOwner } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/admin", verifyToken, verifyAdmin, getAdminAnalytics);
router.get("/owner", verifyToken, verifyOwner, getOwnerAnalytics);

module.exports = router;
