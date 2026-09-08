const mongoose = require("mongoose");
const ServiceRequest = require("../models/serviceRequest");
const Service = require("../models/service");
const User = require("../models/user");
const { sendNotification } = require("../utils/notification.helper");
const { geocodeAddress } = require("../services/geoapify.service");

/**
 * Helper to normalize GeoJSON location, with Geoapify geocoding fallback
 */
const parseLocation = async (location) => {
  if (!location) return null;

  let coordinates = null;
  let address = "";

  if (typeof location === "string") {
    address = location.trim();
  } else {
    address = location.address || location.formatted || "";
    if (Array.isArray(location.coordinates) && location.coordinates.length === 2) {
      coordinates = [Number(location.coordinates[0]), Number(location.coordinates[1])];
    } else if (location.longitude !== undefined && location.latitude !== undefined) {
      coordinates = [Number(location.longitude), Number(location.latitude)];
    } else if (location.lon !== undefined && location.lat !== undefined) {
      coordinates = [Number(location.lon), Number(location.lat)];
    }
  }

  // If coordinates are not provided, resolve automatically via Geoapify
  if ((!coordinates || isNaN(coordinates[0]) || isNaN(coordinates[1])) && address) {
    const geoResult = await geocodeAddress(address);
    if (geoResult && geoResult.coordinates) {
      coordinates = geoResult.coordinates;
      if (!address || address.length < 5) address = geoResult.formatted;
    }
  }

  if (!coordinates || isNaN(coordinates[0]) || isNaN(coordinates[1])) {
    return null;
  }

  return {
    type: "Point",
    coordinates,
    address: address.trim(),
  };
};

/**
 * Customer creates a new service request.
 * POST /api/requests
 * Protected by JWT (Customer)
 */
const createRequest = async (req, res) => {
  try {
    const {
      service: serviceId,
      description,
      location,
      preferredDate,
      preferredTime,
      photos,
    } = req.body;

    if (!serviceId || !description || !location) {
      return res.status(400).json({
        success: false,
        message: "service, description, and location are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID format",
      });
    }

    // Verify service exists and is active
    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      return res.status(404).json({
        success: false,
        message: "Service not found or is currently inactive",
      });
    }

    const parsedLocation = await parseLocation(location);
    if (!parsedLocation || !parsedLocation.address) {
      return res.status(400).json({
        success: false,
        message: "Valid location coordinates [longitude, latitude] and address are required",
      });
    }

    const serviceRequest = await ServiceRequest.create({
      customer: req.user.userId,
      service: service._id,
      description: description.trim(),
      location: parsedLocation,
      preferredDate: preferredDate ? new Date(preferredDate) : undefined,
      preferredTime: preferredTime ? preferredTime.trim() : undefined,
      photos: Array.isArray(photos) ? photos : [],
      status: "pending",
    });

    const populatedRequest = await ServiceRequest.findById(serviceRequest._id)
      .populate("service", "name profession category image")
      .populate("customer", "fullName phoneNumber email");

    return res.status(201).json({
      success: true,
      message: "Service request created successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Create service request error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating service request",
    });
  }
};

/**
 * Get all service requests created by authenticated customer.
 * GET /api/requests
 * Protected by JWT
 */
const getCustomerRequests = async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ customer: req.user.userId })
      .populate("service", "name profession category image")
      .populate("selectedProvider", "fullName phoneNumber email providerProfile")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Get customer requests error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching your requests",
    });
  }
};

/**
 * Get single service request by ID.
 * GET /api/requests/:id
 * Protected by JWT (Customer owner, Assigned provider, or Admin)
 */
const getRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID format",
      });
    }

    const request = await ServiceRequest.findById(id)
      .populate("customer", "fullName phoneNumber email")
      .populate("service", "name profession category image")
      .populate("selectedProvider", "fullName phoneNumber email providerProfile");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    const isCustomer = request.customer._id.toString() === req.user.userId;
    const isSelectedProvider =
      request.selectedProvider &&
      request.selectedProvider._id.toString() === req.user.userId;
    const isAdmin = req.user.role === "administrator";

    if (!isCustomer && !isSelectedProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You are not authorized to view this request.",
      });
    }

    return res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error("Get request by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching request details",
    });
  }
};

/**
 * Fetch suitable verified providers for a specific service request.
 * GET /api/requests/:id/suitable-providers
 * Protected by JWT (Customer owner or Admin)
 */
