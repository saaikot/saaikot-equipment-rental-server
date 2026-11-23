// Local development entry point. Vercel imports index.js directly.
require("dotenv").config();

const app = require("./index");

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, () => {
  console.log(`RentEasy API running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error("Failed to start local server:", error);
  process.exitCode = 1;
});
