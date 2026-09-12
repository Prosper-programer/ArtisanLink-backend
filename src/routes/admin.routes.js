const express = require("express");
const {
  getPendingProviders,
  verifyProvider,
  rejectProvider,
  getAdminStats,
  getAdminUsers,
  getAdminProviders,
  getAdminRequests,
  getAdminReviews,
} = require("../controllers/admin.controller");
const protect = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");

const router = express.Router();

// Apply auth and admin middleware to all admin routes
router.use(protect, adminOnly);

// Platform stats
router.get("/stats", getAdminStats);

// Users management
router.get("/users", getAdminUsers);

// Providers management
router.get("/providers", getAdminProviders);
router.get("/providers/pending", getPendingProviders);
router.put("/providers/:id/verify", verifyProvider);
router.put("/providers/:id/reject", rejectProvider);

// Service requests monitoring
router.get("/requests", getAdminRequests);

// Reviews monitoring
router.get("/reviews", getAdminReviews);

module.exports = router;

