// Shared helpers for the integration tests (plain Node, no test framework).
const path = require("path");
const http = require("http");
const { generateKeyPair, exportJWK, SignJWT } = require("jose");
//labib
// Load the real .env so we can reuse the Atlas cluster, but point every test at
// a throwaway database and a local fake JWKS server.
const loadEnvironment = (label, { vercel = false } = {}) => {
  require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

  const base = process.env.MONGODB_URI;
  if (!base) throw new Error("MONGODB_URI is missing from .env");

  const url = new URL(base);
  const dbName = `rt_test_${label}`
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 38);
  url.pathname = `/${dbName}`;

  process.env.MONGODB_URI = url.toString();
  process.env.CLIENT_URL = "http://localhost:3000,http://localhost:3001";
  process.env.NODE_ENV = vercel ? "production" : "test";
  process.env.VERCEL = vercel ? "1" : "";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_test_secret";
  if (vercel) process.env.FORCE_DNS_OVERRIDE = "true";

  return { uri: url.toString(), dbName };
};

const listen = (server) =>
  new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

// Fake BetterAuth JWKS endpoint backed by an in-memory RSA key pair.
const startJwksServer = async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
  });
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const server = http.createServer((req, res) => {
    if (req.url === "/api/auth/jwks") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await listen(server);
  return {
    privateKey,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const signToken = (privateKey, user, extra = {}) =>
  new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    ...extra,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(String(user._id))
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

const startApp = async (app) => {
  const server = http.createServer(app);
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
};

// Tiny fetch wrapper with JSON helpers.
const makeClient = (base) => async (method, route, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.origin) headers.origin = options.origin;

  let body;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.body !== undefined) {
    body = options.body;
    if (options.contentType) headers["content-type"] = options.contentType;
  }

  const response = await fetch(`${base}${route}`, { method, headers, body });
  const text = await response.text();

  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Keep the raw text for non-JSON responses.
  }

  const header = (name) => response.headers.get(name);

  return { status: response.status, body: parsed, text, header };
};

const createReporter = () => {
  let passed = 0;
  const failures = [];

  const check = (name, condition, details) => {
    if (condition) {
      passed += 1;
      console.log(`  ✅ ${name}`);
    } else {
      failures.push({ name, details });
      console.error(`  ❌ ${name}`, details === undefined ? "" : details);
    }
  };

  const summary = (suite) => {
    console.log(`\n${suite}: ${passed} passed, ${failures.length} failed`);
    if (failures.length) {
      console.error(JSON.stringify(failures, null, 2));
    }
    return failures.length === 0;
  };

  return { check, summary };
};

const closeHttp = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });

// Atlas users commonly have readWrite but not dbAdmin, so dropDatabase fails.
// Emptying every collection is sufficient and leaves indexes intact.
const cleanDatabase = async (connection) => {
  if (!connection || !connection.db) return;
  const collections = await connection.db.collections();
  for (const collection of collections) {
    try {
      await collection.deleteMany({});
    } catch (error) {
      console.warn(`⚠️ Could not clean ${collection.collectionName}: ${error.message}`);
    }
  }
};

module.exports = {
  loadEnvironment,
  startJwksServer,
  signToken,
  startApp,
  makeClient,
  createReporter,
  closeHttp,
  cleanDatabase,
};
