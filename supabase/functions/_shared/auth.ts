import type { Context } from "jsr:@hono/hono@4";
import { sql } from "./db.ts";
import { env } from "./env.ts";

export type AccessLevel = "ADMIN" | "OPERATOR" | "PARTICIPANT";

export interface AuthUser {
  id: string;
  name: string;
  institution: string;
  function: string;
  accessLevel: AccessLevel;
  memberId: string | null;
}

const encoder = new TextEncoder();

export function randomToken(prefix: "QD" | "QDS"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const value = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${prefix}_${value}`;
}

export async function hashToken(token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.AUTH_TOKEN_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(token));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticate(c: Context): Promise<AuthUser | null> {
  const authorization = c.req.header("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("QDS_")) return null;

  const tokenHash = await hashToken(token);
  const [user] = await sql<AuthUser[]>`
    select u.id, u.name, u.institution, u."function", u."accessLevel", u."memberId"
    from "AuthSession" s
    join "InstitutionalUser" u on u.id = s."userId"
    where s."tokenHash" = ${tokenHash}
      and s."revokedAt" is null
      and s."expiresAt" > now()
      and u.active = true
  `;

  if (user) {
    await sql`update "AuthSession" set "lastSeenAt" = now() where "tokenHash" = ${tokenHash}`;
  }
  return user ?? null;
}

export async function requireAuth(c: Context, levels?: AccessLevel[]): Promise<AuthUser | Response> {
  const user = await authenticate(c);
  if (!user) return c.json({ ok: false, erro: "sessão inválida ou expirada" }, 401);
  if (levels && !levels.includes(user.accessLevel)) {
    return c.json({ ok: false, erro: "usuário sem permissão para esta operação" }, 403);
  }
  return user;
}

export function isAuthResponse(value: AuthUser | Response): value is Response {
  return value instanceof Response;
}
