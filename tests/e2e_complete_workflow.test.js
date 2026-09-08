const mongoose = require("mongoose");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();

const authRoutes = require("../src/routes/auth.routes");
const userRoutes = require("../src/routes/user.routes");
const providerRoutes = require("../src/routes/provider.routes");
const adminRoutes = require("../src/routes/admin.routes");
const serviceRoutes = require("../src/routes/service.routes");
const serviceRequestRoutes = require("../src/routes/serviceRequest.routes");
const providerRequestRoutes = require("../src/routes/providerRequest.routes");
const jobRoutes = require("../src/routes/job.routes");
const conversationRoutes = require("../src/routes/message.routes");
const reviewRoutes = require("../src/routes/review.routes");
const notificationRoutes = require("../src/routes/notification.routes");

const User = require("../src/models/user");
const Service = require("../src/models/service");
const ServiceRequest = require("../src/models/serviceRequest");
const Job = require("../src/models/job");
const Conversation = require("../src/models/conversation");
const Message = require("../src/models/message");
const Review = require("../src/models/review");
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
app.use("/api/conversations", conversationRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/", (req, res) => res.json({ message: "ArtisanLink API is running" }));
app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` }));

let server;

async function runE2E() {
  console.log("==================================================");
  console.log("ARTISANLINK MASTER E2E INTEGRATION TEST");
  console.log("==================================================");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✓ Connected to MongoDB");

  // Clean test database collections
  await Promise.all([
    User.deleteMany({}),
    Service.deleteMany({}),
    ServiceRequest.deleteMany({}),
    Job.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Review.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log("✓ Cleaned test database collections");

  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test Server listening on ${baseUrl}\n`);

  // ----------------------------------------------------
  // STEP 1: AUTHENTICATION & REGISTRATION
  // ----------------------------------------------------
  console.log("--- STEP 1: AUTHENTICATION & REGISTRATION ---");

  // Register Customer (Alice)
  const regAliceRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Alice Mengue",
      phoneNumber: "237690111111",
      email: "alice@artisanlink.cm",
      password: "password123",
      confirmPassword: "password123",
    }),
  });
  const regAlice = await regAliceRes.json();
  if (!regAlice.success) throw new Error("Customer registration failed");
  console.log("✓ Alice registered successfully");

  // Register Provider (Bob)
  const regBobRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Bob Kamga",
      phoneNumber: "237690222222",
      email: "bob@artisanlink.cm",
      password: "password123",
      confirmPassword: "password123",
    }),
  });
  const regBob = await regBobRes.json();
  if (!regBob.success) throw new Error("Bob registration failed");
  console.log("✓ Bob registered successfully");

  // Create Administrator directly in DB (admin account)
  const adminPasswordHash = await require("bcryptjs").hash("adminpass123", 10);
  await User.create({
    fullName: "Chief Administrator",
    phoneNumber: "237690999999",
    email: "admin@artisanlink.cm",
    password: adminPasswordHash,
    role: "administrator",
  });
  console.log("✓ Admin account established");

  // Login Alice
  const loginAliceRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@artisanlink.cm", password: "password123" }),
  });
  const loginAlice = await loginAliceRes.json();
  const aliceToken = loginAlice.token;

  // Login Bob
  const loginBobRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "bob@artisanlink.cm", password: "password123" }),
  });
  const loginBob = await loginBobRes.json();
  const bobToken = loginBob.token;

  // Login Admin
  const loginAdminRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@artisanlink.cm", password: "adminpass123" }),
  });
  const loginAdmin = await loginAdminRes.json();
  const adminToken = loginAdmin.token;

  // Check /api/users/me (no password leak)
  const meRes = await fetch(`${baseUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const meData = await meRes.json();
  if (meData.user.password !== undefined) throw new Error("Security Alert: password returned in /api/users/me");
  console.log("✓ All 3 users logged in, tokens obtained, passwords protected\n");

  // ----------------------------------------------------
  // STEP 2: PROVIDER APPLICATION & ADMIN VERIFICATION
  // ----------------------------------------------------
  console.log("--- STEP 2: BECOME PROVIDER & ADMIN VERIFICATION ---");

  // Bob becomes provider
  const becomeRes = await fetch(`${baseUrl}/api/providers/become`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bobToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      profession: "Plumber",
      specializations: ["Pipe Installation", "Pipe Repair", "Leak Detection"],
      description: "Experienced certified plumber working in Yaoundé and Douala.",
      experienceYears: 6,
    }),
  });
  const becomeData = await becomeRes.json();
  if (!becomeData.success || becomeData.providerProfile.verificationStatus !== "pending") {
    throw new Error("Become provider failed to set verificationStatus = pending");
  }

  // Verify Bob still has role 'customer'
  const bobUserInDb = await User.findById(regBob.user.id);
  if (bobUserInDb.role !== "customer") {
    throw new Error("User role was modified; must preserve dual customer/provider role");
  }
  console.log("✓ Bob applied to become provider (verificationStatus: pending, role: customer preserved)");

  // Alice tries to access admin endpoint -> 403
  const aliceAdminAccess = await fetch(`${baseUrl}/api/admin/providers/pending`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  if (aliceAdminAccess.status !== 403) throw new Error("Customer was not blocked from admin endpoint!");
  console.log("✓ Non-admin access to admin routes strictly forbidden (403)");

  // Admin views pending providers
  const pendingRes = await fetch(`${baseUrl}/api/admin/providers/pending`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const pendingData = await pendingRes.json();
  if (pendingData.count < 1) throw new Error("Pending provider not listed for admin");
  console.log(`✓ Admin retrieved pending providers (Count: ${pendingData.count})`);

  // Admin verifies and approves Bob
  const verifyRes = await fetch(`${baseUrl}/api/admin/providers/${regBob.user.id}/verify`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const verifyData = await verifyRes.json();
  if (!verifyData.success || verifyData.provider.providerProfile.verificationStatus !== "approved") {
    throw new Error("Admin verify provider failed");
  }

  // Verify Bob received PROVIDER_VERIFIED notification
  const bobVerifyNotif = await Notification.findOne({ recipient: regBob.user.id, type: "PROVIDER_VERIFIED" });
  if (!bobVerifyNotif) throw new Error("PROVIDER_VERIFIED notification not sent to provider");
  console.log("✓ Admin approved provider. Bob received PROVIDER_VERIFIED notification\n");

  // ----------------------------------------------------
  // STEP 3: SERVICES MODULE
  // ----------------------------------------------------
  console.log("--- STEP 3: SERVICES CREATION & DISCOVERY ---");

  // Admin creates Plumbing Service
  const srvRes = await fetch(`${baseUrl}/api/services`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Residential Plumbing & Drainage",
      profession: "Plumber",
      category: "Plumbing",
      description: "Repair burst pipes, fix water leaks, and clear blocked drains.",
    }),
  });
  const srvData = await srvRes.json();
  if (!srvData.success) throw new Error("Create service failed");
  const serviceId = srvData.data._id;
  console.log("✓ Admin created service 'Residential Plumbing & Drainage' with profession 'Plumber'");

  // Public searches services
  const searchRes = await fetch(`${baseUrl}/api/services?search=plumb`);
  const searchData = await searchRes.json();
  if (searchData.count !== 1) throw new Error("Search service failed");
  console.log(`✓ Public search query 'plumb' successfully found active service: ${searchData.data[0].name}\n`);

  // ----------------------------------------------------
  // STEP 4: SERVICE REQUEST & PROVIDER SELECTION (SUPERVISOR FLOW)
  // ----------------------------------------------------
  console.log("--- STEP 4: SERVICE REQUEST & PROVIDER SELECTION ---");

  // Alice creates service request
  const createReqRes = await fetch(`${baseUrl}/api/requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aliceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      service: serviceId,
      description: "Burst pipe under the kitchen sink causing flooding.",
      location: {
        coordinates: [11.518, 3.866],
        address: "Bastos Embassy Area, Yaoundé",
      },
      preferredDate: "2026-10-15",
      preferredTime: "09:00 AM",
      photos: ["https://example.com/photos/pipe1.jpg"],
    }),
  });
  const reqCreatedData = await createReqRes.json();
  if (!reqCreatedData.success || reqCreatedData.data.status !== "pending") {
    throw new Error("Create service request failed");
  }
  const requestId = reqCreatedData.data._id;
  console.log("✓ Alice created service request (Initial status: pending)");

  // Alice finds suitable verified providers for the request
  const suitableRes = await fetch(`${baseUrl}/api/requests/${requestId}/suitable-providers`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const suitableData = await suitableRes.json();
  if (suitableData.count !== 1 || suitableData.data[0].id !== regBob.user.id) {
    throw new Error("Suitable providers matching failed");
  }
  console.log(`✓ System found ${suitableData.count} suitable verified provider matching profession: ${suitableData.data[0].fullName}`);

  // Alice selects Bob
  const selectProvRes = await fetch(`${baseUrl}/api/requests/${requestId}/select-provider`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${aliceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ providerId: regBob.user.id }),
  });
  const selectProvData = await selectProvRes.json();
  if (!selectProvData.success || selectProvData.data.status !== "provider_selected") {
    throw new Error("Provider selection failed");
  }

  // Bob receives notification
  const bobReqNotif = await Notification.findOne({ recipient: regBob.user.id, type: "SERVICE_REQUEST" });
  if (!bobReqNotif) throw new Error("Bob did not receive SERVICE_REQUEST notification");
  console.log("✓ Alice selected Bob. Request status: provider_selected. Bob notified\n");

  // ----------------------------------------------------
  // STEP 5: JOB LIFECYCLE MANAGEMENT
  // ----------------------------------------------------
  console.log("--- STEP 5: JOB LIFECYCLE MANAGEMENT ---");

  // Bob views assigned requests
  const bobReqsRes = await fetch(`${baseUrl}/api/provider/requests`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const bobReqsData = await bobReqsRes.json();
  if (bobReqsData.count !== 1) throw new Error("Bob assigned requests missing");
  console.log(`✓ Bob sees ${bobReqsData.count} assigned service request`);

  // Bob accepts request -> Job is created
  const acceptRes = await fetch(`${baseUrl}/api/provider/requests/${requestId}/accept`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const acceptData = await acceptRes.json();
  if (!acceptData.success || acceptData.data.status !== "accepted") {
    throw new Error("Bob accept request failed");
  }
  const jobId = acceptData.data._id;

  // Alice receives REQUEST_ACCEPTED notification
  const aliceAcceptNotif = await Notification.findOne({ recipient: regAlice.user.id, type: "REQUEST_ACCEPTED" });
  if (!aliceAcceptNotif) throw new Error("Alice did not receive REQUEST_ACCEPTED notification");
  console.log("✓ Bob accepted request. Job created with status 'accepted'. Alice notified");

  // Bob starts the job
  const startJobRes = await fetch(`${baseUrl}/api/jobs/${jobId}/start`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const startJobData = await startJobRes.json();
  if (!startJobData.success || startJobData.data.status !== "in_progress") {
    throw new Error("Start job failed");
  }

  // Alice receives JOB_STARTED notification
  const aliceStartNotif = await Notification.findOne({ recipient: regAlice.user.id, type: "JOB_STARTED" });
  if (!aliceStartNotif) throw new Error("Alice did not receive JOB_STARTED notification");
  console.log("✓ Bob started the job (status: in_progress). Alice notified");

  // Bob completes the job
  const compJobRes = await fetch(`${baseUrl}/api/jobs/${jobId}/complete`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const compJobData = await compJobRes.json();
  if (!compJobData.success || compJobData.data.status !== "completed") {
    throw new Error("Complete job failed");
  }

  // Alice receives JOB_COMPLETED notification
  const aliceCompNotif = await Notification.findOne({ recipient: regAlice.user.id, type: "JOB_COMPLETED" });
  if (!aliceCompNotif) throw new Error("Alice did not receive JOB_COMPLETED notification");
  console.log("✓ Bob completed the job (status: completed). Alice notified to review\n");

  // ----------------------------------------------------
  // STEP 6: MESSAGING MODULE
  // ----------------------------------------------------
  console.log("--- STEP 6: MESSAGING SYSTEM ---");

  // Alice initiates conversation with Bob
  const createConvRes = await fetch(`${baseUrl}/api/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aliceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId: regBob.user.id, jobId }),
  });
  const convData = await createConvRes.json();
  const convId = convData.data._id;

  // Alice sends message
  const sendMsgRes = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aliceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Hi Bob, thank you for coming quickly and doing such clean work!" }),
  });
  const sendMsgData = await sendMsgRes.json();
  const msgId = sendMsgData.data._id;

  // Bob receives NEW_MESSAGE notification
  const bobMsgNotif = await Notification.findOne({ recipient: regBob.user.id, type: "NEW_MESSAGE" });
  if (!bobMsgNotif) throw new Error("Bob did not receive NEW_MESSAGE notification");

  // Bob views messages
  const bobMsgsRes = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const bobMsgsData = await bobMsgsRes.json();
  if (bobMsgsData.count !== 1) throw new Error("Bob message count mismatch");

  // Bob marks message as read
  const markReadRes = await fetch(`${baseUrl}/api/conversations/messages/${msgId}/read`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const markReadData = await markReadRes.json();
  if (markReadData.data?.read !== true) throw new Error("Mark message as read failed");
  console.log("✓ Unified conversation & messaging verified: message sent, notified, received, and marked read\n");

  // ----------------------------------------------------
  // STEP 7: REVIEWS & RATINGS MODULE
  // ----------------------------------------------------
  console.log("--- STEP 7: REVIEWS & RATINGS ---");

  // Alice reviews Bob for the completed job
  const reviewRes = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aliceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId,
      rating: 5,
      comment: "Outstanding service! Fixed the leak completely and left the kitchen spotless.",
    }),
  });
  const reviewData = await reviewRes.json();
  if (!reviewData.success || reviewData.data.rating !== 5) throw new Error("Review creation failed");

  // Verify duplicate review is rejected (409)
  const dupReviewRes = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aliceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, rating: 4, comment: "Another review attempt" }),
  });
  if (dupReviewRes.status !== 409) throw new Error("Duplicate review was not rejected");

  // Verify Bob's rating & reviewCount synchronized in User model
  const bobAfterReview = await User.findById(regBob.user.id);
  if (bobAfterReview.providerProfile.rating !== 5 || bobAfterReview.providerProfile.reviewCount !== 1) {
    throw new Error("Provider rating synchronization failed");
  }

  // Public views Bob's reviews
  const bobReviewsRes = await fetch(`${baseUrl}/api/providers/${regBob.user.id}/reviews`);
  const bobReviewsData = await bobReviewsRes.json();
  if (bobReviewsData.count !== 1 || bobReviewsData.provider.rating !== 5) {
    throw new Error("Provider reviews endpoint failed");
  }
  console.log(`✓ Review created, duplicate blocked, provider rating updated to ${bobReviewsData.provider.rating} stars (${bobReviewsData.provider.reviewCount} review)\n`);

  // ----------------------------------------------------
  // STEP 8: NOTIFICATIONS MANAGEMENT
  // ----------------------------------------------------
  console.log("--- STEP 8: NOTIFICATIONS MANAGEMENT ---");

  // Bob checks notifications
  const bobNotifsRes = await fetch(`${baseUrl}/api/notifications`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const bobNotifsData = await bobNotifsRes.json();
  console.log(`✓ Bob has ${bobNotifsData.count} total notifications (${bobNotifsData.unreadCount} unread)`);

  // Bob marks all notifications as read
  const markAllRes = await fetch(`${baseUrl}/api/notifications/read-all`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const markAllData = await markAllRes.json();
  if (!markAllData.success) throw new Error("Mark all notifications read failed");

  // Check unread count is now 0
  const bobUnreadRes = await fetch(`${baseUrl}/api/notifications/unread`, {
    headers: { Authorization: `Bearer ${bobToken}` },
  });
  const bobUnreadData = await bobUnreadRes.json();
  if (bobUnreadData.count !== 0) throw new Error("Unread notifications should be 0");
  console.log("✓ Notifications marked all read successfully. Unread count: 0\n");

  // ----------------------------------------------------
  // STEP 9: ROOT ROUTE & 404 HANDLING
  // ----------------------------------------------------
  console.log("--- STEP 9: SYSTEM ENDPOINTS ---");
  const rootRes = await fetch(`${baseUrl}/`);
  const rootData = await rootRes.json();
  if (rootData.message !== "ArtisanLink API is running") throw new Error("Root route check failed");
  console.log(`✓ Root route GET /: "${rootData.message}"`);

  const notFoundRes = await fetch(`${baseUrl}/api/non-existent-route`);
  if (notFoundRes.status !== 404) throw new Error("404 handler failed");
  console.log("✓ Non-existent route returned HTTP 404 with clean JSON\n");

  console.log("==================================================");
  console.log("🎉 ALL ARTISANLINK BACKEND E2E WORKFLOW TESTS PASSED!");
  console.log("==================================================");

  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

runE2E().catch(async (err) => {
  console.error("Master E2E Test Failure:", err);
  if (server) server.close();
  await mongoose.disconnect();
  process.exit(1);
});
