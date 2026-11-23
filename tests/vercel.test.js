// Simulates the Vercel serverless entry point (VERCEL=1, production mode).
// Spawned as a separate process by tests/run-all.js because config is cached.
const {
  loadEnvironment,
  startJwksServer,
  signToken,
  startApp,
  makeClient,
  createReporter,
  cleanDatabase,
} = require("./helpers");

const testInfo = loadEnvironment("vercel", { vercel: true });

const run = async () => {
  const reporter = createReporter();
  const { check } = reporter;

  console.log(`\n▶ Vercel entry smoke test (db: ${testInfo.dbName})`);

  const jwks = await startJwksServer();
  process.env.BETTER_AUTH_URL = jwks.url;

  const mongoose = require("mongoose");
  const connectDB = require("../config/db");
  const { disconnectDB } = require("../config/db");
  const User = require("../models/user.model");
  const Equipment = require("../models/equipment.model");
  const config = require("../config/env");

  // Vercel's zero-config Express preset runs the app exported by the root
  // index.js as a single function and preserves the request path.
  const app = require("../index");
  const vercelConfig = require("../vercel.json");
  const server = await startApp(app);
  const client = makeClient(server.base);

  let exitCode = 0;

  try {
    check("root index.js exports an Express handler", typeof app === "function");
    check(
      "vercel.json does not rewrite the API path",
      !(vercelConfig.rewrites || []).some(
        (rewrite) => rewrite.source === "/(.*)" || String(rewrite.destination) === "/api"
      ),
      vercelConfig.rewrites
    );
    check(
      "vercel.json excludes .env from the function bundle",
      String(vercelConfig.functions?.["index.js"]?.excludeFiles || "").includes(".env")
    );
    check(
      "vercel.json configures the function duration",
      vercelConfig.functions?.["index.js"]?.maxDuration === 30
    );


    check("production mode is active", config.isProduction === true);
    check("Vercel mode is detected", config.isVercel === true);

    await connectDB();
    await cleanDatabase(mongoose.connection);

    const user = await User.create({
      _id: "vercel_customer_1",
      name: "Vercel Customer",
      email: "vercel@test.local",
      role: "customer",
      emailVerified: true,
      createdAt: new Date(),
    });

    await Equipment.create({
      name: "Vercel Test Camera",
      description: "Equipment used by the serverless smoke test.",
      category: "Photography Equipment",
      location: "Test City",
      price: 10,
      rentalType: "Daily",
      availableQuantity: 1,
      imageURL: "/images/equipment/test.jpg",
      status: "approved",
      ownerId: "vercel_owner_1",
      ownerName: "Vercel Owner",
      ownerEmail: "vercel-owner@test.local",
    });

    const root = await client("GET", "/");
    check("root liveness returns 200", root.status === 200, root.status);
    check("liveness is served without DB work", root.body?.status === "ok");
    check("request id header present", Boolean(root.header("x-request-id")));

    const health = await client("GET", "/api/health");
    check("health endpoint returns 200", health.status === 200, health.body);
    check("health reports connected", health.body?.database === "connected");

    const all = await client("GET", "/api/equipment");
    check("public catalogue works through the Vercel entry", all.status === 200 && all.body?.total === 1);

    const token = await signToken(jwks.privateKey, user);
    const me = await client("GET", "/api/users/me", { token });
    check("authenticated route works through the Vercel entry", me.status === 200 && me.body?.user?.email === user.email);

    const corsOk = await client("GET", "/api/equipment", { origin: "http://localhost:3001" });
    check("configured origin is allowed", corsOk.status === 200);
    check(
      "CORS header is returned",
      corsOk.header("access-control-allow-origin") === "http://localhost:3001"
    );

    const corsBad = await client("GET", "/api/equipment", { origin: "https://evil.example" });
    check("unknown origin is rejected", corsBad.status === 403);

    const missing = await client("GET", "/nope");
    check("404 is JSON", missing.status === 404 && missing.body?.message === "Route not found");

    const badJson = await client("POST", "/api/bookings", {
      body: "{broken",
      contentType: "application/json",
    });
    check("malformed JSON returns 400", badJson.status === 400);

    // Force an unexpected error to prove production responses do not leak
    // internals while still carrying a request id.
    const originalFind = Equipment.find;
    Equipment.find = () => {
      throw new Error("super-secret-internal-detail");
    };
    const failure = await client("GET", "/api/equipment");
    Equipment.find = originalFind;

    check("unexpected errors return 500", failure.status === 500, failure.status);
    check("500 does not leak internal details", !failure.text.includes("super-secret"));
    check("500 body is generic", failure.body?.message === "Internal server error");
    check("500 includes a request id", Boolean(failure.body?.requestId));
  } catch (error) {
    console.error("\n💥 Vercel smoke test crashed:", error);
    exitCode = 1;
  } finally {
    if (!reporter.summary("Vercel entry smoke test")) exitCode = 1;

    try {
      await cleanDatabase(mongoose.connection);
      console.log(`🧹 Cleaned test database ${testInfo.dbName}`);
    } catch (error) {
      console.error("⚠️ Could not clean test database:", error.message);
      exitCode = 1;
    }

    await disconnectDB().catch(() => {});
    await server.close();
    await jwks.close();
  }

  process.exit(exitCode);
};

run().catch((error) => {
  console.error("💥 Fatal Vercel smoke error:", error);
  process.exit(1);
});