const getSuitableProviders = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID format",
      });
    }

    const request = await ServiceRequest.findById(id).populate("service");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    // Only the request owner or administrator can view suitable providers
    if (
      request.customer.toString() !== req.user.userId &&
      req.user.role !== "administrator"
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only the request owner can view suitable providers.",
      });
    }

    const targetProfession = request.service?.profession;
    if (!targetProfession) {
      return res.status(400).json({
        success: false,
        message: "Service has no defined profession for provider matching",
      });
    }

    // Query verified and approved providers matching the profession
    const suitableProviders = await User.find({
      "providerProfile.isProvider": true,
      "providerProfile.isVerified": true,
      "providerProfile.verificationStatus": "approved",
      "providerProfile.profession": {
        $regex: new RegExp(`^${targetProfession.trim()}$`, "i"),
      },
    })
      .select("-password")
      .sort({ "providerProfile.rating": -1, "providerProfile.experienceYears": -1 });

    return res.status(200).json({
      success: true,
      count: suitableProviders.length,
      data: suitableProviders.map((prov) => ({
        id: prov._id,
        fullName: prov.fullName,
        phoneNumber: prov.phoneNumber,
        email: prov.email,
        profession: prov.providerProfile?.profession,
        specializations: prov.providerProfile?.specializations || [],
        description: prov.providerProfile?.description,
        experienceYears: prov.providerProfile?.experienceYears || 0,
        verificationStatus: prov.providerProfile?.verificationStatus,
        rating: prov.providerProfile?.rating || 0,
        reviewCount: prov.providerProfile?.reviewCount || 0,
      })),
    });
  } catch (error) {
    console.error("Get suitable providers error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while finding suitable providers",
    });
  }
};

/**
 * Customer selects a provider for their service request.
 * PUT /api/requests/:id/select-provider
 * Protected by JWT (Customer)
 */
const selectProvider = async (req, res) => {
  try {
    const { id } = req.params;
    const { providerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID or provider ID format",
      });
    }

    const request = await ServiceRequest.findById(id).populate("service");

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    if (request.customer.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only the request owner can select a provider.",
      });
    }

    if (["accepted", "in_progress", "completed", "cancelled"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot select a provider when request is already ${request.status}`,
      });
    }

    // Backend validation of provider eligibility
    const provider = await User.findById(providerId);

    if (!provider || !provider.providerProfile) {
      return res.status(404).json({
        success: false,
        message: "Selected provider not found",
      });
    }

    const { isProvider, isVerified, verificationStatus, profession } = provider.providerProfile;

    if (!isProvider || !isVerified || verificationStatus !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Selected user is not an approved and verified provider",
      });
    }

    // Verify profession matches service
    const targetProfession = request.service?.profession || "";
    if (
      !profession ||
      profession.trim().toLowerCase() !== targetProfession.trim().toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: `Provider profession (${profession}) does not match requested service profession (${targetProfession})`,
      });
    }

    // Assign provider
    request.selectedProvider = provider._id;
    request.status = "provider_selected";
    await request.save();

    const customerUser = await User.findById(req.user.userId).select("fullName");

    // Send notification to provider
    await sendNotification({
      recipient: provider._id,
      type: "SERVICE_REQUEST",
      title: "New Service Request Assigned",
      message: `${customerUser?.fullName || "A customer"} has selected you for a ${request.service?.name || "service"} request.`,
      relatedId: request._id,
    });

    const updatedRequest = await ServiceRequest.findById(request._id)
      .populate("service", "name profession category image")
      .populate("selectedProvider", "fullName phoneNumber email providerProfile")
      .populate("customer", "fullName phoneNumber email");

    return res.status(200).json({
      success: true,
      message: "Provider selected successfully",
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Select provider error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while selecting provider",
    });
  }
};

/**
 * Customer cancels their service request.
 * PUT /api/requests/:id/cancel
 * Protected by JWT (Customer)
 */
const cancelRequest = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID format",
      });
    }

    const request = await ServiceRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Service request not found",
      });
    }

    if (request.customer.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only the customer who created this request can cancel it.",
      });
    }

    if (request.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a completed service request",
      });
    }

    if (request.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Service request is already cancelled",
      });
    }

    request.status = "cancelled";
    await request.save();

    // If provider was assigned, inform them of cancellation
    if (request.selectedProvider) {
      await sendNotification({
        recipient: request.selectedProvider,
        type: "REQUEST_REJECTED",
        title: "Service Request Cancelled",
        message: "A service request assigned to you was cancelled by the customer.",
        relatedId: request._id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service request cancelled successfully",
      data: request,
    });
  } catch (error) {
    console.error("Cancel request error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while cancelling request",
    });
  }
};

/**
 * Provider views requests assigned to them.
 * GET /api/provider/requests
 * Protected by JWT (Verified Provider)
 */
const getProviderRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (
      !user ||
      !user.providerProfile ||
      !user.providerProfile.isProvider ||
      !user.providerProfile.isVerified ||
      user.providerProfile.verificationStatus !== "approved"
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only approved and verified service providers can view assigned requests.",
      });
    }

    const requests = await ServiceRequest.find({
      selectedProvider: req.user.userId,
    })
      .populate("customer", "fullName phoneNumber email")
      .populate("service", "name profession category image")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Get provider requests error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching provider requests",
    });
  }
};

module.exports = {
  createRequest,
  getCustomerRequests,
  getRequestById,
  getSuitableProviders,
  selectProvider,
  cancelRequest,
  getProviderRequests,
};
