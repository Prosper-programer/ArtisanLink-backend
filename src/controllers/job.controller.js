const mongoose = require("mongoose");
const Job = require("../models/job");
const ServiceRequest = require("../models/serviceRequest");
const User = require("../models/user");
const { sendNotification } = require("../utils/notification.helper");

/**
 * Provider accepts a service request.
 * Creates a Job document and updates the request status to 'accepted'.
 * PUT /api/provider/requests/:id/accept
 * Protected by JWT (Approved & Verified Provider)
 */
const acceptRequest = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID format",
      });
    }

    // 1. Verify authenticated user is a registered provider
    const provider = await User.findById(req.user.userId);
    if (!provider || !provider.providerProfile || !provider.providerProfile.isProvider) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only service providers can accept service requests.",
      });
    }

    // 2. Find the service request
    const request = await ServiceRequest.findById(id).populate("service", "name");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    // 3. Verify that the user is not accepting their own request
    if (request.customer && request.customer.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot accept your own service request as a provider.",
      });
    }

    // 4. Verify that the request is assigned to this provider or is open/unassigned
    const isDirectlyAssigned =
      request.selectedProvider &&
      request.selectedProvider.toString() === req.user.userId;

    const isOpenUnassigned =
      !request.selectedProvider &&
      ["pending", "open"].includes(request.status);

    if (!isDirectlyAssigned && !isOpenUnassigned) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not the assigned provider for this request.",
      });
    }

    // Assign to provider if previously unassigned
    request.selectedProvider = provider._id;

    // 4. Verify request status allows acceptance
    if (request.status === "accepted" || request.status === "in_progress") {
      return res.status(400).json({
        success: false,
        message: "This service request has already been accepted",
      });
    }

    if (["completed", "cancelled"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot accept a ${request.status} service request`,
      });
    }

    // 5. Update request status
    request.status = "accepted";
    await request.save();

    // 6. Find or create the associated Job (avoid duplicates)
    let job = await Job.findOne({ serviceRequest: request._id });
    if (!job) {
      job = await Job.create({
        customer: request.customer,
        provider: provider._id,
        serviceRequest: request._id,
        status: "accepted",
      });
    } else {
      job.status = "accepted";
      await job.save();
    }

    // 7. Send notification to the customer
    await sendNotification({
      recipient: request.customer,
      type: "REQUEST_ACCEPTED",
      title: "Service Request Accepted",
      message: `${provider.fullName} has accepted your service request for ${request.service?.name || "service"}.`,
      relatedId: job._id,
    });

    const populatedJob = await Job.findById(job._id)
      .populate("customer", "fullName phoneNumber email")
      .populate("provider", "fullName phoneNumber email providerProfile")
      .populate("serviceRequest");

    return res.status(200).json({
      success: true,
      message: "Service request accepted and job created successfully",
      data: populatedJob,
    });
  } catch (error) {
    console.error("Accept request error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while accepting service request",
    });
  }
};

/**
 * Provider declines a service request.
 * PUT /api/provider/requests/:id/reject
 * Protected by JWT (Assigned Provider)
 */
const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID format",
      });
    }

    const request = await ServiceRequest.findById(id).populate("service", "name");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    if (
      !request.selectedProvider ||
      request.selectedProvider.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not the assigned provider for this request.",
      });
    }

    if (["accepted", "in_progress", "completed", "cancelled"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot reject a request that is already ${request.status}`,
      });
    }

    // Track rejecting provider
    if (!request.rejectedProviders) {
      request.rejectedProviders = [];
    }
    if (!request.rejectedProviders.includes(req.user.userId)) {
      request.rejectedProviders.push(req.user.userId);
    }

    const currentProvider = await User.findById(req.user.userId).select("fullName");

    // Search for next available provider with the same profession
    const professionQuery = request.serviceCategory || (request.service && request.service.name) || "";
    const nextProvider = await User.findOne({
      "providerProfile.isProvider": true,
      _id: { $nin: request.rejectedProviders },
      $or: [
        { "providerProfile.profession": new RegExp(professionQuery, "i") },
        { "providerProfile.specializations": new RegExp(professionQuery, "i") },
      ],
    }).select("fullName phoneNumber email providerProfile");

    if (nextProvider) {
      // Reassign to next provider
      request.selectedProvider = nextProvider._id;
      request.status = "pending";
      await request.save();

      // Notify next provider
      await sendNotification({
        recipient: nextProvider._id,
        type: "REQUEST_RECEIVED",
        title: "New Service Request Assigned",
        message: `You have received a reassigned service request for ${request.serviceName || request.service?.name || "service"}.`,
        relatedId: request._id,
      });

      // Notify customer
      await sendNotification({
        recipient: request.customer,
        type: "REQUEST_REASSIGNED",
        title: "Request Reassigned",
        message: `${currentProvider?.fullName || "Your selected artisan"} was unavailable. Your request has been automatically reassigned to ${nextProvider.fullName}.`,
        relatedId: request._id,
      });

      return res.status(200).json({
        success: true,
        message: `Request declined by provider. Automatically reassigned to ${nextProvider.fullName}.`,
        reassigned: true,
        data: request,
      });
    }

    // No alternative provider available
    request.status = "rejected";
    await request.save();

    // Notify customer of rejection
    await sendNotification({
      recipient: request.customer,
      type: "REQUEST_REJECTED",
      title: "Service Request Declined",
      message: `${currentProvider?.fullName || "The artisan"} was unable to accept your service request. No alternate artisan is currently available.`,
      relatedId: request._id,
    });

    return res.status(200).json({
      success: true,
      message: "Service request rejected. No alternate providers available.",
      reassigned: false,
      data: request,
    });
  } catch (error) {
    console.error("Reject request error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while rejecting service request",
    });
  }
};

