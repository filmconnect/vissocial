// ============================================================
// db.ts — PostgreSQL connection pool
// ============================================================
// FIX: Added SSL support for Neon database in production.
// Neon requires SSL connections — without this, ALL worker jobs fail with:
//   "connection is insecure (try using sslmode=require)"
// ============================================================

import pg from "pg";
import { config } from "./config";

const { Pool } = pg;

// Detect production environment
const IS_PRODUCTION =
  process.env.NODE_ENV === "production" ||
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.VERCEL;

// Detect Neon database (URL contains neon.tech or neondb)
const isNeon =
  config.dbUrl?.includes("neon.tech") ||
  config.dbUrl?.includes("neondb");

// Enable SSL for production or Neon databases
const sslConfig = IS_PRODUCTION || isNeon
  ? { rejectUnauthorized: false }
  : false;

export const pool = new Pool({
  connectionString: config.dbUrl,
  ssl: sslConfig,
});

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
