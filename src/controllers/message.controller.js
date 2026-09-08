const mongoose = require("mongoose");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const User = require("../models/user");
const { sendNotification } = require("../utils/notification.helper");

/**
 * Create or retrieve an existing conversation between authenticated user and recipient.
 * POST /api/conversations
 * Protected by JWT
 */
const createOrGetConversation = async (req, res) => {
  try {
    const { recipientId, serviceRequestId, jobId } = req.body;

    if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({
        success: false,
        message: "Valid recipientId is required",
      });
    }

    if (recipientId === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create a conversation with yourself",
      });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Recipient user not found",
      });
    }

    // Check if conversation between these two already exists
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user.userId, recipientId], $size: 2 },
    })
      .populate("participants", "fullName phoneNumber email providerProfile")
      .populate("lastMessage");

    if (!conversation) {
      const newConvData = {
        participants: [req.user.userId, recipientId],
      };
      if (serviceRequestId && mongoose.Types.ObjectId.isValid(serviceRequestId)) {
        newConvData.serviceRequest = serviceRequestId;
      }
      if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
        newConvData.job = jobId;
      }

      const createdConv = await Conversation.create(newConvData);
      conversation = await Conversation.findById(createdConv._id).populate(
        "participants",
        "fullName phoneNumber email providerProfile"
      );
    }

    return res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error("Create or get conversation error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while starting conversation",
    });
  }
};

/**
 * Get all conversations for the authenticated user.
 * GET /api/conversations
 * Protected by JWT
 */
const getUserConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.userId,
    })
      .populate("participants", "fullName phoneNumber email providerProfile")
      .populate("lastMessage")
      .populate("serviceRequest", "description status")
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (error) {
    console.error("Get user conversations error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching conversations",
    });
  }
};

/**
 * Get conversation details by ID.
 * GET /api/conversations/:id
 * Protected by JWT (Participant only)
 */
const getConversationById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format",
      });
    }

    const conversation = await Conversation.findById(id)
      .populate("participants", "fullName phoneNumber email providerProfile")
      .populate("lastMessage");

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === req.user.userId
    );

    if (!isParticipant && req.user.role !== "administrator") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a participant in this conversation.",
      });
    }

    return res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    console.error("Get conversation by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching conversation",
    });
  }
};

/**
 * Send a message within a conversation.
 * POST /api/conversations/:id/messages
 * Protected by JWT (Participant only)
 */
const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Message content cannot be empty",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format",
      });
    }

    const conversation = await Conversation.findById(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user.userId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a participant in this conversation.",
      });
    }

    // Identify recipient
    const recipientId = conversation.participants.find(
      (p) => p.toString() !== req.user.userId
    );

    // Create message
    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user.userId,
      content: content.trim(),
      read: false,
    });

    // Update conversation metadata
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    const senderUser = await User.findById(req.user.userId).select("fullName");

    // Trigger notification to recipient
    if (recipientId) {
      await sendNotification({
        recipient: recipientId,
        type: "NEW_MESSAGE",
        title: `Message from ${senderUser?.fullName || "User"}`,
        message: content.trim().length > 80 ? `${content.trim().slice(0, 77)}...` : content.trim(),
        relatedId: conversation._id,
      });
    }

    const populatedMessage = await Message.findById(message._id).populate(
      "sender",
      "fullName email"
    );

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while sending message",
    });
  }
};

/**
 * Get all messages for a conversation.
 * GET /api/conversations/:id/messages
 * Protected by JWT (Participant only)
 */
const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format",
      });
    }

    const conversation = await Conversation.findById(id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user.userId
    );

    if (!isParticipant && req.user.role !== "administrator") {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not a participant in this conversation.",
      });
    }

    const messages = await Message.find({ conversation: id })
      .populate("sender", "fullName email")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    console.error("Get conversation messages error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching messages",
    });
  }
};

/**
 * Mark a message as read.
 * PUT /api/conversations/messages/:id/read
 * Protected by JWT (Receiver only)
 */
const markMessageRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID format",
      });
    }

    const message = await Message.findById(id).populate("conversation");

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Sender cannot mark their own message as read
    if (message.sender.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "Sender cannot mark their own message as read",
      });
    }

    // Verify current user is a participant in this message's conversation
    const isParticipant = message.conversation?.participants.some(
      (p) => p.toString() === req.user.userId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not the recipient of this message.",
      });
    }

    message.read = true;
    await message.save();

    return res.status(200).json({
      success: true,
      message: "Message marked as read",
      data: message,
    });
  } catch (error) {
    console.error("Mark message read error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating message status",
    });
  }
};

module.exports = {
  createOrGetConversation,
  getUserConversations,
  getConversationById,
  sendMessage,
  getConversationMessages,
  markMessageRead,
};
