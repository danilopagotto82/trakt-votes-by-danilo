import fetch from "node-fetch";
import { TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TRAKT_REDIRECT_URI } from "./config.js";
import { saveTokenForUser, getTokenForUser } from "./redis.js";

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForToken(code, userId) {
  const resp = await fetch("https://api.trakt.tv/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      redirect_uri: TRAKT_REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.message || "Failed exchanging code");

  // Trakt returns { access_token, refresh_token, expires_in, scope, created_at }
  const expires_at_unix = Math.floor(Date.now() / 1000) + (data.expires_in || 86400);
  const obj = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at_unix };
  await saveTokenForUser(userId, obj);
  return obj;
}

/**
 * Refresh token
 */
export async function refreshTokenIfNeeded(userId) {
  const tokenObj = await getTokenForUser(userId);
  if (!tokenObj) return null;
  const nowUnix = Math.floor(Date.now() / 1000);
  // If token will expire within next 30 seconds, refresh
  if ((tokenObj.expires_at_unix || 0) - nowUnix > 30) {
    return tokenObj;
  }

  // Refresh
  const resp = await fetch("https://api.trakt.tv/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: tokenObj.refresh_token,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      redirect_uri: TRAKT_REDIRECT_URI,
      grant_type: "refresh_token"
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    // failed to refresh
    throw new Error(data?.message || "Failed to refresh token");
  }

  const expires_at_unix = Math.floor(Date.now() / 1000) + (data.expires_in || 86400);
  const obj = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at_unix };
  await saveTokenForUser(userId, obj);
  return obj;
}

/**
 * Post rating to trakt
 * type = "movie" or "show"
 * imdbId = "tt12345"
 * rating = integer 1..10
 */
export async function postRating(userId, type, imdbId, rating) {
  const tokenObj = await refreshTokenIfNeeded(userId);
  if (!tokenObj) throw new Error("No token for user");
  const accessToken = tokenObj.access_token;

  const url = "https://api.trakt.tv/sync/ratings";
  const payload = {};
  if (type === "movie") {
    payload.movies = [{ ids: { imdb: imdbId }, rating }];
  } else {
    // trakt expects shows for show rating (ratings/ shows accept ids.imdb for shows)
    payload.shows = [{ ids: { imdb: imdbId }, rating }];
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_CLIENT_ID,
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error || JSON.stringify(data));
  }
  return data;
}

/**
 * Get user's rating for one imdb id (type movie or show)
 * Trakt does not offer a dedicated read-per-item endpoint for ratings; we'll request ratings list for the type and search.
 */
export async function getUserRatingForItem(userId, type, imdbId) {
  const tokenObj = await refreshTokenIfNeeded(userId);
  if (!tokenObj) return null;
  const accessToken = tokenObj.access_token;

  // GET /sync/ratings/movies?extended=full - returns array, we must search for imdbId
  const pathType = type === "movie" ? "movies" : "shows";
  const url = `https://api.trakt.tv/sync/ratings/${pathType}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "trakt-api-version": "2",
      "trakt-api-key": TRAKT_CLIENT_ID,
      "Authorization": `Bearer ${accessToken}`
    }
  });
  if (!resp.ok) {
    return null; // silently null
  }
  const arr = await resp.json();
  // arr elements have .movie or .show fields and .rating
  for (const item of arr) {
    const ids = (item.movie?.ids || item.show?.ids || {});
    if (ids.imdb === imdbId) {
      return item.rating; // 1..10
    }
  }
  return null;
}
