import express from "express";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import { ADDON_BASE_URL, PORT, TRAKT_CLIENT_ID, TRAKT_REDIRECT_URI } from "./config.js";
import { exchangeCodeForToken, postRating, getUserRatingForItem } from "./trakt.js";
import { saveTokenForUser, getTokenForUser, deleteTokenForUser } from "./redis.js";
import { createAddon } from "./addon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

// ========== Utility: /start
// Purpose: ensure userId is set in a cookie and redirect to desired target.
// Example: /start?redirect=/authorize   or /start?redirect=/vote/movie/tt123/8
app.get("/start", (req, res) => {
  const redirect = req.query.redirect || "/";
  let userId = req.cookies?.userId;
  // Note: Express doesn't parse cookies by default; we'll roll a tiny check from header
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map(s => {
    const [k, ...v] = s.split("=");
    if (!k) return [];
    return [k.trim(), v.join("=").trim()];
  }).filter(Boolean));
  userId = cookies.userId || uuidv4();
  // Set cookie
  res.setHeader("Set-Cookie", `userId=${userId}; Path=/; HttpOnly; SameSite=Lax`);
  // append userId to redirect if not present
  const url = new URL(redirect, ADDON_BASE_URL);
  if (!url.searchParams.get("user")) url.searchParams.set("user", userId);
  return res.redirect(url.toString());
});

