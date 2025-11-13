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

// SERVE ARQUIVOS ESTÁTICOS
app.use(express.static(path.join(__dirname, "public")));

// ROTA PRINCIPAL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// CALLBACK TRATKT
app.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.sendFile(path.join(__dirname, "public", "error.html"));

  try {
    const tokenResponse = await axios.post(
      "https://api.trakt.tv/oauth/token",
      {
        code,
        client_id: process.env.TRAKT_CLIENT_ID,
        client_secret: process.env.TRAKT_CLIENT_SECRET,
        redirect_uri: process.env.TRAKT_REDIRECT_URI,
        grant_type: "authorization_code",
      }
    );
    const tokenData = tokenResponse.data;

    const userId = state || "default"; // evita undefined
    await storeToken(userId, tokenData);

    res.sendFile(path.join(__dirname, "public", "success.html"));
  } catch (err) {
    console.error("Erro callback Trakt:", err);
    res.sendFile(path.join(__dirname, "public", "error.html"));
  }
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Addon listening on port ${PORT}`);
});
