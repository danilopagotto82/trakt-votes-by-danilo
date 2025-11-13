import { Redis } from "@upstash/redis";
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from "./config.js";

export const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

// helpers
export async function saveTokenForUser(userId, tokenObj) {
  // tokenObj: { access_token, refresh_token, expires_at_unix }
  const key = `trakt:${userId}`;
  await redis.set(key, JSON.stringify(tokenObj));
  // optional: set TTL larger than Refresh token life so it persists
  return true;
}

export async function getTokenForUser(userId) {
  const key = `trakt:${userId}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function deleteTokenForUser(userId) {
  const key = `trakt:${userId}`;
  await redis.del(key);
  return true;
}
