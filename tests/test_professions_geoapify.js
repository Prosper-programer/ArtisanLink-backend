const mongoose = require("mongoose");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
dotenv.config();

const authRoutes = require("../src/routes/auth.routes");
const providerRoutes = require("../src/routes/provider.routes");
const serviceRequestRoutes = require("../src/routes/serviceRequest.routes");
const professionRoutes = require("../src/routes/profession.routes");
const locationRoutes = require("../src/routes/location.routes");
const serviceRoutes = require("../src/routes/service.routes");

const User = require("../src/models/user");
const Service = require("../src/models/service");
const ServiceRequest = require("../src/models/serviceRequest");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/requests", serviceRequestRoutes);
app.use("/api/professions", professionRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/services", serviceRoutes);

let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Professions & Geoapify tests");

  await User.deleteMany({ email: { $in: ["prof_test1@test.com", "prof_test2@test.com"] } });
  await ServiceRequest.deleteMany({});

  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log("Test server running on", baseUrl);

  // 1. Test GET /api/professions
  const profsRes = await fetch(`${baseUrl}/api/professions`);
  const profsData = await profsRes.json();
  console.log("1. GET /api/professions count:", profsData.count);
  if (!profsData.success || profsData.count !== 4) throw new Error("Expected 4 professions");

  const plumberEntry = profsData.data.find((p) => p.profession === "Plumber");
  console.log("1b. Plumber specializations:", plumberEntry?.specializations);
  if (!plumberEntry || !plumberEntry.specializations.includes("Pipe Installation")) {
    throw new Error("Plumber specializations missing");
  }

  // 2. Test GET /api/professions/Electrician/specializations
  const specRes = await fetch(`${baseUrl}/api/professions/Electrician/specializations`);
  const specData = await specRes.json();
  console.log("2. Electrician specializations count:", specData.count);
  if (!specData.success || specData.count !== 4) throw new Error("Electrician specializations failed");

  // 3. Register user to test provider validation
  const hash = await require("bcryptjs").hash("password123", 10);
  const testUser = await User.create({
    fullName: "Taxonomy Test User",
    phoneNumber: "237699887766",
    email: "prof_test1@test.com",
    password: hash,
    role: "customer",
  });
  const userToken = jwt.sign({ userId: testUser._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  // 3a. Invalid profession rejection
  const badProfRes = await fetch(`${baseUrl}/api/providers/become`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      profession: "Astronaut",
      description: "Space explorer",
      experienceYears: 5,
    }),
  });
  const badProfData = await badProfRes.json();
  console.log("3a. Invalid profession status:", badProfRes.status, "message:", badProfData.message);
  if (badProfRes.status !== 400 || !badProfData.message.includes("Invalid profession")) {
    throw new Error("Invalid profession should be rejected with 400");
  }

  // 3b. Invalid specialization rejection
  const badSpecRes = await fetch(`${baseUrl}/api/providers/become`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      profession: "Electrician",
      specializations: ["House Wiring", "Nuclear Physics"],
      description: "Certified electrician",
      experienceYears: 3,
    }),
  });
  const badSpecData = await badSpecRes.json();
  console.log("3b. Invalid specialization status:", badSpecRes.status, "message:", badSpecData.message);
  if (badSpecRes.status !== 400 || !badSpecData.message.includes("not an available specialization")) {
    throw new Error("Invalid specialization should be rejected with 400");
  }

  // 3c. Valid profession & specializations acceptance
  const goodBecomeRes = await fetch(`${baseUrl}/api/providers/become`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      profession: "Electrician",
      specializations: ["House Wiring", "Electrical Installation"],
      description: "Certified electrician for residential projects",
      experienceYears: 4,
    }),
  });
  const goodBecomeData = await goodBecomeRes.json();
  console.log("3c. Valid become provider status:", goodBecomeRes.status, "profession:", goodBecomeData.providerProfile?.profession);
  if (!goodBecomeData.success || goodBecomeData.providerProfile.profession !== "Electrician") {
    throw new Error("Valid provider application failed");
  }

  // 4. Test Geoapify Autocomplete endpoint
  const autoRes = await fetch(`${baseUrl}/api/location/autocomplete?text=bastos`);
  const autoData = await autoRes.json();
  console.log("4. GET /api/location/autocomplete count:", autoData.count);
  if (!autoData.success || autoData.count < 1) throw new Error("Autocomplete returned no results");
  console.log("4b. First suggestion:", autoData.data[0].formatted, autoData.data[0].coordinates);
  if (!autoData.data[0].coordinates || autoData.data[0].coordinates.length !== 2) {
    throw new Error("Missing coordinates in autocomplete suggestion");
  }

  // 5. Test Geoapify Geocode endpoint
  const geoRes = await fetch(`${baseUrl}/api/location/geocode?text=Akwa`);
  const geoData = await geoRes.json();
  console.log("5. GET /api/location/geocode address:", geoData.data?.formatted);
  if (!geoData.success || !geoData.data.coordinates) throw new Error("Geocode endpoint failed");

  // 6. Test Service Request creation with Geoapify autocomplete result format
  // Create an active service first
  let service = await Service.findOne({ isActive: true });
  if (!service) {
    service = await Service.create({
      name: "Wiring Repair",
      profession: "Electrician",
      category: "Electrical",
      description: "House wiring inspection",
      isActive: true,
    });
  }

  const reqRes = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      service: service._id,
      description: "Need lighting fixture fixed in living room",
      location: autoData.data[0], // Direct pass of Geoapify result object
      preferredDate: "2026-11-01",
      preferredTime: "02:00 PM",
    }),
  });
  const reqData = await reqRes.json();
  console.log("6. Create request with Geoapify location:", reqData.success, reqData.data?.location?.coordinates);
  if (!reqData.success || !reqData.data.location.coordinates || reqData.data.location.coordinates.length !== 2) {
    throw new Error("Service request creation with Geoapify location failed");
  }

  console.log("\nALL PROFESSIONS & GEOAPIFY INTEGRATION TESTS PASSED!\n");

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
