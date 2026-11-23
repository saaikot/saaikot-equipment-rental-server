// Shared domain constants.
// Keeping the allowed values in one place prevents the models, controllers and
// validation helpers from drifting apart.

const USER_ROLES = ["customer", "owner", "admin"];

const EQUIPMENT_CATEGORIES = [
  "Construction Equipment",
  "Photography Equipment",
  "Vehicles & Transportation",
  "Agriculture Equipment",
  "Electronics",
  "Event Equipment",
];

const RENTAL_TYPES = ["Daily", "Weekly", "Monthly"];

const EQUIPMENT_STATUSES = ["pending", "approved", "rejected"];

const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"];

const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];

const PAYMENT_RECORD_STATUSES = ["succeeded", "failed", "refunded"];

// Bookings that still hold a claim on equipment stock.
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

module.exports = {
  USER_ROLES,
  EQUIPMENT_CATEGORIES,
  RENTAL_TYPES,
  EQUIPMENT_STATUSES,
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_RECORD_STATUSES,
  ACTIVE_BOOKING_STATUSES,
};
