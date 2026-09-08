const express = require("express");
const {
  getJobs,
  getJobById,
  startJob,
  completeJob,
} = require("../controllers/job.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.get("/", getJobs);
router.get("/:id", getJobById);
router.put("/:id/start", startJob);
router.put("/:id/complete", completeJob);

module.exports = router;
