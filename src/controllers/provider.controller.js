const User = require("../models/user");
const {
  getAvailableProfessions,
  getCanonicalProfession,
  validateSpecializations,
} = require("../config/professions");

/**
 * Register the authenticated customer as a service provider.
 * POST /api/providers/become
 * Protected by JWT
 */
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
        message: "Profession, description, and experienceYears are required",
      });
    }

    // Validate that profession is in the allowed taxonomy
    const canonicalProfession = getCanonicalProfession(profession);
    if (!canonicalProfession) {
      return res.status(400).json({
        success: false,
        message: `Invalid profession: "${profession}". Available professions: ${getAvailableProfessions().join(", ")}`,
      });
    }

    // Validate specializations against allowed specializations for this profession
    const specValidation = validateSpecializations(canonicalProfession, specializations);
    if (!specValidation.valid) {
      return res.status(400).json({
        success: false,
        message: specValidation.message,
      });
    }

    if (typeof experienceYears !== "number" || experienceYears < 0) {
      return res.status(400).json({
        success: false,
        message: "experienceYears must be a non-negative number",
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

    // Safely handle users created without providerProfile subdocument
    if (!user.providerProfile) {
      user.providerProfile = {};
    }

    // Check if user is already a provider
    if (user.providerProfile.isProvider) {
      return res.status(409).json({
        success: false,
        message: "You are already registered as a provider",
      });
    }

    // Update provider information (keep role as customer to preserve customer capabilities)
    user.providerProfile.profession = canonicalProfession;
    user.providerProfile.specializations = specValidation.normalizedSpecializations;
    user.providerProfile.description = description.trim();
    user.providerProfile.experienceYears = Number(experienceYears);
    user.providerProfile.isProvider = true;
    user.providerProfile.isVerified = false;
    user.providerProfile.verificationStatus = "pending";
    user.providerProfile.verificationReason = undefined;
    user.providerProfile.rating = user.providerProfile.rating || 0;
    user.providerProfile.reviewCount = user.providerProfile.reviewCount || 0;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Provider profile created successfully. Verification is pending.",
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

/**
 * Get current authenticated provider's profile.
 * GET /api/providers/me
 * Protected by JWT
 */
const getProviderProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.providerProfile || !user.providerProfile.isProvider) {
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
        role: user.role,
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

/**
 * Update authenticated provider's profile.
 * PUT /api/providers/me
 * Protected by JWT
 */
const updateProviderProfile = async (req, res) => {
  try {
    const {
      profession,
      specializations,
      description,
      experienceYears,
      location,
    } = req.body;

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.providerProfile || !user.providerProfile.isProvider) {
      return res.status(403).json({
        success: false,
        message: "You are not registered as a provider",
      });
    }

    let activeProfession = user.providerProfile.profession;

    // Validate and update profession if provided
    if (profession !== undefined) {
      const canonicalProfession = getCanonicalProfession(profession);
      if (!canonicalProfession) {
        return res.status(400).json({
          success: false,
          message: `Invalid profession: "${profession}". Available professions: ${getAvailableProfessions().join(", ")}`,
        });
      }
      user.providerProfile.profession = canonicalProfession;
      activeProfession = canonicalProfession;
    }

    // Validate and update specializations if provided
    if (specializations !== undefined) {
      const specValidation = validateSpecializations(activeProfession, specializations);
      if (!specValidation.valid) {
        return res.status(400).json({
          success: false,
          message: specValidation.message,
        });
      }
      user.providerProfile.specializations = specValidation.normalizedSpecializations;
    }

    if (description !== undefined) {
      user.providerProfile.description = String(description).trim();
    }

    if (location !== undefined) {
      user.providerProfile.location = String(location).trim();
    }

    if (req.body.coverImage !== undefined) {
      user.providerProfile.coverImage = String(req.body.coverImage).trim();
    }

    if (experienceYears !== undefined) {
      if (typeof experienceYears !== "number" || experienceYears < 0) {
        return res.status(400).json({
          success: false,
          message: "experienceYears must be a non-negative number",
        });
      }
      user.providerProfile.experienceYears = Number(experienceYears);
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