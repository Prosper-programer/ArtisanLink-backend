const bcrypt = require("bcryptjs");
const User = require("../models/user");
const jwt = require("jsonwebtoken");

const registerUser = async (req, res) => {
  try {
    const { fullName, phoneNumber, email, password, confirmPassword } = req.body;

    const trimmedFullName = (fullName || "").trim();
    const trimmedPhoneNumber = (phoneNumber || "").trim();
    const trimmedEmail = (email || "").trim().toLowerCase();

    // 1. Check required fields with specific feedback
    if (!trimmedFullName) {
      return res.status(400).json({
        success: false,
        message: "Full name is required",
      });
    }

    if (!trimmedPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (!trimmedEmail) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // 2. Check password confirmation if supplied
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // 3. Check if email already exists
    const existingEmail = await User.findOne({ email: trimmedEmail });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // 4. Check if phone number already exists
    const existingPhone = await User.findOne({ phoneNumber: trimmedPhoneNumber });

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: "An account with this phone number already exists",
      });
    }

    // 5. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 6. Create user
    const user = await User.create({
      fullName: trimmedFullName,
      phoneNumber: trimmedPhoneNumber,
      email: trimmedEmail,
      password: hashedPassword,
      role: "customer",
      isPhoneVerified: false,
    });

    // 7. Send response
    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        avatar: user.avatar || "",
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};



const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // 2. Find user
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 3. Compare password
    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // 4. Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    // 5. Send response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        avatar: user.avatar || "",
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
        providerProfile: user.providerProfile,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
};