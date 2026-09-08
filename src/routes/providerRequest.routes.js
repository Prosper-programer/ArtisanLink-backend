const express = require("express");
const { getProviderRequests } = require("../controllers/serviceRequest.controller");
const { acceptRequest, rejectRequest } = require("../controllers/job.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.get("/", getProviderRequests);
router.put("/:id/accept", acceptRequest);
router.put("/:id/reject", rejectRequest);

module.exports = router;
