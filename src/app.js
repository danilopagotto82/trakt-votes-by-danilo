import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createAddon } from "./addon.js";
import { storeToken, getToken } from "./redis.js";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7000;

// Necessário para trabalhar com __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir arquivos estáticos da pasta "public" (fora de src)
app.use(express.static(path.join(__dirname, "../public")));

// Rota principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// Rota de autenticação com o Trakt
app.get("/auth", (req, res) => {
  const redirectUri = process.env.TRAKT_REDIRECT_URI;
  const clientId = process.env.TRAKT_CLIENT_ID;
  const traktAuthUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  res.redirect(traktAuthUrl);
});

// Rota de callback do Trakt
app.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.sendFile(path.join(__dirname, "../public", "error.html"));
  }

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
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const tokenData = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };

    // Salva token no Redis
    const userId = state || "default";
    await storeToken(userId, tokenData);
    console.log(`Token salvo para userId: ${userId}`);

    // Redireciona para página de sucesso
    res.sendFile(path.join(__dirname, "../public", "success.html"));
  } catch (err) {
    console.error("Erro callback Trakt:", err.message);
    res.sendFile(path.join(__dirname, "../public", "error.html"));
  }
});

// Inicia o addon
const addon = createAddon(process.env.ADDON_BASE_URL);
console.log("Addon iniciado");

// Start server
app.listen(PORT, () => {
  console.log(`Addon listening on port ${PORT}`);
});
