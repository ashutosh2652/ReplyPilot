import { createClient } from "redis";
import IORedis from "ioredis";
import { env } from "./env.js";
import logger from "../utils/logger.js";


// Node-redis (sessions + caching)
const redis = createClient({
  url: env.REDIS_URL.trim(),
});

redis.on("connect", () => logger.info("Redis (node-redis) connected"));
redis.on("error", (err) => logger.error("Redis error", err.message));
redis.on("reconnecting", () => logger.warn("Redis reconnecting"));

await redis.connect();

// Parse REDIS_QUEUE_URL for IORedis
const queueUrl = new URL(env.REDIS_QUEUE_URL.trim());

// ioredis (BullMQ)
export const bullConnection = new IORedis({
  host: queueUrl.hostname,
  port: parseInt(queueUrl.port),
  password: queueUrl.password,
  maxRetriesPerRequest: null,
});

bullConnection.on("connect", () =>
  logger.info("Redis (ioredis) connected for BullMQ")
);
bullConnection.on("error", (err) =>
  logger.error("ioredis error", err.message)
);

// Keys
export const keys = {
  ytAccessToken: (userId) => `yt:access_token:${userId}`,
  ytTokenExpiry: (userId) => `yt:token_expiry:${userId}`,
  channelCache: (channelId) => `cache:channel:${channelId}`,
  videoCache: (videoId) => `cache:video:${videoId}`,
  session: (sessionId) => `session:${sessionId}`,
};

export default redis;
