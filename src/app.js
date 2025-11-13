import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { addon } from "./addon.js";
import { storeToken, getToken } from "./redis.js";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7000;

// Necessário para trabalhar com __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servir os arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, "public")));

// Rota principal (renderiza o index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Rota para autenticação com o Trakt
app.get("/auth", (req, res) => {
  const redirectUri = process.env.TRAKT_REDIRECT_URI;
  const clientId = process.env.TRAKT_CLIENT_ID;
  const traktAuthUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  res.redirect(traktAuthUrl);
});

// Rota de callback (Trakt redireciona pra cá após login)
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.sendFile(path.join(__dirname, "public", "error.html"));
  }

  try {
    const response = await axios.post("https://api.trakt.tv/oauth/token", {
      code,
      client_id: process.env.TRAKT_CLIENT_ID,
      client_secret: process.env.TRAKT_CLIENT_SECRET,
      redirect_uri: process.env.TRAKT_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const { access_token } = response.data;
    await storeToken("main_user", access_token);
    res.sendFile(path.join(__dirname, "public", "success.html"));
  } catch (error) {
    console.error(error.response?.data || error);
    res.sendFile(path.join(__dirname, "public", "error.html"));
  }
});

// Rota do Manifest (Stremio)
app.get("/manifest.json", (req, res) => {
  res.json(addon.manifest);
});

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Addon listening on port ${PORT}`);
});
