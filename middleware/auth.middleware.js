// Verifies BetterAuth-issued JWTs against the client's JWKS endpoint.
const { createRemoteJWKSet, jwtVerify } = require("jose");
const config = require("../config/env");
const User = require("../models/user.model");

// Lazily initialise the remote key set. Building a URL from a missing env var
// at module load would crash the entire function before it can answer requests.
let jwks = null;

const getJwks = () => {
  if (!config.betterAuthUrl) {
    const error = new Error("Authentication service is not configured on the server");
    error.status = 503;
    throw error;
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${config.betterAuthUrl}/api/auth/jwks`), {
      cooldownDuration: 30000,
      cacheMaxAge: 10 * 60 * 1000,
    });
  }
  return jwks;
};

const extractBearerToken = (header) => {
  if (typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  const trimmed = token.trim();
  return trimmed && trimmed !== "undefined" && trimmed !== "null" ? trimmed : null;
};

// 1. verifyToken: verify the signature, load the user and attach req.user.
const verifyToken = async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      clockTolerance: 30,
    });

    const rawUserId = payload.sub || payload.id || payload.userId;
    const userId = rawUserId ? String(rawUserId) : "";
    const userEmail =
      typeof payload.email === "string" ? payload.email.toLowerCase().trim() : "";

    let user = null;
    if (userId) {
      user = await User.findById(userId)
        .select("_id name email role")
        .lean();
    }

    // BetterAuth installations occasionally issue a different id shape, so fall
    // back to the (already signature-verified) email claim.
    if (!user && userEmail) {
      user = await User.findOne({ email: userEmail })
        .select("_id name email role")
        .lean();
    }

    if (!user) {
      return res.status(401).json({ message: "User account not found" });
    }

    req.user = {
      id: String(user._id),
      role: user.role || "customer",
      email: user.email,
      name: user.name,
    };
    req.auth = payload;

    return next();
  } catch (error) {
    // Configuration errors must not masquerade as an invalid user token.
    if (error.status === 503) return next(error);

    // Expired/invalid tokens are routine traffic (stale browser sessions), so
    // this is a warning rather than an error. The reason is never returned.
    console.warn(
      `⚠️ [Auth ${req.id || "-"}] JWT verification failed: ${error.message}`
    );
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// 2. requireRole: reusable role guard.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: "You do not have access to this resource" });
  }
  return next();
};

const verifyRenter = requireRole("customer");
const verifyOwner = requireRole("owner");
const verifyAdmin = requireRole("admin");

module.exports = {
  verifyToken,
  requireRole,
  verifyRenter,
  verifyOwner,
  verifyAdmin,
};
