// scripts/sync-indexes.js
// Creates the indexes declared in the Mongoose schemas.
// Run after schema changes / before a production deploy:
//   npm run sync-indexes
const connectDB = require("../config/db");
const { disconnectDB } = require("../config/db");
const models = {
  User: require("../models/user.model"),
  Equipment: require("../models/equipment.model"),
  Booking: require("../models/booking.model"),
  Favorite: require("../models/favorite.model"),
  Payment: require("../models/payment.model"),
};

const run = async () => {
  await connectDB();

  for (const [name, model] of Object.entries(models)) {
    // createIndexes() is additive: it never drops indexes owned by BetterAuth
    // on the shared `user` collection. Mongoose 9 does not return a list, so
    // there is nothing to count here.
    await model.createIndexes();
    console.log(`✅ ${name}: indexes ensured`);
  }

  await disconnectDB();
  console.log("✅ Index synchronization complete");
};

run().catch(async (error) => {
  console.error("❌ Index synchronization failed:", error.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
