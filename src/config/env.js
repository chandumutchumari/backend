const path = require("path");
const dotenv = require("dotenv");

// Load .env in local development; cloud platforms inject env vars directly.
// dotenv does not override variables already set in the environment.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DEFAULT_LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];

function parseCommaSeparated(value) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const fromEnv = [
    ...parseCommaSeparated(process.env.CORS_ORIGINS),
    ...parseCommaSeparated(process.env.FRONTEND_URL),
    ...parseCommaSeparated(process.env.FRONTEND_URLS),
  ];

  return [...new Set([...DEFAULT_LOCAL_ORIGINS, ...fromEnv])];
}

module.exports = {
  PORT: Number(process.env.PORT) || 5000,
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",
  getAllowedOrigins,
};
