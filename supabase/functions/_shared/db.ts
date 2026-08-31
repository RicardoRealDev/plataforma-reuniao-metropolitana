import postgres from "npm:postgres@3";
import { env } from "./env.ts";

// Pooler em modo transaction (Supavisor) — não suporta prepared statements.
export const sql = postgres(env.DB_POOL_URL, {
  prepare: false,
  ssl: "require",
});