// ========== OAuth: redirect user to Trakt authorize URL
app.get("/authorize", (req, res) => {
  const user = req.query.user;
  const state = user || uuidv4();
  const url = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(TRAKT_REDIRECT_URI)}&state=${state}`;
  return res.redirect(url);
});

// ========== Callback: Trakt sends code and state
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state; // this is our userId
  if (!code) {
    return res.sendFile(path.join(__dirname, "..", "public", "error.html"));
  }
  try {
    await exchangeCodeForToken(code, state);
    return res.sendFile(path.join(__dirname, "..", "public", "success.html"));
  } catch (err) {
    console.error("Callback error:", err);
    return res.sendFile(path.join(__dirname, "..", "public", "error.html"));
  }
});

// ========== Vote route (used by cards)
// GET /vote/:type/:imdbId/:value?user={userId}
app.get("/vote/:type/:imdbId/:value", async (req, res) => {
  const { type, imdbId, value } = req.params;
  const userId = req.query.user;
  if (!userId) {
    // redirect to start to generate user and come back
    const redirect = `/vote/${type}/${imdbId}/${value}`;
    return res.redirect(`/start?redirect=${encodeURIComponent(redirect)}`);
  }
  try {
    await postRating(userId, type, imdbId, Number(value));
    return res.send(`<html><body><h2>Voto registrado: ${value}/10 para ${imdbId}</h2><p>Volte ao Stremio.</p></body></html>`);
  } catch (err) {
    console.error("Vote error:", err);
    return res.status(500).send(`<html><body><h2>Falha ao registrar voto</h2><pre>${err.message}</pre></body></html>`);
  }
});

// ========== Logout
app.get("/logout", async (req, res) => {
  const user = req.query.user;
  if (user) await deleteTokenForUser(user);
  res.send("<html><body><h2>Desconectado.</h2></body></html>");
});

// ========== Addon endpoints (manifest/meta/streams)
const addon = createAddon(ADDON_BASE_URL);
app.get("/manifest.json", (req, res) => {
  res.json(addon.manifest);
});

app.get("/meta/:type/:id.json", async (req, res) => {
  // Provide basic meta. We cannot know the user's identity here (Stremio doesn't provide it).
  const { type, id } = req.params; // id is like "tt0123456" or stremio id
  // If id isn't prefixed with tt, leave it as-is
  const imdbId = id.startsWith("tt") ? id : null;

  const meta = {
    id,
    type,
    name: `Título ${id}`,
    poster: "https://static.thenounproject.com/png/130311-200.png",
    overview: imdbId ? `Abra o card "Ver/Alterar voto" para ver sua nota no Trakt para ${imdbId}.` : `Este título não tem IMDb ID. Não é possível votar.`,
    imdb_id: imdbId || undefined
  };
  res.json({ meta });
});

app.get("/stream/:type/:id.json", async (req, res) => {
  // Returns cards: connect / vote / change vote
  // The client (Stremio) will open the urls in external browser (we set notWebSafe)
  const { type, id } = req.params;
  const imdbId = id.startsWith("tt") ? id : null;

  const streams = [];

  // Connect card
  streams.push({
    id: `connect-${id}`,
    name: "Conectar ao Trakt",
    type: "card",
    behaviorHints: { notWebSafe: true },
    description: "Conectar sua conta Trakt para votar (clique e autorize).",
    poster: "https://img.icons8.com/ios-filled/100/000000/trakt.png",
    externalUrl: `${ADDON_BASE_URL}/start?redirect=/authorize`
  });

  if (!imdbId) {
    streams.push({
      id: `no-imdb-${id}`,
      name: "Este título não tem IMDb ID",
      type: "card",
      behaviorHints: { notWebSafe: true },
      description: "Não é possível votar sem um IMDb ID.",
      poster: "https://img.icons8.com/ios-filled/100/000000/error.png",
      externalUrl: `${ADDON_BASE_URL}/start?redirect=/`
    });
  } else {
    // Voting cards (values from spec: good=8, medium=5, bad=2) - these will redirect to /start if needed
    streams.push({
      id: `vote-good-${id}`,
      name: "⭐ Votar: Bom",
      type: "card",
      behaviorHints: { notWebSafe: true },
      description: "Registra nota 8/10 no Trakt",
      poster: "https://img.icons8.com/emoji/96/000000/star-emoji.png",
      externalUrl: `${ADDON_BASE_URL}/start?redirect=/vote/movie/${imdbId}/8`
    });
    streams.push({
      id: `vote-medium-${id}`,
      name: "😐 Votar: Médio",
      type: "card",
      behaviorHints: { notWebSafe: true },
      description: "Registra nota 5/10 no Trakt",
      poster: "https://img.icons8.com/emoji/96/000000/neutral-face.png",
      externalUrl: `${ADDON_BASE_URL}/start?redirect=/vote/movie/${imdbId}/5`
    });
    streams.push({
      id: `vote-bad-${id}`,
      name: "👎 Votar: Ruim",
      type: "card",
      behaviorHints: { notWebSafe: true },
      description: "Registra nota 2/10 no Trakt",
      poster: "https://img.icons8.com/emoji/96/000000/thumbs-down.png",
      externalUrl: `${ADDON_BASE_URL}/start?redirect=/vote/movie/${imdbId}/2`
    });

    // Card to view current saved note: opens a small page that reads from Redis
    streams.push({
      id: `view-note-${id}`,
      name: "🔎 Ver/Alterar voto",
      type: "card",
      behaviorHints: { notWebSafe: true },
      description: "Ver sua nota atual no Trakt e alterá-la.",
      poster: "https://img.icons8.com/ios-filled/100/000000/show-property.png",
      externalUrl: `${ADDON_BASE_URL}/start?redirect=/view/${imdbId}`
    });
  }

  res.json({ streams });
});

// ========== small endpoint to view rating (browser UI)
app.get("/view/:imdbId", async (req, res) => {
  const imdbId = req.params.imdbId;
  // try cookie userId
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map(s => {
    const [k, ...v] = s.split("=");
    if (!k) return [];
    return [k.trim(), v.join("=").trim()];
  }).filter(Boolean));
  const userId = req.query.user || cookies.userId;
  if (!userId) {
    const redirect = `/view/${imdbId}`;
    return res.redirect(`/start?redirect=${encodeURIComponent(redirect)}`);
  }

  try {
    const rating = await getUserRatingForItem(userId, "movie", imdbId);
    return res.send(`<html><body>
      <h2>IMDb: ${imdbId}</h2>
      <p>Sua nota no Trakt: ${rating === null ? "Sem nota" : rating + "/10"}</p>
      <p><a href="/start?redirect=/vote/movie/${imdbId}/8">⭐ Votar Bom (8)</a></p>
      <p><a href="/start?redirect=/vote/movie/${imdbId}/5">😐 Votar Médio (5)</a></p>
      <p><a href="/start?redirect=/vote/movie/${imdbId}/2">👎 Votar Ruim (2)</a></p>
      <p><a href="${ADDON_BASE_URL}/logout?user=${userId}">Desconectar</a></p>
    </body></html>`);
  } catch (err) {
    console.error("View error:", err);
    return res.status(500).send(`<html><body><h2>Erro ao ler nota</h2><pre>${err.message}</pre></body></html>`);
  }
});

app.listen(PORT, () => {
  console.log(`Addon listening on port ${PORT}`);
});
