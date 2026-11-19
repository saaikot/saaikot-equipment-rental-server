// routes/user.routes.js
const express = require("express");
const router = express.Router();

// Placeholder route for testing
router.get("/test", (req, res) => res.json({ message: "User route works" }));

module.exports = router;