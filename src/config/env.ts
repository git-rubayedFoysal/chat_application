import type { CookieOptions } from "express";
import createError from "http-errors";
import type { SignOptions } from "jsonwebtoken";

// Validate configuration at startup and fail fast: a missing secret or an
// invalid port would otherwise surface later as a confusing runtime error.
const PORT = Number(process.env.PORT);
const MONGO_URI = process.env.Mongo_URI;
const COOKIE_SECRET = process.env.COOKIE_SECRET;
const NODE_ENV = process.env.NODE_ENV;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = process.env.JWT_EXPIRATION;
const COOKIE_NAME = process.env.COOKIE_NAME;
const COOKIE_MAX_AGE = Number(process.env.COOKIE_MAX_AGE);

if (
  !process.env.PORT ||
  !Number.isSafeInteger(PORT) ||
  PORT <= 0 ||
  PORT > 65535
) {
  throw createError(
    500,
    "Invalid PORT. Must be a valid port number (1-65535).",
  );
}

if (!MONGO_URI || typeof MONGO_URI !== "string" || MONGO_URI.trim() === "") {
  throw createError(500, "Mongo_URI is missing or empty.");
}

if (
  !COOKIE_SECRET ||
  typeof COOKIE_SECRET !== "string" ||
  COOKIE_SECRET.trim() === ""
) {
  throw createError(500, "COOKIE_SECRET is missing or empty.");
}

if (!NODE_ENV || !["development", "production", "test"].includes(NODE_ENV)) {
  throw createError(
    500,
    "Invalid NODE_ENV. Must be 'development', 'production', or 'test'.",
  );
}

if (!JWT_SECRET) {
  throw createError(500, "JWT_SECRET is missing.");
}

if (!JWT_EXPIRATION) {
  throw createError(500, "JWT_EXPIRATION is missing.");
}

if (!COOKIE_NAME) {
  throw createError(500, "COOKIE_NAME is missing.");
}

if (
  !process.env.COOKIE_MAX_AGE ||
  !Number.isSafeInteger(COOKIE_MAX_AGE) ||
  COOKIE_MAX_AGE <= 0
) {
  throw createError(500, "Invalid COOKIE_MAX_AGE. Must be a positive integer.");
}

export const env = {
  PORT,
  MONGO_URI,
  COOKIE_SECRET,
  NODE_ENV: NODE_ENV as "development" | "production" | "test",
  JWT_SECRET,
  JWT_EXPIRATION: JWT_EXPIRATION as NonNullable<SignOptions["expiresIn"]>,
  COOKIE_NAME,
  COOKIE_MAX_AGE: COOKIE_MAX_AGE as NonNullable<CookieOptions["maxAge"]>,
};
