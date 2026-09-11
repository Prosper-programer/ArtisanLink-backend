const express = require("express");

const {
  becomeProvider,
  getProviderProfile,
  updateProviderProfile,
  getAllProviders,
  getProviderById,
} = require("../controllers/provider.controller");
const { getProviderReviews } = require("../controllers/review.controller");

const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/", getAllProviders);
router.post("/become", protect, becomeProvider);
router.get("/me", protect, getProviderProfile);
router.put("/me", protect, updateProviderProfile);
router.get("/:id", getProviderById);
router.get("/:id/reviews", getProviderReviews);

module.exports = router;