// Small, dependency-free validation helpers.
// They are intentionally strict about types: accepting objects here would allow
// Mongo query operators to reach Mongoose filters (NoSQL injection).
const mongoose = require("mongoose");

const isPlainString = (value) => typeof value === "string";

const isNonEmptyString = (value, maxLength = 5000) =>
  isPlainString(value) && value.trim().length > 0 && value.length <= maxLength;

// Trim and bound a string; non-strings become an empty string.
const cleanString = (value, maxLength = 5000) =>
  isPlainString(value) ? value.trim().slice(0, maxLength) : "";

const isValidObjectId = (value) =>
  isPlainString(value) && mongoose.isValidObjectId(value);

const toFiniteNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toInteger = (value) => {
  const number = toFiniteNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
};

const toPositiveInteger = (value) => {
  const number = toInteger(value);
  return number !== null && number > 0 ? number : null;
};

// Escape user input before passing it to a MongoDB regular expression.
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!isPlainString(value) || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Clamp pagination values so a malicious limit cannot exhaust memory.
const parsePagination = (page, limit, maxLimit = 100) => {
  const parsedPage = toPositiveInteger(page);
  const parsedLimit = toPositiveInteger(limit);
  return {
    page: parsedPage ? Math.min(parsedPage, 10000) : 1,
    limit: parsedLimit ? Math.min(parsedLimit, maxLimit) : 9,
  };
};

// Throw a 400 error with a safe, human readable message.
const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

module.exports = {
  isNonEmptyString,
  cleanString,
  isValidObjectId,
  toFiniteNumber,
  toInteger,
  toPositiveInteger,
  escapeRegex,
  parseDate,
  roundMoney,
  parsePagination,
  badRequest,
};
