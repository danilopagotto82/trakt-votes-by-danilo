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
    webview: false
  }
};

// Criar o builder do addon
const builder = new addonBuilder(manifest);

// Aqui você pode definir como o addon vai responder às requisições “meta” e “stream”
// (podemos completar isso depois com a integração do Trakt)

builder.defineManifestHandler(() => manifest);

// Exporta o addon corretamente
export const addon = builder.getInterface();
