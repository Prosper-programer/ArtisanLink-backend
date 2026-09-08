const express = require("express");
const {
  PROFESSIONS_DATA,
  getAvailableProfessions,
  getSpecializationsForProfession,
  getCanonicalProfession,
} = require("../config/professions");

const router = express.Router();

/**
 * Get all available professions with their corresponding specializations.
 * GET /api/professions
 * Public endpoint for frontend selection pickers
 */
router.get("/", (req, res) => {
  const result = Object.entries(PROFESSIONS_DATA).map(([profession, specializations]) => ({
    profession,
    specializations,
  }));

  return res.status(200).json({
    success: true,
    count: result.length,
    data: result,
  });
});

/**
 * Get specializations for a specific profession.
 * GET /api/professions/:name/specializations
 */
router.get("/:name/specializations", (req, res) => {
  const canonical = getCanonicalProfession(req.params.name);

  if (!canonical) {
    return res.status(404).json({
      success: false,
      message: `Profession "${req.params.name}" not found. Available professions: ${getAvailableProfessions().join(", ")}`,
    });
  }

  const specializations = getSpecializationsForProfession(canonical);

  return res.status(200).json({
    success: true,
    profession: canonical,
    count: specializations.length,
    specializations,
  });
});

module.exports = router;
