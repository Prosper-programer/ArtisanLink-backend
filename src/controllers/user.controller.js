const User = require("../models/user");

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get current user error:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { fullName, phoneNumber, avatar } = req.body;
    const updateData = {};

    if (fullName && fullName.trim()) {
      updateData.fullName = fullName.trim();
    }
    if (phoneNumber && phoneNumber.trim()) {
      updateData.phoneNumber = phoneNumber.trim();
    }
    if (avatar !== undefined) {
      updateData.avatar = avatar;
      updateData["providerProfile.coverImage"] = avatar;
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while updating profile",
    });
  }
};

module.exports = {
  getCurrentUser,
  updateProfile,
};