/**
 * Provider starts a job.
 * PUT /api/jobs/:id/start
 * Protected by JWT (Assigned Provider)
 */
const startJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
      });
    }

    let job = await Job.findById(id);
    if (!job) {
      job = await Job.findOne({ serviceRequest: id });
    }

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.provider.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only the assigned provider can start this job.",
      });
    }

    if (job.status === "in_progress") {
      return res.status(400).json({
        success: false,
        message: "Job is already in progress",
      });
    }

    if (job.status === "completed" || job.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: `Cannot start a job that is already ${job.status}`,
      });
    }

    job.status = "in_progress";
    job.startedAt = new Date();
    await job.save();

    // Update associated service request
    await ServiceRequest.findByIdAndUpdate(job.serviceRequest, {
      status: "in_progress",
    });

    const provider = await User.findById(req.user.userId).select("fullName");

    // Notify customer
    await sendNotification({
      recipient: job.customer,
      type: "JOB_STARTED",
      title: "Job Started",
      message: `${provider?.fullName || "Your artisan"} has started working on the job.`,
      relatedId: job._id,
    });

    return res.status(200).json({
      success: true,
      message: "Job marked as in progress",
      data: job,
    });
  } catch (error) {
    console.error("Start job error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while starting job",
    });
  }
};

/**
 * Provider marks a job as completed.
 * PUT /api/jobs/:id/complete
 * Protected by JWT (Assigned Provider)
 */
const completeJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
      });
    }

    let job = await Job.findById(id);
    if (!job) {
      job = await Job.findOne({ serviceRequest: id });
    }

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    if (job.provider.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only the assigned provider can complete this job.",
      });
    }

    if (job.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Job is already marked as completed",
      });
    }

    if (job.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot complete a cancelled job",
      });
    }

    job.status = "completed";
    job.completedAt = new Date();
    await job.save();

    // Update associated service request
    await ServiceRequest.findByIdAndUpdate(job.serviceRequest, {
      status: "completed",
    });

    const provider = await User.findById(req.user.userId).select("fullName");

    // Notify customer that job is completed so they can review it
    await sendNotification({
      recipient: job.customer,
      type: "JOB_COMPLETED",
      title: "Job Completed",
      message: `${provider?.fullName || "Your artisan"} has completed your job. Please take a moment to leave a review!`,
      relatedId: job._id,
    });

    return res.status(200).json({
      success: true,
      message: "Job marked as completed successfully",
      data: job,
    });
  } catch (error) {
    console.error("Complete job error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while completing job",
    });
  }
};

/**
 * Get jobs for authenticated user (customer or provider).
 * GET /api/jobs
 * Protected by JWT
 */
const getJobs = async (req, res) => {
  try {
    const filter = {
      $or: [{ customer: req.user.userId }, { provider: req.user.userId }],
    };

    const jobs = await Job.find(filter)
      .populate("customer", "fullName phoneNumber email")
      .populate("provider", "fullName phoneNumber email providerProfile")
      .populate({
        path: "serviceRequest",
        populate: { path: "service", select: "name profession category image" },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: jobs.length,
      data: jobs,
    });
  } catch (error) {
    console.error("Get jobs error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching jobs",
    });
  }
};

/**
 * Get single job by ID.
 * GET /api/jobs/:id
 * Protected by JWT (Customer, Provider, or Admin)
 */
const getJobById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job ID format",
      });
    }

    const job = await Job.findById(id)
      .populate("customer", "fullName phoneNumber email")
      .populate("provider", "fullName phoneNumber email providerProfile")
      .populate({
        path: "serviceRequest",
        populate: { path: "service", select: "name profession category image" },
      });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    const isCustomer = job.customer._id.toString() === req.user.userId;
    const isProvider = job.provider._id.toString() === req.user.userId;
    const isAdmin = req.user.role === "administrator";

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not authorized to view this job.",
      });
    }

    return res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error("Get job by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching job",
    });
  }
};

module.exports = {
  acceptRequest,
  rejectRequest,
  startJob,
  completeJob,
  getJobs,
  getJobById,
};
