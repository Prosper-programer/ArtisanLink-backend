const mongoose = require("mongoose");
const User = require("../models/user");
const Service = require("../models/service");
const ServiceRequest = require("../models/serviceRequest");
const Job = require("../models/job");
const Review = require("../models/review");
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

/**
 * Get aggregated platform statistics & recent activities.
 * GET /api/admin/stats
 * Protected by JWT & Administrator role
 */
const getAdminStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalCustomers,
      totalProviders,
      pendingVerifications,
      approvedProviders,
      rejectedProviders,
      totalServices,
      activeServices,
      totalRequests,
      activeRequests,
      completedJobs,
      totalReviews,
      providerRatingAgg,
      latestUsers,
      latestRequests,
      latestReviews,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ "providerProfile.isProvider": true }),
      User.countDocuments({
        "providerProfile.isProvider": true,
        "providerProfile.verificationStatus": "pending",
      }),
      User.countDocuments({
        "providerProfile.isProvider": true,
        "providerProfile.verificationStatus": "approved",
      }),
      User.countDocuments({
        "providerProfile.isProvider": true,
        "providerProfile.verificationStatus": "rejected",
      }),
      Service.countDocuments(),
      Service.countDocuments({ isActive: true }),
      ServiceRequest.countDocuments(),
      ServiceRequest.countDocuments({
        status: { $in: ["pending", "accepted", "in_progress"] },
      }),
      Job.countDocuments({ status: "completed" }),
      Review.countDocuments(),
      Review.aggregate([
        { $group: { _id: null, avgRating: { $avg: "$rating" } } },
      ]),
      // Recent activities source from real database records
      User.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .select("fullName email role providerProfile createdAt")
        .lean(),
      ServiceRequest.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("customer", "fullName")
        .populate("service", "name")
        .lean(),
      Review.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .populate("customer", "fullName")
        .populate("provider", "fullName")
        .lean(),
    ]);

    const averageRating =
      providerRatingAgg.length > 0 && providerRatingAgg[0].avgRating
        ? Math.round(providerRatingAgg[0].avgRating * 10) / 10
        : 0;

    // Combine real database records into recent activity items
    const activities = [];

    latestUsers.forEach((u) => {
      if (u.providerProfile?.isProvider) {
        activities.push({
          id: `u-${u._id}`,
          type: "provider_registered",
          title: "Provider Application",
          description: `${u.fullName} applied for ${u.providerProfile.profession || "Artisan"}`,
          status: u.providerProfile.verificationStatus,
          timestamp: u.createdAt,
        });
      } else {
        activities.push({
          id: `u-${u._id}`,
          type: "user_registered",
          title: "New User Registered",
          description: `${u.fullName} joined ArtisanLink`,
          status: u.role,
          timestamp: u.createdAt,
        });
      }
    });

    latestRequests.forEach((r) => {
      activities.push({
        id: `r-${r._id}`,
        type: "service_request",
        title: "Service Request",
        description: `${r.customer?.fullName || "Customer"} requested ${r.service?.name || "Service"}`,
        status: r.status,
        timestamp: r.createdAt,
      });
    });

    latestReviews.forEach((rev) => {
      activities.push({
        id: `rev-${rev._id}`,
        type: "review",
        title: "New Review",
        description: `${rev.customer?.fullName || "Customer"} rated ${rev.provider?.fullName || "Artisan"} ${rev.rating}★`,
        status: `${rev.rating} stars`,
        timestamp: rev.createdAt,
      });
    });

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalCustomers,
          totalProviders,
          pendingVerifications,
          approvedProviders,
          rejectedProviders,
          totalServices,
          activeServices,
          totalRequests,
          activeRequests,
          completedJobs,
          totalReviews,
          averageRating,
          reportedIssues: 0,
        },
        recentActivities: activities.slice(0, 10),
      },
    });
  } catch (error) {
    console.error("Get admin stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching admin stats",
    });
  }
};

/**
 * Get paginated users for admin management.
 * GET /api/admin/users
 * Protected by JWT & Administrator role
 */
const getAdminUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (role && role !== "all") {
      if (role === "provider") {
        query["providerProfile.isProvider"] = true;
      } else {
        query.role = role;
      }
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
      ];
    }

    const pageSize = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page, 10) || 1,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Get admin users error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

/**
 * Get paginated providers for admin management.
 * GET /api/admin/providers
 * Protected by JWT & Administrator role
 */
const getAdminProviders = async (req, res) => {
  try {
    const { verificationStatus, profession, location, search, page = 1, limit = 20 } = req.query;
    const query = {
      "providerProfile.isProvider": true,
    };

    if (verificationStatus && verificationStatus !== "all") {
      query["providerProfile.verificationStatus"] = verificationStatus;
    }

    if (profession && profession !== "all") {
      query["providerProfile.profession"] = new RegExp(profession, "i");
    }

    if (location && location.trim()) {
      query["providerProfile.location"] = new RegExp(location.trim(), "i");
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phoneNumber: searchRegex },
        { "providerProfile.profession": searchRegex },
        { "providerProfile.specializations": searchRegex },
        { "providerProfile.description": searchRegex },
      ];
    }

    const pageSize = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const [providers, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      User.countDocuments(query),
    ]);

    // Attach completed jobs count for each provider
    const providerIds = providers.map((p) => p._id);
    const jobCounts = await Job.aggregate([
      { $match: { provider: { $in: providerIds }, status: "completed" } },
      { $group: { _id: "$provider", count: { $sum: 1 } } },
    ]);

    const jobCountMap = {};
    jobCounts.forEach((jc) => {
      jobCountMap[jc._id.toString()] = jc.count;
    });

    const enriched = providers.map((p) => ({
      ...p,
      completedJobsCount: jobCountMap[p._id.toString()] || 0,
    }));

    return res.status(200).json({
      success: true,
      data: enriched,
      pagination: {
        total,
        page: parseInt(page, 10) || 1,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Get admin providers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching providers",
    });
  }
};

/**
 * Get paginated service requests for admin monitoring.
 * GET /api/admin/requests
 * Protected by JWT & Administrator role
 */
const getAdminRequests = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { "location.address": searchRegex },
        { description: searchRegex },
      ];
    }

    const pageSize = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const [requests, total] = await Promise.all([
      ServiceRequest.find(query)
        .populate("customer", "fullName email phoneNumber")
        .populate("service", "name profession category image")
        .populate("selectedProvider", "fullName email phoneNumber providerProfile")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      ServiceRequest.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page, 10) || 1,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Get admin requests error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching requests",
    });
  }
};

/**
 * Get paginated reviews for admin monitoring.
 * GET /api/admin/reviews
 * Protected by JWT & Administrator role
 */
const getAdminReviews = async (req, res) => {
  try {
    const { rating, page = 1, limit = 20 } = req.query;
    const query = {};

    if (rating && rating !== "all") {
      query.rating = Number(rating);
    }

    const pageSize = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * pageSize;

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate("customer", "fullName email")
        .populate("provider", "fullName email providerProfile")
        .populate("job")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Review.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        total,
        page: parseInt(page, 10) || 1,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Get admin reviews error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching reviews",
    });
  }
};

module.exports = {
  getPendingProviders,
  verifyProvider,
  rejectProvider,
  getAdminStats,
  getAdminUsers,
  getAdminProviders,
  getAdminRequests,
  getAdminReviews,
};
