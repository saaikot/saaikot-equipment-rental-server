// Centralised 404 + error handling.
// Controllers forward errors here with next(err), which keeps internal Mongo /
// Stripe details out of production responses while still logging them.
const config = require("../config/env");

const notFoundHandler = (req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
    requestId: req.id,
  });
};

// Map known error shapes to appropriate HTTP status codes.
const classify = (err) => {
  if (err.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400)) {
    return { status: 400, message: "Invalid JSON payload" };
  }
  if (err.type === "entity.too.large") {
    return { status: 413, message: "Request payload is too large" };
  }
  if (err.name === "ValidationError" && err.errors) {
    return {
      status: 400,
      message: Object.values(err.errors)
        .map((item) => item.message)
        .join(", "),
    };
  }
  if (err.name === "CastError") {
    return { status: 400, message: "Invalid identifier or field value" };
  }
  if (err.code === 11000) {
    return { status: 409, message: "Resource already exists" };
  }
  if (err.code === "PAYMENT_NOT_CONFIGURED") {
    return { status: 503, message: err.message };
  }
  if (typeof err.type === "string" && err.type.startsWith("Stripe")) {
    return { status: 502, message: "Payment provider error" };
  }

  const status = Number(err.status || err.statusCode);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return { status, message: err.message || "Request failed" };
  }

  return { status: 500, message: "Internal server error" };
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const { status, message } = classify(err);

  if (status >= 500) {
    console.error(`❌ [${req.id || "-"}] ${req.method} ${req.originalUrl}`, err);
  } else {
    console.warn(`⚠️ [${req.id || "-"}] ${req.method} ${req.originalUrl}: ${message}`);
  }

  const body = { message, requestId: req.id };
  // Surface the underlying message for 5xx only outside production.
  if (status >= 500 && !config.isProduction && err.message) {
    body.error = err.message;
  }

  res.status(status).json(body);
};

module.exports = { notFoundHandler, errorHandler };
