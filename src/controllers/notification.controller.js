const mongoose = require("mongoose");
const Notification = require("../models/notification");

/**
 * Get all notifications for authenticated user.
 * GET /api/notifications
 * Protected by JWT
 */
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.userId,
    }).sort({ createdAt: -1 });

    const unreadCount = await Notification.countDocuments({
      recipient: req.user.userId,
      read: false,
    });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching notifications",
    });
  }
};

/**
 * Get only unread notifications for authenticated user.
 * GET /api/notifications/unread
 * Protected by JWT
 */
const getUnreadNotifications = async (req, res) => {
  try {
    const unreadNotifications = await Notification.find({
      recipient: req.user.userId,
      read: false,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: unreadNotifications.length,
      data: unreadNotifications,
    });
  } catch (error) {
    console.error("Get unread notifications error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching unread notifications",
    });
  }
};

/**
 * Mark a specific notification as read.
 * PUT /api/notifications/:id/read
 * Protected by JWT
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format",
      });
    }

    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    if (notification.recipient.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not the recipient of this notification.",
      });
    }

    notification.read = true;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating notification",
    });
  }
};

/**
 * Mark all unread notifications as read for the authenticated user.
 * PUT /api/notifications/read-all
 * Protected by JWT
 */
const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipient: req.user.userId,
        read: false,
      },
      {
        $set: { read: true },
      }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while marking all notifications read",
    });
  }
};

module.exports = {
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
};
