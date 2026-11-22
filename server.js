// server.js
// Local entry point: starts the HTTP listener for the Express app.
// Vercel does not use this file; it runs index.js as a serverless function.
const dns = require("dns");

// Windows/Node can fail to resolve MongoDB Atlas SRV records with the system
// resolver, so force Google DNS locally. Vercel's resolver works as-is.
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./index");

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  });
