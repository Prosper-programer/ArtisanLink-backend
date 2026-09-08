const express = require("express");
const {
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notification.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.get("/", getNotifications);
router.get("/unread", getUnreadNotifications);
router.put("/read-all", markAllAsRead);
router.put("/:id/read", markAsRead);

module.exports = router;
