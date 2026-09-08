const express = require("express");
const {
  getPendingProviders,
  verifyProvider,
  rejectProvider,
} = require("../controllers/admin.controller");
const protect = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");

const router = express.Router();

// Apply auth and admin middleware to all admin routes
router.use(protect, adminOnly);

router.get("/providers/pending", getPendingProviders);
router.put("/providers/:id/verify", verifyProvider);
router.put("/providers/:id/reject", rejectProvider);

module.exports = router;
