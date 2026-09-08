const mongoose = require("mongoose");
const User = require("../models/user");
const { sendNotification } = require("../utils/notification.helper");

/**
 * Get all providers whose verification is pending.
 * GET /api/admin/providers/pending
 * Protected by JWT & Administrator role
 */
const getPendingProviders = async (req, res) => {
  try {
    const pendingProviders = await User.find({
      "providerProfile.isProvider": true,
      "providerProfile.verificationStatus": "pending",
    })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: pendingProviders.length,
      data: pendingProviders,
    });
  } catch (error) {
    console.error("Get pending providers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching pending providers",
    });
  }
};

/**
 * Approve and verify a provider profile.
 * PUT /api/admin/providers/:id/verify
 * Protected by JWT & Administrator role
 */
const verifyProvider = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID format",
      });
    }

    if (id === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "Administrators cannot verify their own profile",
      });
    }

    const provider = await User.findById(id);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    if (!provider.providerProfile || !provider.providerProfile.isProvider) {
      return res.status(400).json({
        success: false,
        message: "The specified user is not registered as a provider",
      });
    }

    provider.providerProfile.isVerified = true;
    provider.providerProfile.verificationStatus = "approved";
    provider.providerProfile.verificationReason = undefined;

    await provider.save();

    // Trigger notification to the provider
    await sendNotification({
      recipient: provider._id,
      type: "PROVIDER_VERIFIED",
      title: "Provider Profile Approved",
      message: "Congratulations! Your provider profile has been verified and approved by the administration.",
      relatedId: provider._id,
    });

    return res.status(200).json({
      success: true,
      message: "Provider verified and approved successfully",
      provider: {
        id: provider._id,
        fullName: provider.fullName,
        email: provider.email,
        providerProfile: provider.providerProfile,
      },
    });
  } catch (error) {
    console.error("Verify provider error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying provider",
    });
  }
};

/**
 * Reject a provider verification request with reason.
 * PUT /api/admin/providers/:id/reject
 * Protected by JWT & Administrator role
 */
const rejectProvider = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, verificationReason } = req.body;
    const finalReason = verificationReason || reason || "Profile did not meet required criteria";

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID format",
      });
    }

    const provider = await User.findById(id);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    if (!provider.providerProfile || !provider.providerProfile.isProvider) {
      return res.status(400).json({
        success: false,
        message: "The specified user is not registered as a provider",
      });
    }

    provider.providerProfile.isVerified = false;
    provider.providerProfile.verificationStatus = "rejected";
    provider.providerProfile.verificationReason = finalReason;

    await provider.save();

    // Trigger notification to the provider
    await sendNotification({
      recipient: provider._id,
      type: "PROVIDER_REJECTED",
      title: "Provider Verification Rejected",
      message: `Your provider verification request was rejected. Reason: ${finalReason}`,
      relatedId: provider._id,
    });

    return res.status(200).json({
      success: true,
      message: "Provider verification rejected successfully",
      provider: {
        id: provider._id,
        fullName: provider.fullName,
        email: provider.email,
        providerProfile: provider.providerProfile,
      },
    });
  } catch (error) {
    console.error("Reject provider error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while rejecting provider",
    });
  }
};

module.exports = {
  getPendingProviders,
  verifyProvider,
  rejectProvider,
};
