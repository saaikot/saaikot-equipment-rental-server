// Lazily created Stripe client.
// Instantiating Stripe at module load crashes the whole serverless function if
// the key is missing, so creation is deferred until a payment route is used.
const Stripe = require("stripe");
const config = require("../config/env");

let stripeClient = null;

// Thrown errors carry `status` so the global error handler can return 503
// instead of a generic 500 when the integration is not configured.
const configurationError = (message) => {
  const error = new Error(message);
  error.status = 503;
  error.code = "PAYMENT_NOT_CONFIGURED";
  return error;
};

const getStripe = () => {
  if (!config.stripeConfigured) {
    throw configurationError(
      "Payment provider is not configured. Set STRIPE_SECRET_KEY on the server."
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.stripeSecretKey, {
      // Keep individual calls well below the platform timeout so the client
      // receives a JSON error instead of a 504 from the gateway.
      timeout: 10000,
      maxNetworkRetries: 1,
      appInfo: {
        name: "RentEasy API",
        version: "1.0.0",
      },
    });
  }

  return stripeClient;
};

module.exports = { getStripe };
