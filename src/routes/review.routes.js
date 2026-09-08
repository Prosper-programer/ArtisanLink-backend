const express = require("express");
const {
  createReview,
  getProviderReviews,
} = require("../controllers/review.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/", protect, createReview);
router.get("/provider/:id", getProviderReviews);

module.exports = router;
