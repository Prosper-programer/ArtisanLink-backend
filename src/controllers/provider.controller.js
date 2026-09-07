const User = require("../models/user");

const becomeProvider = async (req, res) => {
  try {
    const {
      profession,
      specializations,
      description,
      experienceYears,
    } = req.body;

    // Validate required fields
    if (!profession || !description || experienceYears === undefined) {
      return res.status(400).json({
        success: false,
        message: "Profession, description and experience are required",
      });
    }

    // Find the currently authenticated user
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if the user is already a provider
    if (user.providerProfile.isProvider) {
      return res.status(409).json({
        success: false,
        message: "You are already registered as a provider",
      });
    }

    // Update provider information
    user.providerProfile.profession = profession;
    user.providerProfile.specializations = specializations || [];
    user.providerProfile.description = description;
    user.providerProfile.experienceYears = experienceYears;
    user.providerProfile.isProvider = true;
    user.providerProfile.isVerified = false;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Provider profile created successfully",
      providerProfile: user.providerProfile,
    });
  } catch (error) {
    console.error("Become provider error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while creating provider profile",
    });
  }
};

const getProviderProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-password"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.providerProfile.isProvider) {
      return res.status(403).json({
        success: false,
        message: "You are not registered as a provider",
      });
    }

    return res.status(200).json({
      success: true,
      provider: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        providerProfile: user.providerProfile,
      },
    });
  } catch (error) {
    console.error("Get provider profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while getting provider profile",
    });
  }
};

const updateProviderProfile = async (req, res) => {
  try {
    const {
      profession,
      specializations,
      description,
      experienceYears,
    } = req.body;

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.providerProfile.isProvider) {
      return res.status(403).json({
        success: false,
        message: "You are not registered as a provider",
      });
    }

    // Update only the fields that were provided
    if (profession !== undefined) {
      user.providerProfile.profession = profession;
    }

    if (specializations !== undefined) {
      user.providerProfile.specializations = specializations;
    }

    if (description !== undefined) {
      user.providerProfile.description = description;
    }

    if (experienceYears !== undefined) {
      user.providerProfile.experienceYears = experienceYears;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Provider profile updated successfully",
      providerProfile: user.providerProfile,
    });
  } catch (error) {
    console.error("Update provider profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while updating provider profile",
    });
  }
};

module.exports = {
  becomeProvider,
  getProviderProfile,
  updateProviderProfile,
};