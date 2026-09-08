const mongoose = require("mongoose");
const Review = require("../models/review");
const Job = require("../models/job");
const User = require("../models/user");
const { sendNotification } = require("../utils/notification.helper");

/**
 * Customer creates a review for a completed job.
 * POST /api/reviews
 * Protected by JWT (Customer)
 */
const createReview = async (req, res) => {
  try {
    const { jobId, rating, comment } = req.body;

    // Validate inputs
    if (!jobId || rating === undefined || !comment) {
      return res.status(400).json({
        success: false,
        message: "jobId, rating, and comment are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
      });
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5",
      });
    }

    if (typeof comment !== "string" || comment.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Comment must be at least 2 characters long",
      });
    }

    // Verify job
    const job = await Job.findById(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    // Verify customer owns the job
    if (job.customer.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only review your own jobs.",
      });
    }

    // Verify job is completed
    if (job.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Reviews can only be submitted for completed jobs",
      });
    }

    // Check for duplicate review
    const existingReview = await Review.findOne({ job: jobId });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this job",
      });
    }

    // Create review
    const review = await Review.create({
      customer: req.user.userId,
      provider: job.provider,
      job: job._id,
      rating: Math.round(numRating),
      comment: comment.trim(),
    });

    // Recalculate provider's average rating and review count
    const stats = await Review.aggregate([
      { $match: { provider: job.provider } },
      {
        $group: {
          _id: "$provider",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    if (stats.length > 0) {
      const avgRating = Math.round(stats[0].avgRating * 10) / 10;
      const count = stats[0].count;

      await User.findByIdAndUpdate(job.provider, {
        "providerProfile.rating": avgRating,
        "providerProfile.reviewCount": count,
      });
    }

    // Send notification to provider
    const customer = await User.findById(req.user.userId).select("fullName");
    await sendNotification({
      recipient: job.provider,
      type: "NEW_REVIEW",
      title: "New Review Received",
      message: `${customer?.fullName || "A customer"} left you a ${Math.round(numRating)}-star review: "${comment.trim().slice(0, 60)}"`,
      relatedId: review._id,
    });

    const populatedReview = await Review.findById(review._id)
      .populate("customer", "fullName email")
      .populate("provider", "fullName email providerProfile");

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: populatedReview,
    });
  } catch (error) {
    console.error("Create review error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating review",
    });
  }
};

/**
 * Get all reviews for a specific provider.
 * GET /api/providers/:id/reviews or GET /api/reviews/provider/:id
 * Public or Authenticated
 */
const getProviderReviews = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid provider ID format",
      });
    }

    const provider = await User.findById(id).select("fullName providerProfile");

    if (!provider || !provider.providerProfile?.isProvider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found",
      });
    }

    const reviews = await Review.find({ provider: id })
      .populate("customer", "fullName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      provider: {
        id: provider._id,
        fullName: provider.fullName,
        rating: provider.providerProfile.rating || 0,
        reviewCount: provider.providerProfile.reviewCount || 0,
      },
      count: reviews.length,
      data: reviews,
    });
  } catch (error) {
    console.error("Get provider reviews error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching provider reviews",
    });
  }
};

module.exports = {
  createReview,
  getProviderReviews,
};
