import { z } from "npm:zod@3";

const schema = z.object({
  DB_POOL_URL: z.string(),
  LIVEKIT_URL: z.string(),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  ADMIN_SEED_TOKEN: z.string().optional(),
  AUTH_TOKEN_PEPPER: z.string().min(32),
  GOVBR_CLIENT_ID: z.string(),
  GOVBR_CLIENT_SECRET: z.string(),
  GOVBR_REDIRECT_URI: z.string().url(),
  GOVBR_FRONTEND_URL: z.string().url(),
  GOVBR_BASE_URL: z.string().url().default("https://sso.staging.acesso.gov.br"),
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
  AUTH_TOKEN_PEPPER: Deno.env.get("AUTH_TOKEN_PEPPER"),
  GOVBR_CLIENT_ID: Deno.env.get("GOVBR_CLIENT_ID"),
  GOVBR_CLIENT_SECRET: Deno.env.get("GOVBR_CLIENT_SECRET"),
  GOVBR_REDIRECT_URI: Deno.env.get("GOVBR_REDIRECT_URI"),
  GOVBR_FRONTEND_URL: Deno.env.get("GOVBR_FRONTEND_URL"),
  GOVBR_BASE_URL: Deno.env.get("GOVBR_BASE_URL"),
  GOOGLE_SERVICE_ACCOUNT_JSON: Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"),
  GOOGLE_OAUTH_CLIENT_ID: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"),
  GOOGLE_OAUTH_CLIENT_SECRET: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET"),
  GOOGLE_OAUTH_REFRESH_TOKEN: Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN"),
  SHEETS_SYNC_ENABLED: Deno.env.get("SHEETS_SYNC_ENABLED"),
  SHEETS_SHARE_WITH_EMAILS: Deno.env.get("SHEETS_SHARE_WITH_EMAILS"),
});
