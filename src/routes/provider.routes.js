const express = require("express");

const {
  becomeProvider,
  getProviderProfile,
  updateProviderProfile,
} = require("../controllers/provider.controller");

const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/become", protect, becomeProvider);

router.get("/me", protect, getProviderProfile);

router.put("/me", protect, updateProviderProfile);

module.exports = router;