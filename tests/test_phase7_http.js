const mongoose = require("mongoose");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
dotenv.config();

const conversationRoutes = require("../src/routes/message.routes");
const User = require("../src/models/user");
const Conversation = require("../src/models/conversation");
const Message = require("../src/models/message");
const Notification = require("../src/models/notification");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/conversations", conversationRoutes);

let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Phase 7 Messaging tests");

  await User.deleteMany({});
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  await Notification.deleteMany({});

  const port = 5058;
  server = app.listen(port);
  const baseUrl = `http://localhost:${port}`;

  const hash = await require("bcryptjs").hash("pass123", 10);

  // Users
  const userA = await User.create({
    fullName: "Customer Alice",
    phoneNumber: "237697000001",
    email: "alice@msg.test",
    password: hash,
    role: "customer",
  });
  const tokenA = jwt.sign({ userId: userA._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  const userB = await User.create({
    fullName: "Provider Bob",
    phoneNumber: "237697000002",
    email: "bob@msg.test",
    password: hash,
    role: "customer",
    providerProfile: {
      profession: "Plumber",
      isProvider: true,
      isVerified: true,
      verificationStatus: "approved",
    },
  });
  const tokenB = jwt.sign({ userId: userB._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  const userC = await User.create({
    fullName: "Intruder Charlie",
    phoneNumber: "237697000003",
    email: "charlie@msg.test",
    password: hash,
    role: "customer",
  });
  const tokenC = jwt.sign({ userId: userC._id.toString(), role: "customer" }, process.env.JWT_SECRET);

  // 1. Cannot chat with self
  const selfRes = await fetch(`${baseUrl}/api/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId: userA._id }),
  });
  console.log("1. Self chat status:", selfRes.status);
  if (selfRes.status !== 400) throw new Error("Self-chat should return 400");

  // 2. Alice starts conversation with Bob
  const startRes = await fetch(`${baseUrl}/api/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId: userB._id }),
  });
  const startData = await startRes.json();
  console.log("2. Conversation created:", startData.success, startData.data?.participants?.length);
  if (!startData.success || startData.data.participants.length !== 2) throw new Error("Failed to create conversation");
  const convId = startData.data._id;

  // 3. Duplicate start returns same conversation
  const dupRes = await fetch(`${baseUrl}/api/conversations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipientId: userA._id }),
  });
  const dupData = await dupRes.json();
  console.log("3. Existing conversation retrieved:", dupData.data._id === convId);
  if (dupData.data._id !== convId) throw new Error("Duplicate conversation created instead of reusing existing");

  // 4. Alice sends message
  const msgRes = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Hello Bob, are you available tomorrow?" }),
  });
  const msgData = await msgRes.json();
  console.log("4. Message sent:", msgData.success, msgData.data?.content);
  if (!msgData.success || !msgData.data.content) throw new Error("Failed to send message");
  const messageId = msgData.data._id;

  // 5. Check Bob received notification
  const bobNotif = await Notification.findOne({ recipient: userB._id, type: "NEW_MESSAGE" });
  console.log("5. Bob received notification:", bobNotif?.type, bobNotif?.title);
  if (!bobNotif) throw new Error("NEW_MESSAGE notification missing");

  // 6. Bob reads messages
  const getMsgsRes = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const getMsgsData = await getMsgsRes.json();
  console.log("6. Bob retrieved messages count:", getMsgsData.count);
  if (getMsgsData.count !== 1) throw new Error("Message count mismatch");

  // 7. Bob marks message as read
  const readRes = await fetch(`${baseUrl}/api/conversations/messages/${messageId}/read`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const readData = await readRes.json();
  console.log("7. Bob marks message read:", readData.data?.read);
  if (readData.data?.read !== true) throw new Error("Mark as read failed");

  // 8. Alice tries to mark her own sent message read -> fails 400
  const failRead = await fetch(`${baseUrl}/api/conversations/messages/${messageId}/read`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  console.log("8. Sender mark own message read status:", failRead.status);
  if (failRead.status !== 400) throw new Error("Sender should not be able to mark own message as read");

  // 9. Charlie (unrelated third party) tries to view messages -> 403
  const intruderRes = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, {
    headers: { Authorization: `Bearer ${tokenC}` },
  });
  console.log("9. Intruder access status:", intruderRes.status);
  if (intruderRes.status !== 403) throw new Error("Intruder should get 403");

  // 10. Alice lists conversations
  const listConvRes = await fetch(`${baseUrl}/api/conversations`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const listConvData = await listConvRes.json();
  console.log("10. Alice conversation list count:", listConvData.count);
  if (listConvData.count !== 1) throw new Error("Conversation list failed");

  console.log("\nALL PHASE 7 MESSAGING TESTS PASSED PERFECTLY!\n");

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
