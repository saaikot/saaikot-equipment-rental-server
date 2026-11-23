// MongoDB connection helper with serverless-safe caching.
const dns = require("dns");
const mongoose = require("mongoose");
const config = require("./env");

// Some local networks have broken DNS resolution for Atlas SRV records.
// Only apply the workaround outside Vercel; overriding resolvers on Vercel adds
// latency and is unnecessary there. Tests that emulate Vercel locally can opt
// back in with FORCE_DNS_OVERRIDE (real deployments never set it).
const shouldOverrideDns =
  process.env.FORCE_DNS_OVERRIDE === "true" ||
  (!config.isVercel && process.env.SKIP_DNS_OVERRIDE !== "true");

if (shouldOverrideDns) {
  try {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
  } catch (error) {
    console.warn("⚠️ Could not override DNS servers:", error.message);
  }
}

// Mongoose is configured once per process.
mongoose.set("strictQuery", true);

let cachedPromise = null;

const connectionOptions = {
  // Fail fast so the API returns 503 before the platform hits its 504 timeout.
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  // Serverless-friendly pool settings.
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,
  retryWrites: true,
  // Do not queue operations for 10s while disconnected; the middleware always
  // awaits a connection first, so failures surface immediately.
  bufferCommands: false,
  // Index creation is a deployment task (npm run sync-indexes), not a cold-start
  // task. Development keeps autoIndex so local schemas stay in sync.
  autoIndex: !config.isProduction,
};

mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB connected");
});

mongoose.connection.on("error", (error) => {
  console.error("❌ MongoDB connection error:", error.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected");
});

const connectDB = async () => {
  // Reuse a live connection (the common case inside a warm lambda).
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!config.mongoUri) {
    const error = new Error("MONGODB_URI is not configured on the server");
    error.status = 503;
    throw error;
  }

  // Share the in-flight connection promise between concurrent requests.
  if (cachedPromise) {
    // A resolved promise whose connection has since dropped must be replaced.
    if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
      cachedPromise = null;
    } else {
      return cachedPromise;
    }
  }

  cachedPromise = mongoose
    .connect(config.mongoUri, connectionOptions)
    .then((instance) => instance)
    .catch((error) => {
      // Clear the cache so a later request can retry after a transient outage.
      cachedPromise = null;
      throw error;
    });

  return cachedPromise;
};

// Used by scripts/tests to release the socket cleanly.
const disconnectDB = async () => {
  cachedPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
