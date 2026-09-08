const Notification = require("../models/notification");

/**
 * Creates and saves an in-app notification.
 * Does not throw to avoid crashing primary business flows if notification fails.
 *
 * @param {Object} options
 * @param {string|mongoose.Types.ObjectId} options.recipient - Target User ID
 * @param {string} options.type - One of the Notification model enum values
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification message body
 * @param {string|mongoose.Types.ObjectId} [options.relatedId] - Optional linked document ID
 */
const sendNotification = async ({ recipient, type, title, message, relatedId }) => {
  try {
    if (!recipient || !type || !title || !message) {
      console.warn("sendNotification: missing required fields", { recipient, type, title });
      return null;
    }

    const notification = await Notification.create({
      recipient,
      type,
      title,
      message,
      relatedId: relatedId || null,
      read: false,
    });

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error.message);
    return null;
  }
};

module.exports = {
  sendNotification,
};
