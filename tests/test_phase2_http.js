const mongoose = require("mongoose");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();

const authRoutes = require("../src/routes/auth.routes");
const userRoutes = require("../src/routes/user.routes");
const providerRoutes = require("../src/routes/provider.routes");
const adminRoutes = require("../src/routes/admin.routes");
const User = require("../src/models/user");
const Notification = require("../src/models/notification");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/admin", adminRoutes);

let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Phase 2 HTTP tests");

  // Clean test users
  await User.deleteMany({
    email: {
      $in: [
        "cust1@artisan.test",
        "admin1@artisan.test",
        "provider_rej@artisan.test",
      ],
    },
  });
  await Notification.deleteMany({});

  const port = 5055;
  server = app.listen(port);
  const baseUrl = `http://localhost:${port}`;

  console.log("Test server running on", baseUrl);

  // 1. Register customer
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Alice Customer",
      phoneNumber: "237691111111",
      email: "cust1@artisan.test",
      password: "password123",
      confirmPassword: "password123",
    }),
  });
  const regData = await regRes.json();
  console.log("1. Customer Register response:", regData.success);
  if (!regData.success) throw new Error("Customer registration failed");

  // 2. Login customer
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "cust1@artisan.test",
      password: "password123",
    }),
  });
  const loginData = await loginRes.json();
  const customerToken = loginData.token;
  console.log("2. Customer Login successful. Token received.");

  // 3. Customer checks /api/users/me
  const meRes = await fetch(`${baseUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const meData = await meRes.json();
  console.log("3. /api/users/me response:", meData.user.fullName);
  if (meData.user.password) throw new Error("Password leaked in /api/users/me");

  // 4. Customer tries GET /api/providers/me before becoming provider -> must fail (403)
  const provMeBefore = await fetch(`${baseUrl}/api/providers/me`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  console.log("4. GET /api/providers/me before becoming provider status:", provMeBefore.status);
  if (provMeBefore.status !== 403) throw new Error("Should return 403 when not a provider");

  // 5. Customer calls POST /api/providers/become
  const becomeRes = await fetch(`${baseUrl}/api/providers/become`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profession: "Plumber",
      specializations: ["Pipe Repair", "Drain Cleaning"],
      description: "Expert plumbing services for home and office.",
      experienceYears: 4,
    }),
  });
  const becomeData = await becomeRes.json();
  console.log("5. Become provider response:", becomeData.success, becomeData.providerProfile?.verificationStatus);
  if (
    !becomeData.success ||
    becomeData.providerProfile.verificationStatus !== "pending" ||
    becomeData.providerProfile.isVerified !== false ||
    becomeData.providerProfile.isProvider !== true
  ) {
    throw new Error("Become provider failed to set correct status");
  }

  // Check user still has role 'customer'
  const userCheck = await User.findById(meData.user._id);
  console.log("5b. User role after becoming provider:", userCheck.role);
  if (userCheck.role !== "customer") {
    throw new Error("User role must remain 'customer'");
  }

  // 6. Cannot become provider again -> 409
  const becomeAgainRes = await fetch(`${baseUrl}/api/providers/become`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profession: "Electrician",
      description: "Test",
      experienceYears: 2,
    }),
  });
  console.log("6. Duplicate become provider status:", becomeAgainRes.status);
  if (becomeAgainRes.status !== 409) throw new Error("Should return 409 when already a provider");

  // 7. GET /api/providers/me
  const provMeRes = await fetch(`${baseUrl}/api/providers/me`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const provMeData = await provMeRes.json();
  console.log("7. GET /api/providers/me:", provMeData.provider.fullName, provMeData.provider.providerProfile.profession);
  if (provMeData.provider.password) throw new Error("Password leaked in provider profile");

  // 8. PUT /api/providers/me
  const updateProvRes = await fetch(`${baseUrl}/api/providers/me`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Updated expert plumbing services.",
      experienceYears: 5,
    }),
  });
  const updateProvData = await updateProvRes.json();
  console.log("8. Update provider profile:", updateProvData.providerProfile.experienceYears);
  if (updateProvData.providerProfile.experienceYears !== 5) throw new Error("Failed to update profile");

  // 9. Customer tries to access admin route -> 403
  const adminForbidden = await fetch(`${baseUrl}/api/admin/providers/pending`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  console.log("9. Customer accessing admin route status:", adminForbidden.status);
  if (adminForbidden.status !== 403) throw new Error("Customer should get 403 on admin route");

  // 10. Register & Login Administrator
  await User.create({
    fullName: "Admin Officer",
    phoneNumber: "237692222222",
    email: "admin1@artisan.test",
    password: await require("bcryptjs").hash("admin123", 10),
    role: "administrator",
  });
  const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin1@artisan.test",
      password: "admin123",
    }),
  });
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.token;
  console.log("10. Admin login successful. Token received.");

  // 11. Admin views pending providers
  const pendingRes = await fetch(`${baseUrl}/api/admin/providers/pending`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const pendingData = await pendingRes.json();
  console.log("11. Pending providers count:", pendingData.count);
  if (pendingData.count < 1) throw new Error("Pending provider not found by admin");

  // 12. Admin approves provider
  const verifyRes = await fetch(`${baseUrl}/api/admin/providers/${meData.user._id}/verify`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const verifyData = await verifyRes.json();
  console.log("12. Admin verify provider:", verifyData.success, verifyData.provider.providerProfile.verificationStatus);
  if (
    !verifyData.success ||
    verifyData.provider.providerProfile.isVerified !== true ||
    verifyData.provider.providerProfile.verificationStatus !== "approved"
  ) {
    throw new Error("Provider verification failed");
  }

  // 13. Verify notification received
  const notif = await Notification.findOne({ recipient: meData.user._id });
  console.log("13. Provider received notification:", notif?.type, notif?.title);
  if (notif?.type !== "PROVIDER_VERIFIED") throw new Error("PROVIDER_VERIFIED notification missing");

  // 14. Test rejection mechanism with another user
  const rejUser = await User.create({
    fullName: "Rejected Applicant",
    phoneNumber: "237693333333",
    email: "provider_rej@artisan.test",
    password: await require("bcryptjs").hash("password123", 10),
    role: "customer",
    providerProfile: {
      profession: "Painter",
      isProvider: true,
      isVerified: false,
      verificationStatus: "pending",
    },
  });

  const rejectRes = await fetch(`${baseUrl}/api/admin/providers/${rejUser._id}/reject`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: "Missing required national identity proof",
    }),
  });
  const rejectData = await rejectRes.json();
  console.log("14. Admin reject provider:", rejectData.success, rejectData.provider.providerProfile.verificationStatus);
  if (
    !rejectData.success ||
    rejectData.provider.providerProfile.isVerified !== false ||
    rejectData.provider.providerProfile.verificationStatus !== "rejected" ||
    rejectData.provider.providerProfile.verificationReason !== "Missing required national identity proof"
  ) {
    throw new Error("Provider rejection logic failed");
  }

  const rejNotif = await Notification.findOne({ recipient: rejUser._id });
  console.log("14b. Rejection notification received:", rejNotif?.type, rejNotif?.message);
  if (rejNotif?.type !== "PROVIDER_REJECTED") throw new Error("PROVIDER_REJECTED notification missing");

  console.log("\nALL PHASE 2 HTTP & WORKFLOW TESTS PASSED PERFECTLY!\n");

  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("Test error:", err);
  if (server) server.close();
  await mongoose.disconnect();
  process.exit(1);
});
