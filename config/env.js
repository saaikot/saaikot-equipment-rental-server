// Central environment configuration.
// Loaded once (Node caches modules) so every entry point sees the same values
// and so validation/parsing happens in exactly one place.
const path = require("path");

// Load .env from the repository root regardless of the current working dir.
// Real environment variables (for example on Vercel) take precedence because
// dotenv never overwrites values that already exist.
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
const isProduction = process.env.NODE_ENV === "production" || isVercel;

// Accept a single origin or a comma separated list, normalising trailing slashes
// because the browser Origin header never includes one.
const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const clientOrigins = parseOrigins(process.env.CLIENT_URL);

// In development we allow the usual Next.js ports when CLIENT_URL is absent so
// `npm run dev` works out of the box. Production must be explicit.
if (!clientOrigins.length && !isProduction) {
  clientOrigins.push("http://localhost:3000", "http://localhost:3001");
}

const port = Number.parseInt(process.env.PORT, 10);

const config = {
  nodeEnv: process.env.NODE_ENV || (isProduction ? "production" : "development"),
  isProduction,
  isVercel,

  port: Number.isFinite(port) && port > 0 ? port : 5000,

  mongoUri: String(process.env.MONGODB_URI || "").trim(),

  betterAuthUrl: String(process.env.BETTER_AUTH_URL || "")
    .trim()
    .replace(/\/+$/, ""),

  clientOrigins,
  clientUrl: clientOrigins[0] || "",

  // Only allow *.vercel.app preview origins when explicitly enabled.
  allowVercelPreviews: process.env.ALLOW_VERCEL_PREVIEWS === "true",

  stripeSecretKey: String(process.env.STRIPE_SECRET_KEY || "").trim(),
  stripeWebhookSecret: String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(),

  // How long a serverless function may run (kept in sync with vercel.json).
  requestTimeoutMs: Number.parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 25000,
};

config.stripeConfigured = config.stripeSecretKey.startsWith("sk_");

// Required for the API to serve authenticated traffic.
config.required = [];
if (!config.mongoUri) config.required.push("MONGODB_URI");
if (!config.betterAuthUrl) config.required.push("BETTER_AUTH_URL");
if (!config.clientUrl) config.required.push("CLIENT_URL");

// Important but only needed for the payment endpoints.
config.paymentWarnings = [];
if (!config.stripeConfigured) config.paymentWarnings.push("STRIPE_SECRET_KEY");
if (!config.stripeWebhookSecret) {
  config.paymentWarnings.push("STRIPE_WEBHOOK_SECRET");
}

module.exports = config;
