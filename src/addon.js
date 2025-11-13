// src/addon.js
import { addonBuilder } from "stremio-addon-sdk";

const manifest = {
  id: "org.trakt.votes.danilo",
  version: "1.0.0",
  name: "Trakt Votes by Danilo",
  description: "Votar em títulos (Bom/Médio/Ruim) e registrar no Trakt",
  resources: ["manifest", "meta", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
  behaviorHints: {
    configurable: false,
    webview: false,
  },
};

export function createAddon() {
  const builder = new addonBuilder(manifest);
  return builder;
}

export { manifest };
