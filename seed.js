// seed.js
// This script adds dummy equipment to the database using local image paths.

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

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
    imageURL: "/images/equipment/camera1.jpg", // Local Path
    rentalTerms: "Must provide ID. Late returns incur extra charges.",
    status: "approved",
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
    imageURL: "/images/equipment/backhoe.jpg", // Local Path
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
    imageURL: "/images/equipment/camera2.jpg", // Local Path
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
    imageURL: "/images/equipment/tractor.jpg", // Local Path
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
    
    // Clear old data so the broken links are removed
    await Equipment.deleteMany(); 
    
    await Equipment.insertMany(dummyEquipment);
    console.log("✅ Dummy equipment inserted with local images!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error inserting data:", err);
    process.exit(1);
  }
};

seedDB();