const express = require("express");
const { getCurrentUser, updateProfile } = require("../controllers/user.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/me", protect, getCurrentUser);
router.put("/profile", protect, updateProfile);

module.exports = router;