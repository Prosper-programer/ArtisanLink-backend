const express = require("express");
const {
  createRequest,
  getCustomerRequests,
  getRequestById,
  getSuitableProviders,
  selectProvider,
  cancelRequest,
} = require("../controllers/serviceRequest.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.post("/", createRequest);
router.get("/", getCustomerRequests);
router.get("/:id", getRequestById);
router.get("/:id/suitable-providers", getSuitableProviders);
router.put("/:id/select-provider", selectProvider);
router.put("/:id/cancel", cancelRequest);

module.exports = router;
