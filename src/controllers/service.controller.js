const mongoose = require("mongoose");
const Service = require("../models/service");

/**
 * Get all active services with optional search and category filter.
 * GET /api/services
 * Public endpoint
 */
const getAllServices = async (req, res) => {
  try {
    const { search, category, all } = req.query;

    const filter = {};

    // By default, only return active services unless explicitly requested (e.g. for admin panel)
    if (all !== "true") {
      filter.isActive = true;
    }

    if (category) {
      filter.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };
    }

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [{ name: searchRegex }, { description: searchRegex }, { profession: searchRegex }];
    }

    const services = await Service.find(filter).sort({ name: 1 });

    return res.status(200).json({
      success: true,
      count: services.length,
      data: services,
    });
  } catch (error) {
    console.error("Get all services error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching services",
    });
  }
};

/**
 * Get single service by ID.
 * GET /api/services/:id
 * Public endpoint
 */
const getServiceById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID format",
      });
    }

    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: service,
    });
  } catch (error) {
    console.error("Get service by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching service",
    });
  }
};

/**
 * Create a new service.
 * POST /api/services
 * Protected: Administrator only
 */
const createService = async (req, res) => {
  try {
    const { name, profession, category, description, image } = req.body;

    if (!name || !profession || !category || !description) {
      return res.status(400).json({
        success: false,
        message: "name, profession, category, and description are required",
      });
    }

    const existingService = await Service.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
    });

    if (existingService) {
      return res.status(409).json({
        success: false,
        message: "A service with this name already exists",
      });
    }

    const service = await Service.create({
      name: name.trim(),
      profession: profession.trim(),
      category: category.trim(),
      description: description.trim(),
      image: image ? image.trim() : "",
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service,
    });
  } catch (error) {
    console.error("Create service error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating service",
    });
  }
};

/**
 * Update an existing service.
 * PUT /api/services/:id
 * Protected: Administrator only
 */
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, profession, category, description, image, isActive } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID format",
      });
    }

    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    if (name !== undefined) {
      const nameTrimmed = name.trim();
      const duplicate = await Service.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${nameTrimmed}$`, "i") },
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Another service with this name already exists",
        });
      }
      service.name = nameTrimmed;
    }

    if (profession !== undefined) service.profession = profession.trim();
    if (category !== undefined) service.category = category.trim();
    if (description !== undefined) service.description = description.trim();
    if (image !== undefined) service.image = image.trim();
    if (isActive !== undefined) service.isActive = Boolean(isActive);

    await service.save();

    return res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: service,
    });
  } catch (error) {
    console.error("Update service error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating service",
    });
  }
};

/**
 * Soft deactivate a service.
 * DELETE /api/services/:id
 * Protected: Administrator only
 */
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID format",
      });
    }

    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    // Soft delete by setting isActive to false
    service.isActive = false;
    await service.save();

    return res.status(200).json({
      success: true,
      message: "Service deactivated successfully",
      data: service,
    });
  } catch (error) {
    console.error("Delete service error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deactivating service",
    });
  }
};

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
};
