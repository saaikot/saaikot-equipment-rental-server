// seed.js
// Adds demo equipment without deleting existing data. Safe to run repeatedly:
// entries are upserted by name.
const connectDB = require("./config/db");
const { disconnectDB } = require("./config/db");
const Equipment = require("./models/equipment.model");

const dummyEquipment = [
  {
    name: "Canon EOS R5 Camera",
    description:
      "Professional mirrorless camera with a 45MP sensor. Perfect for photography and videography.",
    category: "Photography Equipment",
    location: "New York, USA",
    price: 50,
    rentalType: "Daily",
    availableQuantity: 3,
    condition: "Excellent",
    brand: "Canon",
    imageURL: "/images/equipment/camera1.jpg",
    rentalTerms: "Must provide ID. Late returns incur extra charges.",
    status: "approved",
    ownerId: "dummy_owner_id_1",
    ownerName: "John Owner",
    ownerEmail: "owner@example.com",
  },
  {
    name: "JCB 3CX Backhoe Loader",
    description:
      "Versatile construction equipment for digging and lifting. Well maintained.",
    category: "Construction Equipment",
    location: "Texas, USA",
    price: 300,
    rentalType: "Daily",
    availableQuantity: 2,
    condition: "Good",
    brand: "JCB",
    imageURL: "/images/equipment/backhoe.jpg",
    rentalTerms: "Operator must have a valid license.",
    status: "approved",
    ownerId: "dummy_owner_id_2",
    ownerName: "BuildCorp",
    ownerEmail: "build@example.com",
  },
  {
    name: "Sony A7III",
    description: "Full-frame mirrorless camera. Includes a 24-70mm lens.",
    category: "Photography Equipment",
    location: "California, USA",
    price: 150,
    rentalType: "Weekly",
    availableQuantity: 5,
    condition: "Excellent",
    brand: "Sony",
    imageURL: "/images/equipment/camera2.jpg",
    rentalTerms: "Any damage will be charged.",
    status: "approved",
    ownerId: "dummy_owner_id_1",
    ownerName: "John Owner",
    ownerEmail: "owner@example.com",
  },
  {
    name: "John Deere Tractor",
    description: "Powerful agricultural tractor for farming needs.",
    category: "Agriculture Equipment",
    location: "Iowa, USA",
    price: 400,
    rentalType: "Weekly",
    availableQuantity: 1,
    condition: "Good",
    brand: "John Deere",
    imageURL: "/images/equipment/tractor.jpg",
    rentalTerms: "Fuel is not included.",
    status: "approved",
    ownerId: "dummy_owner_id_3",
    ownerName: "FarmFresh",
    ownerEmail: "farm@example.com",
  },
];

const seedDB = async () => {
  try {
    await connectDB();

    const operations = dummyEquipment.map((item) => ({
      updateOne: {
        filter: { name: item.name, ownerId: item.ownerId },
        update: { $set: item },
        upsert: true,
      },
    }));

    const result = await Equipment.bulkWrite(operations);
    console.log(
      `✅ Seed complete: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`
    );

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error.message);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
};

seedDB();
