const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

const User = require("../src/models/user");
const Notification = require("../src/models/notification");

async function runTests() {
  console.log("--- Starting Phase 2 Tests ---");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to DB for test");

  // Clean test users
  await User.deleteMany({ email: { $in: ["test_cust@test.com", "test_admin@test.com", "test_rej@test.com"] } });
  await Notification.deleteMany({});

  // 1. Create a customer
  const hashedPassword = await bcrypt.hash("password123", 10);
  const customer = await User.create({
    fullName: "Test Customer",
    phoneNumber: "237690000001",
    email: "test_cust@test.com",
    password: hashedPassword,
    role: "customer",
  });

  const customerToken = jwt.sign(
    { userId: customer._id.toString(), role: customer.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  console.log("1. Customer created with initial verificationStatus:", customer.providerProfile?.verificationStatus);
  if (customer.providerProfile?.verificationStatus !== "none") {
    throw new Error("Default verificationStatus must be 'none'");
  }

  // 2. Create an admin
  const admin = await User.create({
    fullName: "Test Admin",
    phoneNumber: "237690000002",
    email: "test_admin@test.com",
    password: hashedPassword,
    role: "administrator",
  });

  const adminToken = jwt.sign(
    { userId: admin._id.toString(), role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  console.log("2. Admin created");

  console.log("--- Phase 2 DB Schema and Defaults Verified Successfully! ---");
  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
