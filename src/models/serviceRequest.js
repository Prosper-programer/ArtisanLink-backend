const mongoose = require("mongoose");

const serviceRequestSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
        required: true,
        trim: true,
      },
    },
    preferredDate: {
      type: Date,
    },
    preferredTime: {
      type: String,
      trim: true,
    },
    photos: {
      type: [String],
      default: [],
    },
    selectedProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    rejectedProviders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    serviceName: {
      type: String,
      trim: true,
    },
    serviceCategory: {
      type: String,
      trim: true,
    },
    estimatedCost: {
      type: Number,
      default: 0,
    },
    isFlexible: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "provider_selected",
        "accepted",
        "rejected",
        "in_progress",
        "completed",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

serviceRequestSchema.index({ location: "2dsphere" });

const ServiceRequest = mongoose.model("ServiceRequest", serviceRequestSchema);

module.exports = ServiceRequest;
