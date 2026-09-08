/**
 * Official ArtisanLink professions and their allowed specializations taxonomy.
 */
const PROFESSIONS_DATA = {
  Plumber: [
    "Pipe Installation",
    "Pipe Repair",
    "Drainage Repair",
    "Leak Detection",
  ],
  Electrician: [
    "House Wiring",
    "Electrical Installation",
    "Electrical Repair",
    "Lighting Installation",
  ],
  Carpenter: [
    "Furniture Making",
    "Door Installation",
    "Cabinet Making",
    "Furniture Repair",
  ],
  Painter: [
    "Interior Painting",
    "Exterior Painting",
    "Wall Finishing",
  ],
};

/**
 * Returns list of all available profession names.
 */
const getAvailableProfessions = () => Object.keys(PROFESSIONS_DATA);

/**
 * Returns allowed specializations for a given profession.
 */
const getSpecializationsForProfession = (profession) => {
  if (!profession) return [];
  const canonical = getCanonicalProfession(profession);
  return canonical ? PROFESSIONS_DATA[canonical] : [];
};

/**
 * Returns the exact casing/canonical name of a profession (case-insensitive matching).
 * Returns null if profession is not recognized.
 */
const getCanonicalProfession = (profession) => {
  if (!profession || typeof profession !== "string") return null;
  const match = Object.keys(PROFESSIONS_DATA).find(
    (p) => p.toLowerCase() === profession.trim().toLowerCase()
  );
  return match || null;
};

/**
 * Checks whether a profession is valid.
 */
const isValidProfession = (profession) => {
  return getCanonicalProfession(profession) !== null;
};

/**
 * Validates that all given specializations are allowed for the given profession.
 * Returns { valid: Boolean, message?: String, normalizedSpecializations: [String] }
 */
const validateSpecializations = (profession, specializations) => {
  const canonical = getCanonicalProfession(profession);
  if (!canonical) {
    return {
      valid: false,
      message: `Invalid profession: "${profession}". Available professions: ${getAvailableProfessions().join(", ")}`,
      normalizedSpecializations: [],
    };
  }

  if (!specializations || !Array.isArray(specializations) || specializations.length === 0) {
    return {
      valid: true,
      normalizedSpecializations: [],
    };
  }

  const allowed = PROFESSIONS_DATA[canonical];
  const normalized = [];

  for (const spec of specializations) {
    if (typeof spec !== "string") {
      return {
        valid: false,
        message: `Specialization must be a string`,
        normalizedSpecializations: [],
      };
    }

    const matchedAllowed = allowed.find(
      (a) => a.toLowerCase() === spec.trim().toLowerCase()
    );

    if (!matchedAllowed) {
      return {
        valid: false,
        message: `"${spec}" is not an available specialization for ${canonical}. Available specializations: ${allowed.join(", ")}`,
        normalizedSpecializations: [],
      };
    }

    if (!normalized.includes(matchedAllowed)) {
      normalized.push(matchedAllowed);
    }
  }

  return {
    valid: true,
    normalizedSpecializations: normalized,
  };
};

module.exports = {
  PROFESSIONS_DATA,
  getAvailableProfessions,
  getSpecializationsForProfession,
  getCanonicalProfession,
  isValidProfession,
  validateSpecializations,
};
