/**
 * Middleware to restrict access to administrator users only.
 * Must be preceded by the protect (JWT auth) middleware.
 */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "administrator") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Administrator privileges required.",
    });
  }
  next();
};

module.exports = adminOnly;
