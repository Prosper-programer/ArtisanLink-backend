const express = require("express");
const {
  createOrGetConversation,
  getUserConversations,
  getConversationById,
  sendMessage,
  getConversationMessages,
  markMessageRead,
} = require("../controllers/message.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.use(protect);

router.post("/", createOrGetConversation);
router.get("/", getUserConversations);
router.get("/:id", getConversationById);
router.post("/:id/messages", sendMessage);
router.get("/:id/messages", getConversationMessages);
router.put("/messages/:id/read", markMessageRead);

module.exports = router;
