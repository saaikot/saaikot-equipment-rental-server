// Verifies JWTs issued by BetterAuth using its JWKS (JSON Web Key Set) endpoint.
const { createRemoteJWKSet, jwtVerify } = require("jose");
const User = require("../models/user.model");

// Fetch public keys from the Next.js BetterAuth endpoint.
// BETTER_AUTH_URL must point to your Next.js app that hosts BetterAuth. For local development, it might be http://localhost:3001.

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
);

// 1. verifyToken: Verifies the JWT and attaches the user to req.user
const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;
    if (!token) return res.status(401).json({ message: "No token provided" });

    // Verify token signature using the public keys (JWKS)
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.BETTER_AUTH_URL,
      audience: process.env.BETTER_AUTH_URL,
    });

    // payload.sub contains the BetterAuth user ID
    const userId = payload.sub || payload.id;
    if (!userId) return res.status(401).json({ message: "Invalid token payload" });

    // Fetch user from DB to get their current role
    const user = await User.findById(userId).lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    // Attach user info to the request object
    req.user = { id: user._id, role: user.role, email: user.email, name: user.name };
    next();
  } catch (err) {
    console.error("JWT Verification Error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// 2. verifyRenter: Only customers can proceed
const verifyRenter = (req, res, next) => {
  if (req.user?.role !== "customer") {
    return res.status(403).json({ message: "Customer access only" });
  }
  next();
};

// 3. verifyOwner: Only owners can proceed
const verifyOwner = (req, res, next) => {
  if (req.user?.role !== "owner") {
    return res.status(403).json({ message: "Owner access only" });
  }
  next();
};

// 4. verifyAdmin: Only admins can proceed
const verifyAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
};

module.exports = { verifyToken, verifyRenter, verifyOwner, verifyAdmin };