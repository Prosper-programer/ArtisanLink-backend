const express = require("express");
const {
  getAddressSuggestions,
  geocodeLocation,
  reverseGeocodeLocation,
} = require("../controllers/location.controller");

const router = express.Router();

router.get("/autocomplete", getAddressSuggestions);
router.get("/geocode", geocodeLocation);
router.get("/reverse", reverseGeocodeLocation);

module.exports = router;
