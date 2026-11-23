// Runs the integration suite and then the Vercel-entry smoke test in separate
// processes (environment/config is cached per process).
const { spawnSync } = require("child_process");
const path = require("path");

const files = ["api.test.js", "vercel.test.js"];

for (const file of files) {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, file)], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`\n❌ ${file} failed`);
    process.exit(result.status || 1);
  }
}

console.log("\n✅ All test suites passed");
