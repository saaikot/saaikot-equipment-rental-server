// Request-scoped helpers: request id + a sanitizer for JSON bodies.
const crypto = require("crypto");

// Attach a correlation id to every request/response. It appears in logs and in
// error responses, which makes 500/504 reports from the frontend debuggable.
const requestId = (req, res, next) => {
  const incoming = req.headers["x-request-id"];
  const safeIncoming =
    typeof incoming === "string" && incoming.length <= 100 ? incoming : "";
  req.id = safeIncoming || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
};

// Recursively remove Mongo operators (`$`) and prototype-pollution keys from
// request bodies. Express 5's default query parser already yields strings, but
// JSON bodies can contain nested objects.
const sanitizeValue = (value, depth = 0) => {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, depth + 1));
  if (typeof value !== "object") return value;

  const clean = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (key.startsWith("$") || key.includes(".")) continue;
    clean[key] = sanitizeValue(nested, depth + 1);
  }
  return clean;
};

const sanitizeRequest = (req, res, next) => {
  // Buffers belong to the Stripe webhook (raw body) and must not be touched.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    req.body = sanitizeValue(req.body);
  }
  next();
};

module.exports = { requestId, sanitizeRequest, sanitizeValue };
