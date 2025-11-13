import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT || 7000;
export const ADDON_BASE_URL = process.env.ADDON_BASE_URL || `http://localhost:${PORT}`;
export const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
export const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;
export const TRAKT_REDIRECT_URI = process.env.TRAKT_REDIRECT_URI || `${ADDON_BASE_URL}/callback`;
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
  console.warn("⚠️ TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET are required in env vars.");
}
if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.warn("⚠️ UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in env vars.");
}
