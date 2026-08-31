import { z } from "npm:zod@3";

const schema = z.object({
  DB_POOL_URL: z.string(),
  LIVEKIT_URL: z.string(),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  ADMIN_SEED_TOKEN: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().optional(),
  SHEETS_SYNC_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SHEETS_SHARE_WITH_EMAILS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
});

export const env = schema.parse({
  DB_POOL_URL: Deno.env.get("DB_POOL_URL"),
  LIVEKIT_URL: Deno.env.get("LIVEKIT_URL"),
  LIVEKIT_API_KEY: Deno.env.get("LIVEKIT_API_KEY"),
  LIVEKIT_API_SECRET: Deno.env.get("LIVEKIT_API_SECRET"),
  ADMIN_SEED_TOKEN: Deno.env.get("ADMIN_SEED_TOKEN"),
  GOOGLE_SERVICE_ACCOUNT_JSON: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"),
  GOOGLE_OAUTH_CLIENT_ID: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"),
  GOOGLE_OAUTH_CLIENT_SECRET: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET"),
  GOOGLE_OAUTH_REFRESH_TOKEN: Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN"),
  SHEETS_SYNC_ENABLED: Deno.env.get("SHEETS_SYNC_ENABLED"),
  SHEETS_SHARE_WITH_EMAILS: Deno.env.get("SHEETS_SHARE_WITH_EMAILS"),
});
