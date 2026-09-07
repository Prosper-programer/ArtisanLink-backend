const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const providerRoutes = require("./src/routes/provider.routes");

const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./src/config/database");



dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());


app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/providers", providerRoutes);
// Connect to MongoDB
connectDB();

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "ArtisanLink API is running"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});