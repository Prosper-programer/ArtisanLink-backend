const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const providerRoutes = require("./src/routes/provider.routes");
const adminRoutes = require("./src/routes/admin.routes");
const serviceRoutes = require("./src/routes/service.routes");
const serviceRequestRoutes = require("./src/routes/serviceRequest.routes");
const providerRequestRoutes = require("./src/routes/providerRequest.routes");
const jobRoutes = require("./src/routes/job.routes");
const conversationRoutes = require("./src/routes/message.routes");
const reviewRoutes = require("./src/routes/review.routes");
const notificationRoutes = require("./src/routes/notification.routes");
const professionRoutes = require("./src/routes/profession.routes");
const locationRoutes = require("./src/routes/location.routes");

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./src/config/database");

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
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
app.use("/api/professions", professionRoutes);
app.use("/api/location", locationRoutes);

// Test root route
app.get("/", (req, res) => {
  res.json({
    message: "ArtisanLink API is running",
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();