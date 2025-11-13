// src/app.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createAddon } from "./addon.js";
import { storeToken, getToken, deleteToken } from "./redis.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7000;

// Trabalhar com __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, "public")));

// Cria o addon
const addon = createAddon(process.env.ADDON_BASE_URL);

// Rota principal (index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Rota de autenticação com Trakt
app.get("/auth", (req, res) => {
  const redirectUri = process.env.TRAKT_REDIRECT_URI;
  const clientId = process.env.TRAKT_CLIENT_ID;

  let userId = req.query.user;
  if (!userId) {
    userId = uuidv4(); // cria ID se não existir
  }

  const traktAuthUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${userId}`;
  res.redirect(traktAuthUrl);
});

// Callback do Trakt
app.get("/callback", async (req, res) => {
  const { code, state: userId } = req.query;

  try {
    const response = await axios.post(
      "https://api.trakt.tv/oauth/token",
      {
        code,
        client_id: process.env.TRAKT_CLIENT_ID,
        client_secret: process.env.TRAKT_CLIENT_SECRET,
        redirect_uri: process.env.TRAKT_REDIRECT_URI,
        grant_type: "authorization_code",
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const tokenData = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    await storeToken(userId, tokenData);

    res.sendFile(path.join(__dirname, "public", "success.html"));
  } catch (err) {
    console.error("Erro no callback do Trakt:", err.message);
    res.sendFile(path.join(__dirname, "public", "error.html"));
  }
});

// Logout
app.get("/logout", async (req, res) => {
  const userId = req.query.user;
  if (userId) {
    await deleteToken(userId);
  }
  res.send("Logout realizado com sucesso!");
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Addon listening on port ${PORT}`);
});
