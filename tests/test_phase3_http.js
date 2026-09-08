const mongoose = require("mongoose");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
dotenv.config();

const serviceRoutes = require("../src/routes/service.routes");
const Service = require("../src/models/service");
const User = require("../src/models/user");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/services", serviceRoutes);

let server;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for Phase 3 tests");

  await Service.deleteMany({});

  const port = 5056;
  server = app.listen(port);
  const baseUrl = `http://localhost:${port}`;

  const adminToken = jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), role: "administrator" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const customerToken = jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 1. Customer tries to create service -> 403
  const failCreate = await fetch(`${baseUrl}/api/services`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${customerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Carpentry",
      profession: "Carpenter",
      category: "Woodwork",
      description: "Custom wood furniture and repairs",
    }),
  });
  console.log("1. Customer creating service status:", failCreate.status);
  if (failCreate.status !== 403) throw new Error("Customer should get 403 on service creation");

  // 2. Admin creates Plumbing service
  const create1 = await fetch(`${baseUrl}/api/services`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Plumbing Installation & Repair",
      profession: "Plumber",
      category: "Plumbing",
      description: "Complete residential and commercial plumbing solutions",
    }),
  });
  const data1 = await create1.json();
  console.log("2. Admin created service 1:", data1.success, data1.data?.profession);
  if (!data1.success || data1.data.profession !== "Plumber") throw new Error("Service creation failed");

  // 3. Admin creates Electrical service
  const create2 = await fetch(`${baseUrl}/api/services`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Electrical Maintenance",
      profession: "Electrician",
      category: "Electrical",
      description: "Wiring, circuit breaker fixes, lighting installation",
    }),
  });
  const data2 = await create2.json();
  console.log("3. Admin created service 2:", data2.success, data2.data?.name);

  // 4. Public lists all services
  const listRes = await fetch(`${baseUrl}/api/services`);
  const listData = await listRes.json();
  console.log("4. Public list count:", listData.count);
  if (listData.count !== 2) throw new Error("Expected 2 services");

  // 5. Search services by keyword "plumb"
  const searchRes = await fetch(`${baseUrl}/api/services?search=plumb`);
  const searchData = await searchRes.json();
  console.log("5. Search 'plumb' count:", searchData.count);
  if (searchData.count !== 1 || searchData.data[0].profession !== "Plumber") {
    throw new Error("Search functionality failed");
  }

  // 6. Get single service by ID
  const singleRes = await fetch(`${baseUrl}/api/services/${data1.data._id}`);
  const singleData = await singleRes.json();
  console.log("6. Single service lookup:", singleData.data.name);
  if (singleData.data.name !== data1.data.name) throw new Error("Single service lookup failed");

  // 7. Update service
  const updateRes = await fetch(`${baseUrl}/api/services/${data1.data._id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Updated description for plumbing solutions",
    }),
  });
  const updateData = await updateRes.json();
  console.log("7. Update service description:", updateData.data.description);
  if (!updateData.data.description.includes("Updated")) throw new Error("Service update failed");

  // 8. Soft deactivate service
  const deleteRes = await fetch(`${baseUrl}/api/services/${data2.data._id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const deleteData = await deleteRes.json();
  console.log("8. Deactivate service:", deleteData.data.isActive);
  if (deleteData.data.isActive !== false) throw new Error("Soft delete failed");

  // 9. Active list should now only contain 1 service
  const activeList = await fetch(`${baseUrl}/api/services`);
  const activeData = await activeList.json();
  console.log("9. Active services count after deactivation:", activeData.count);
  if (activeData.count !== 1) throw new Error("Deactivated service should not appear in active list");

  console.log("\nALL PHASE 3 SERVICES TESTS PASSED PERFECTLY!\n");

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
