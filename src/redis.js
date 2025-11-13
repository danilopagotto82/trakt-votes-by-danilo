// src/redis.js
import { Redis } from "@upstash/redis";

// Cria a conexão com o Upstash Redis usando as variáveis de ambiente
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Salva os tokens do Trakt para um userId
 * @param {string} userId
 * @param {object} tokenData - { accessToken, refreshToken, expiresAt }
 */
export async function storeToken(userId, tokenData) {
  try {
    await redis.set(`trakt:${userId}`, JSON.stringify(tokenData));
    console.log(`Token salvo para userId: ${userId}`);
  } catch (err) {
    console.error("Erro ao salvar token no Redis:", err);
  }
}

/**
 * Recupera os tokens do Trakt para um userId
 * @param {string} userId
 * @returns {object|null} tokenData
 */
export async function getToken(userId) {
  try {
    const data = await redis.get(`trakt:${userId}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Erro ao buscar token no Redis:", err);
    return null;
  }
}

/**
 * Remove os tokens do Redis para um userId
 * @param {string} userId
 */
export async function deleteToken(userId) {
  try {
    await redis.del(`trakt:${userId}`);
    console.log(`Token removido para userId: ${userId}`);
  } catch (err) {
    console.error("Erro ao deletar token no Redis:", err);
  }
}
