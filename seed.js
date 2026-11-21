// seed.js
// This script adds dummy equipment to the database for testing purposes.
require("dotenv").config();
const mongoose = require("mongoose");
const Equipment = require("./models/equipment.model");

const dummyEquipment = [
  {
    name: "Canon EOS R5 Camera",
    description: "Professional mirrorless camera with 45MP sensor. Perfect for photography and videography.",
    category: "Photography Equipment",
    location: "New York, USA",
    price: 50,
    rentalType: "Daily",
    availableQuantity: 3,
    condition: "Excellent",
    brand: "Canon",
    imageURL: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=1000&auto=format&fit=crop",
    rentalTerms: "Must provide ID. Late returns incur extra charges.",
    status: "approved", // We set this to approved so it shows up publicly
    ownerId: "dummy_owner_id_1",
    ownerName: "John Owner",
    ownerEmail: "owner@example.com",
  },
  {
    name: "JCB 3CX Backhoe Loader",
    description: "Versatile construction equipment for digging and lifting. Well maintained.",
    category: "Construction Equipment",
    location: "Texas, USA",
    price: 300,
    rentalType: "Daily",
    availableQuantity: 2,
    condition: "Good",
    brand: "JCB",
    imageURL: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=1000&auto=format&fit=crop",
    rentalTerms: "Operator must have valid license.",
    status: "approved",
    ownerId: "dummy_owner_id_2",
    ownerName: "BuildCorp",
    ownerEmail: "build@example.com",
  },
  {
    name: "Sony A7III",
    description: "Full-frame mirrorless camera. Includes 24-70mm lens.",
    category: "Photography Equipment",
    location: "California, USA",
    price: 150,
    rentalType: "Weekly",
    availableQuantity: 5,
    condition: "Excellent",
    brand: "Sony",
    imageURL: "https://images.unsplash.com/photo-1516724562728-afc824a36e84?q=80&w=1000&auto=format&fit=crop",
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
    imageURL: "https://images.unsplash.com/photo-1592982537447-6f2a6a0c7c14?q=80&w=1000&auto=format&fit=crop",
    rentalTerms: "Fuel not included.",
    status: "approved",
    ownerId: "dummy_owner_id_3",
    ownerName: "FarmFresh",
    ownerEmail: "farm@example.com",
  }
];

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await Equipment.insertMany(dummyEquipment);
    console.log("✅ Dummy equipment inserted successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error inserting data:", err);
    process.exit(1);
  }
};

seedDB();