import { Pool } from "pg";

let pool: Pool | null = null;

function readInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getDbPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (!pool) {
    const config = {
      connectionString: process.env.DATABASE_URL,
      max: readInt("PG_POOL_MAX", 10),
      idleTimeoutMillis: readInt("PG_IDLE_TIMEOUT_MS", 30_000),
      connectionTimeoutMillis: readInt("PG_CONNECTION_TIMEOUT_MS", 5_000),
      maxLifetimeSeconds: readInt("PG_MAX_LIFETIME_SECONDS", 60),
    };
    pool = new Pool(config);
  }
  return pool;
}
