const express = require("express");
const {
  getAddressSuggestions,
  geocodeLocation,
} = require("../controllers/location.controller");

const router = express.Router();

router.get("/autocomplete", getAddressSuggestions);
router.get("/geocode", geocodeLocation);

module.exports = router;
