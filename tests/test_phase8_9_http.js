const mongoose = require("mongoose");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
dotenv.config();

const reviewRoutes = require("../src/routes/review.routes");
const providerRoutes = require("../src/routes/provider.routes");
const notificationRoutes = require("../src/routes/notification.routes");
const jobRoutes = require("../src/routes/job.routes");

const User = require("../src/models/user");
const Service = require("../src/models/service");
const ServiceRequest = require("../src/models/serviceRequest");
const Job = require("../src/models/job");
const Review = require("../src/models/review");
const Notification = require("../src/models/notification");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/reviews", reviewRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/jobs", jobRoutes);

let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Phase 8 & 9 tests");

  await User.deleteMany({});
  await Service.deleteMany({});
  await ServiceRequest.deleteMany({});
  await Job.deleteMany({});
  await Review.deleteMany({});
  await Notification.deleteMany({});

  const port = 5059;
  server = app.listen(port);
  const baseUrl = `http://localhost:${port}`;

  const hash = await require("bcryptjs").hash("pass123", 10);

  // 1. Create Customer
  const customer = await User.create({
    fullName: "Reviewer Customer",
    phoneNumber: "237698000001",
    email: "reviewer@test.com",
    password: hash,
    role: "customer",
  });
  const customerToken = jwt.sign({ userId: customer._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  // 2. Create Provider
  const provider = await User.create({
    fullName: "Top Electrician",
    phoneNumber: "237698000002",
    email: "electrician@test.com",
    password: hash,
    role: "customer",
    providerProfile: {
      profession: "Electrician",
      isProvider: true,
      isVerified: true,
      verificationStatus: "approved",
      rating: 0,
      reviewCount: 0,
    },
  });
  const providerToken = jwt.sign({ userId: provider._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  // 3. Create Service
  const service = await Service.create({
    name: "Electrical Repair",
    profession: "Electrician",
    category: "Electrical",
    description: "Electrical fix",
    isActive: true,
  });

  // 4. Create ServiceRequest and Job 1 (status: in_progress)
  const req1 = await ServiceRequest.create({
    customer: customer._id,
    service: service._id,
    description: "Fix circuit breaker",
    location: { type: "Point", coordinates: [11.5, 3.8], address: "Yaoundé" },
    selectedProvider: provider._id,
    status: "in_progress",
  });

  const job1 = await Job.create({
    customer: customer._id,
    provider: provider._id,
    serviceRequest: req1._id,
    status: "in_progress",
    startedAt: new Date(),
  });

  // 5. Try to review an in-progress job -> rejected (400)
  const prematureReview = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: job1._id,
      rating: 5,
      comment: "Great work!",
    }),
  });
  console.log("5. Premature review status:", prematureReview.status);
  if (prematureReview.status !== 400) throw new Error("Premature review should return 400");

  // 6. Complete Job 1
  job1.status = "completed";
  job1.completedAt = new Date();
  await job1.save();

  // 7. Invalid rating (e.g. 6) -> 400
  const invalidRating = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: job1._id,
      rating: 6,
      comment: "Superb!",
    }),
  });
  console.log("7. Invalid rating status:", invalidRating.status);
  if (invalidRating.status !== 400) throw new Error("Rating > 5 should return 400");

  // 8. Submit valid 5-star review
  const validReview = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: job1._id,
      rating: 5,
      comment: "Excellent service, on time and very knowledgeable!",
    }),
  });
  const reviewData = await validReview.json();
  console.log("8. Valid review created:", reviewData.success, reviewData.data?.rating);
  if (!reviewData.success || reviewData.data.rating !== 5) throw new Error("Review creation failed");

  // Check provider rating in database
  const provAfterReview1 = await User.findById(provider._id);
  console.log("8b. Provider rating & reviewCount:", provAfterReview1.providerProfile.rating, provAfterReview1.providerProfile.reviewCount);
  if (provAfterReview1.providerProfile.rating !== 5 || provAfterReview1.providerProfile.reviewCount !== 1) {
    throw new Error("Provider rating synchronization failed");
  }

  // 9. Prevent duplicate review for job 1 -> 409
  const dupReview = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: job1._id,
      rating: 4,
      comment: "Second attempt",
    }),
  });
  console.log("9. Duplicate review status:", dupReview.status);
  if (dupReview.status !== 409) throw new Error("Duplicate review should return 409");

  // 10. Create second completed job and submit 4-star review
  const req2 = await ServiceRequest.create({
    customer: customer._id,
    service: service._id,
    description: "Install chandelier",
    location: { type: "Point", coordinates: [11.5, 3.8], address: "Yaoundé" },
    selectedProvider: provider._id,
    status: "completed",
  });
  const job2 = await Job.create({
    customer: customer._id,
    provider: provider._id,
    serviceRequest: req2._id,
    status: "completed",
    startedAt: new Date(),
    completedAt: new Date(),
  });

  const review2Res = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${customerToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId: job2._id,
      rating: 4,
      comment: "Good work, slightly late but finished nicely.",
    }),
  });
  const review2Data = await review2Res.json();
  console.log("10. Review 2 created:", review2Data.success);

  // Check average rating: (5 + 4) / 2 = 4.5
  const provAfterReview2 = await User.findById(provider._id);
  console.log("10b. Calculated Average Rating & Count:", provAfterReview2.providerProfile.rating, provAfterReview2.providerProfile.reviewCount);
  if (provAfterReview2.providerProfile.rating !== 4.5 || provAfterReview2.providerProfile.reviewCount !== 2) {
    throw new Error("Rating average calculation incorrect");
  }

  // 11. Retrieve provider reviews via GET /api/providers/:id/reviews
  const getReviewsRes = await fetch(`${baseUrl}/api/providers/${provider._id}/reviews`);
  const getReviewsData = await getReviewsRes.json();
  console.log("11. Get provider reviews count:", getReviewsData.count, "average rating:", getReviewsData.provider?.rating);
  if (getReviewsData.count !== 2 || getReviewsData.provider.rating !== 4.5) {
    throw new Error("Provider reviews retrieval failed");
  }

  // 12. Notification tests for provider (received NEW_REVIEW notifications)
  const notifsRes = await fetch(`${baseUrl}/api/notifications`, {
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  const notifsData = await notifsRes.json();
  console.log("12. Provider notifications count:", notifsData.count, "unread:", notifsData.unreadCount);
  if (notifsData.count < 2 || notifsData.unreadCount < 2) throw new Error("Expected at least 2 unread notifications");
  const firstNotifId = notifsData.data[0]._id;

  // 13. Mark single notification read
  const markOneRes = await fetch(`${baseUrl}/api/notifications/${firstNotifId}/read`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  const markOneData = await markOneRes.json();
  console.log("13. Mark single notification read:", markOneData.data?.read);
  if (markOneData.data?.read !== true) throw new Error("Mark single notification read failed");

  // 14. Mark all read
  const markAllRes = await fetch(`${baseUrl}/api/notifications/read-all`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  const markAllData = await markAllRes.json();
  console.log("14. Mark all read modifiedCount:", markAllData.modifiedCount);

  // Verify unread count is now 0
  const unreadRes = await fetch(`${baseUrl}/api/notifications/unread`, {
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  const unreadData = await unreadRes.json();
  console.log("14b. Remaining unread notifications count:", unreadData.count);
  if (unreadData.count !== 0) throw new Error("Unread notifications should be 0 after read-all");

  console.log("\nALL PHASE 8 & PHASE 9 TESTS PASSED PERFECTLY!\n");

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
