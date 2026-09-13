/**
 * Service for interacting with Geoapify Geocoding and Autocomplete APIs.
 */

// Fallback suggestions for development or offline testing when API key is not configured
const LOCAL_FALLBACK_SUGGESTIONS = [
  {
    formatted: "Bastos, Yaoundé, Centre, Cameroon",
    address: "Bastos",
    city: "Yaoundé",
    country: "Cameroon",
    coordinates: [11.518, 3.866],
  },
  {
    formatted: "Akwa, Douala, Littoral, Cameroon",
    address: "Akwa",
    city: "Douala",
    country: "Cameroon",
    coordinates: [9.7043, 4.0511],
  },
  {
    formatted: "Bonanjo, Douala, Littoral, Cameroon",
    address: "Bonanjo",
    city: "Douala",
    country: "Cameroon",
    coordinates: [9.689, 4.043],
  },
  {
    formatted: "Omnisports, Yaoundé, Centre, Cameroon",
    address: "Omnisports",
    city: "Yaoundé",
    country: "Cameroon",
    coordinates: [11.536, 3.878],
  },
  {
    formatted: "Mendong, Yaoundé, Centre, Cameroon",
    address: "Mendong",
    city: "Yaoundé",
    country: "Cameroon",
    coordinates: [11.482, 3.831],
  },
  {
    formatted: "Deido, Douala, Littoral, Cameroon",
    address: "Deido",
    city: "Douala",
    country: "Cameroon",
    coordinates: [9.715, 4.066],
  },
];

/**
 * Autocomplete address text using Geoapify API.
 * @param {string} text - Search query
 * @param {object} [options] - Optional country filter, limit, etc.
 */
const autocompleteAddress = async (text, options = {}) => {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const query = text.trim();
  const apiKey = process.env.GEOAPIFY_API_KEY;

  if (!apiKey || apiKey === "YOUR_GEOAPIFY_API_KEY") {
    // Return filtered fallback suggestions
    const qLower = query.toLowerCase();
    const matches = LOCAL_FALLBACK_SUGGESTIONS.filter(
      (s) =>
        s.formatted.toLowerCase().includes(qLower) ||
        s.address.toLowerCase().includes(qLower) ||
        s.city.toLowerCase().includes(qLower)
    );
    return matches.length > 0 ? matches : [
      {
        formatted: `${query}, Cameroon`,
        address: query,
        city: "Yaoundé",
        country: "Cameroon",
        coordinates: [11.5021, 3.848],
      },
    ];
  }

  try {
    const limit = options.limit || 5;
    const countryFilter = options.country ? `&filter=countrycode:${options.country}` : "";
    const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
      query
    )}&limit=${limit}${countryFilter}&apiKey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Geoapify API responded with status ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.features || !Array.isArray(data.features)) {
      return [];
    }

    return data.features.map((feature) => {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates || [props.lon, props.lat];

      return {
        formatted: props.formatted || `${props.address_line1 || ""}, ${props.city || ""}`,
        address: props.address_line1 || props.street || props.suburb || props.city || query,
        city: props.city || props.county || "",
        country: props.country || "Cameroon",
        coordinates: [Number(coords[0]), Number(coords[1])], // [longitude, latitude]
      };
    });
  } catch (error) {
    console.error("Geoapify autocomplete error:", error.message);
    return [];
  }
};

/**
 * Forward geocode an address to obtain GeoJSON coordinates using Geoapify API.
 * @param {string} text - Address query
 */
const geocodeAddress = async (text) => {
  if (!text || text.trim().length === 0) return null;

  const results = await autocompleteAddress(text, { limit: 1 });
  return results.length > 0 ? results[0] : null;
};

/**
 * Reverse geocode latitude and longitude into a formatted address using Geoapify API.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 */
const reverseGeocode = async (lat, lon) => {
  if (lat === undefined || lon === undefined) return null;

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey || apiKey === "YOUR_GEOAPIFY_API_KEY") {
    return {
      formatted: "Bastos, Yaoundé, Centre, Cameroon",
      address: "Bastos",
      city: "Yaoundé",
      country: "Cameroon",
      coordinates: [Number(lon), Number(lat)],
    };
  }

  try {
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Geoapify reverse geocoding error: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.features || data.features.length === 0) {
      return null;
    }

    const props = data.features[0].properties || {};
    return {
      formatted: props.formatted || `${props.address_line1 || ""}, ${props.city || ""}`,
      address: props.address_line1 || props.street || props.suburb || props.city || "Current Location",
      city: props.city || props.county || "Yaoundé",
      country: props.country || "Cameroon",
      coordinates: [Number(lon), Number(lat)],
    };
  } catch (error) {
    console.error("Geoapify reverse geocode error:", error.message);
    return null;
  }
};

module.exports = {
  autocompleteAddress,
  geocodeAddress,
  reverseGeocode,
};
