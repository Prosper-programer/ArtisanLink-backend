const { autocompleteAddress, geocodeAddress, reverseGeocode } = require("../services/geoapify.service");

/**
 * Autocomplete address queries using Geoapify API.
 * GET /api/location/autocomplete?text=bastos&country=cm
 * Public or Authenticated
 */
const getAddressSuggestions = async (req, res) => {
  try {
    const { text, country, limit } = req.query;

    if (!text || text.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'text' is required",
      });
    }

    const suggestions = await autocompleteAddress(text, {
      country: country || "cm", // Default to Cameroon
      limit: limit ? Number(limit) : 5,
    });

    return res.status(200).json({
      success: true,
      count: suggestions.length,
      data: suggestions,
    });
  } catch (error) {
    console.error("Location autocomplete error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while autocompleting address",
    });
  }
};

/**
 * Geocode an address to obtain coordinates and formatted address.
 * GET /api/location/geocode?text=Bastos+Yaounde
 * Public or Authenticated
 */
const geocodeLocation = async (req, res) => {
  try {
    const { text } = req.query;

    if (!text || text.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'text' is required",
      });
    }

    const result = await geocodeAddress(text);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Location geocode error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while geocoding address",
    });
  }
};

/**
 * Reverse geocode latitude and longitude coordinates.
 * GET /api/location/reverse?lat=3.866&lon=11.518
 */
const reverseGeocodeLocation = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (lat === undefined || lon === undefined) {
      return res.status(400).json({
        success: false,
        message: "Query parameters 'lat' and 'lon' are required",
      });
    }

    const result = await reverseGeocode(Number(lat), Number(lon));

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Location not found for the given coordinates",
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Location reverse geocode error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while reverse geocoding coordinates",
    });
  }
};

module.exports = {
  getAddressSuggestions,
  geocodeLocation,
  reverseGeocodeLocation,
};
