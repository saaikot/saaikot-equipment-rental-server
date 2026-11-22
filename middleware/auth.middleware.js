// server/middleware/auth.middleware.js
// Verifies JWTs issued by BetterAuth using its JWKS (JSON Web Key Set) endpoint.
const { createRemoteJWKSet, jwtVerify } = require("jose");
const User = require("../models/user.model");

// Fetch public keys from the Next.js BetterAuth endpoint.
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
);

// 1. verifyToken: Verifies the JWT and attaches the user to req.user
const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;
    
    // Check if token exists and isn't the string "undefined"
    if (!token || token === "undefined") {
      console.log("❌ [Auth Middleware] No token or token is undefined");
      return res.status(401).json({ message: "No token provided" });
    }

    // Verify token signature
    const { payload } = await jwtVerify(token, JWKS);

    // Extract ID and Email from the token payload
    const userId = payload.sub || payload.id || payload.userId;
    const userEmail = payload.email;

    // 1. Try to find the user by ID first
    let user = null;
    if (userId) {
      user = await User.findById(userId).lean();
    }

    // 2. If not found by ID, fallback to finding by Email
    // This is helpful because BetterAuth sometimes uses a different ID format
    if (!user && userEmail) {
      console.log("⚠️ User not found by ID, finding by email instead:", userEmail);
      user = await User.findOne({ email: userEmail }).lean();
    }

    if (!user) {
      console.log("❌ [Auth Middleware] User not found in DB. ID:", userId, "Email:", userEmail);
      return res.status(401).json({ message: "User not found in database" });
    }

    // Attach user info to the request object
    // Ensure the ID is converted to string to avoid type mismatch issues later
    req.user = { 
      id: user._id.toString(), 
      role: user.role, 
      email: user.email, 
      name: user.name 
    };
    
    next();
  } catch (err) {
    // Print the actual error to the backend terminal
    console.error("❌ [Auth Middleware] JWT Verification Failed:", err.message);
    
    // Send the actual error message to the frontend for debugging
    return res.status(401).json({ message: "Invalid token", error: err.message });
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