import postgres from "npm:postgres@3";
import { env } from "./env.ts";

// Pooler em modo transaction (Supavisor) — não suporta prepared statements.
export const sql = postgres(env.DB_POOL_URL, {
  prepare: false,
  ssl: "require",
  // Edge Functions podem criar várias instâncias em paralelo. O pool padrão
  // do postgres.js abre até 10 conexões por instância e esgota rapidamente o
  // limite do Supavisor durante uma sequência de chamadas da reunião.
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});
