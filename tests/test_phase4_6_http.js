const mongoose = require("mongoose");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
dotenv.config();

const authRoutes = require("../src/routes/auth.routes");
const userRoutes = require("../src/routes/user.routes");
const providerRoutes = require("../src/routes/provider.routes");
const adminRoutes = require("../src/routes/admin.routes");
const serviceRoutes = require("../src/routes/service.routes");
const serviceRequestRoutes = require("../src/routes/serviceRequest.routes");
const providerRequestRoutes = require("../src/routes/providerRequest.routes");
const jobRoutes = require("../src/routes/job.routes");

const User = require("../src/models/user");
const Service = require("../src/models/service");
const ServiceRequest = require("../src/models/serviceRequest");
const Job = require("../src/models/job");
const Notification = require("../src/models/notification");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/requests", serviceRequestRoutes);
app.use("/api/provider/requests", providerRequestRoutes);
app.use("/api/jobs", jobRoutes);

let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Phase 4 & 6 tests");

  // Clean data
  await User.deleteMany({});
  await Service.deleteMany({});
  await ServiceRequest.deleteMany({});
  await Job.deleteMany({});
  await Notification.deleteMany({});

  const port = 5057;
  server = app.listen(port);
  const baseUrl = `http://localhost:${port}`;

  const hash = await require("bcryptjs").hash("pass123", 10);

  // 1. Create Customer
  const customer = await User.create({
    fullName: "Customer John",
    phoneNumber: "237694000001",
    email: "cust4@artisan.test",
    password: hash,
    role: "customer",
  });
  const customerToken = jwt.sign({ userId: customer._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  // 2. Create Approved Provider
  const approvedProv = await User.create({
    fullName: "Master Plumber Paul",
    phoneNumber: "237694000002",
    email: "prov4_app@artisan.test",
    password: hash,
    role: "customer",
    providerProfile: {
      profession: "Plumber",
      specializations: ["Pipe Repair", "Leak Detection"],
      description: "Master plumber with 8 years experience",
      experienceYears: 8,
      isProvider: true,
      isVerified: true,
      verificationStatus: "approved",
    },
  });
  const approvedProvToken = jwt.sign({ userId: approvedProv._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  // 3. Create Pending (Unapproved) Provider
  const pendingProv = await User.create({
    fullName: "Amateur Plumber",
    phoneNumber: "237694000003",
    email: "prov4_pen@artisan.test",
    password: hash,
    role: "customer",
    providerProfile: {
      profession: "Plumber",
      description: "Beginner plumber",
      experienceYears: 1,
      isProvider: true,
      isVerified: false,
      verificationStatus: "pending",
    },
  });
  const pendingProvToken = jwt.sign({ userId: pendingProv._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  // 4. Create Service
  const service = await Service.create({
    name: "Standard Plumbing",
    profession: "Plumber",
    category: "Plumbing",
    description: "All types of pipe repair",
    isActive: true,
  });

  // 5. Customer creates service request
  const createReqRes = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service: service._id,
      description: "Water pipe leaking in the kitchen",
      location: {
        coordinates: [11.5021, 3.848],
        address: "Bastos, Yaoundé, Cameroon",
      },
      preferredDate: "2026-10-01",
      preferredTime: "10:00 AM",
    }),
  });
  const reqData = await createReqRes.json();
  console.log("5. Customer creates request:", reqData.success, reqData.data?.status);
  if (!reqData.success || reqData.data.status !== "pending") throw new Error("Create request failed");
  const requestId = reqData.data._id;

  // 6. Customer fetches suitable providers for the request
  const suitableRes = await fetch(`${baseUrl}/api/requests/${requestId}/suitable-providers`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const suitableData = await suitableRes.json();
  console.log("6. Suitable providers found:", suitableData.count);
  if (suitableData.count !== 1 || suitableData.data[0].id !== approvedProv._id.toString()) {
    throw new Error("Suitable providers logic must only return the approved provider");
  }

  // 7. Customer attempts to select unapproved provider -> rejected (400)
  const selectBadRes = await fetch(`${baseUrl}/api/requests/${requestId}/select-provider`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ providerId: pendingProv._id }),
  });
  console.log("7. Select unapproved provider status:", selectBadRes.status);
  if (selectBadRes.status !== 400) throw new Error("Selecting unapproved provider should return 400");

  // 8. Customer selects approved provider
  const selectGoodRes = await fetch(`${baseUrl}/api/requests/${requestId}/select-provider`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ providerId: approvedProv._id }),
  });
  const selectGoodData = await selectGoodRes.json();
  console.log("8. Select approved provider:", selectGoodData.success, selectGoodData.data?.status);
  if (!selectGoodData.success || selectGoodData.data.status !== "provider_selected") {
    throw new Error("Provider selection failed");
  }

  // Verify notification sent to provider
  const provNotif = await Notification.findOne({ recipient: approvedProv._id });
  console.log("8b. Provider received SERVICE_REQUEST notification:", provNotif?.type);
  if (provNotif?.type !== "SERVICE_REQUEST") throw new Error("Provider should receive SERVICE_REQUEST notification");

  // 9. Provider views assigned requests
  const provReqsRes = await fetch(`${baseUrl}/api/provider/requests`, {
    headers: { Authorization: `Bearer ${approvedProvToken}` },
  });
  const provReqsData = await provReqsRes.json();
  console.log("9. Provider views assigned requests count:", provReqsData.count);
  if (provReqsData.count !== 1) throw new Error("Provider assigned requests missing");

  // 10. Provider accepts request -> Job created
  const acceptRes = await fetch(`${baseUrl}/api/provider/requests/${requestId}/accept`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${approvedProvToken}` },
  });
  const acceptData = await acceptRes.json();
  console.log("10. Provider accepts request:", acceptData.success, acceptData.data?.status);
  if (!acceptData.success || acceptData.data.status !== "accepted") {
    throw new Error("Accept request failed");
  }
  const jobId = acceptData.data._id;

  // Verify customer received REQUEST_ACCEPTED notification
  const custNotif1 = await Notification.findOne({ recipient: customer._id, type: "REQUEST_ACCEPTED" });
  console.log("10b. Customer received notification:", custNotif1?.type);
  if (!custNotif1) throw new Error("Customer did not receive REQUEST_ACCEPTED notification");

  // 11. Provider starts job
  const startRes = await fetch(`${baseUrl}/api/jobs/${jobId}/start`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${approvedProvToken}` },
  });
  const startData = await startRes.json();
  console.log("11. Provider starts job:", startData.success, startData.data?.status);
  if (!startData.success || startData.data.status !== "in_progress") {
    throw new Error("Start job failed");
  }

  // 12. Provider completes job
  const compRes = await fetch(`${baseUrl}/api/jobs/${jobId}/complete`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${approvedProvToken}` },
  });
  const compData = await compRes.json();
  console.log("12. Provider completes job:", compData.success, compData.data?.status);
  if (!compData.success || compData.data.status !== "completed") {
    throw new Error("Complete job failed");
  }

  // Verify customer received JOB_COMPLETED notification
  const custNotif2 = await Notification.findOne({ recipient: customer._id, type: "JOB_COMPLETED" });
  console.log("12b. Customer received JOB_COMPLETED notification:", custNotif2?.type);
  if (!custNotif2) throw new Error("Customer did not receive JOB_COMPLETED notification");

  // 13. Customer views jobs
  const custJobsRes = await fetch(`${baseUrl}/api/jobs`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const custJobsData = await custJobsRes.json();
  console.log("13. Customer sees jobs count:", custJobsData.count);
  if (custJobsData.count !== 1) throw new Error("Customer jobs listing failed");

  // 14. Cancellation test: create second request and cancel it
  const req2Res = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service: service._id,
      description: "Second request to test cancel",
      location: {
        coordinates: [11.5021, 3.848],
        address: "Bastos, Yaoundé",
      },
    }),
  });
  const req2Data = await req2Res.json();
  const cancelRes = await fetch(`${baseUrl}/api/requests/${req2Data.data._id}/cancel`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const cancelData = await cancelRes.json();
  console.log("14. Cancel request status:", cancelData.data?.status);
  if (cancelData.data?.status !== "cancelled") throw new Error("Cancel request failed");

  console.log("\nALL PHASE 4 & PHASE 6 TESTS PASSED PERFECTLY!\n");

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
