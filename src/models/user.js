const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      enum: ["customer", "provider", "administrator"],
      default: "customer",
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    // Provider information
    providerProfile: {
      profession: {
        type: String,
        trim: true,
      },

      specializations: {
        type: [String],
        default: [],
      },

      description: {
        type: String,
        trim: true,
      },

      experienceYears: {
        type: Number,
        min: 0,
      },

      isProvider: {
        type: Boolean,
        default: false,
      },

      isVerified: {
        type: Boolean,
        default: false,
      },

      verificationStatus: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
      },

      verificationReason: {
        type: String,
        trim: true,
      },

      rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },

      reviewCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ "providerProfile.profession": 1 });

const User = mongoose.model("User", userSchema);

module.exports = User;