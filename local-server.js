// local-server.js
// Local entry point: starts the HTTP listener for the Express app.
// Vercel does not use this file; its Express preset runs index.js as a function.
const config = require("./config/env");
const connectDB = require("./config/db");
const { disconnectDB } = require("./config/db");
const app = require("./index");

// Refuse to boot locally with an incomplete configuration, so problems surface
// here instead of as confusing 503 responses later.
if (config.required.length) {
  console.error(
    `❌ Cannot start: missing environment variables: ${config.required.join(", ")}`
  );
  process.exit(1);
}

const server = app.listen(config.port, () => {
  console.log(`✅ RentEasy API listening on http://localhost:${config.port}`);
  console.log(`   Allowed frontend origins: ${config.clientOrigins.join(", ")}`);
});

// Connect in parallel with listening so health checks can report progress.
connectDB().catch((error) => {
  console.error("❌ Initial MongoDB connection failed:", error.message);
  // Keep listening: the API returns 503 until the database becomes reachable,
  // which is preferable to crash-looping behind a process manager.
});

const shutdown = async (signal) => {
  console.log(`\n⚠️ ${signal} received, shutting down...`);
  server.close(async () => {
    try {
      await disconnectDB();
    } finally {
      process.exit(0);
    }
  });

  // Do not hang forever on open keep-alive sockets.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = server;
