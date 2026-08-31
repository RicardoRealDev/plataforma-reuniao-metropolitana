import { Hono } from "jsr:@hono/hono@4";
import { z } from "npm:zod@3";
import { sql } from "../../_shared/db.ts";
import { authenticate, hashToken, isAuthResponse, randomToken, requireAuth } from "../../_shared/auth.ts";
import { env } from "../../_shared/env.ts";
import { derivePasswordHash, normalizeUsername, passwordIterations, randomSalt, verifyPassword } from "../../_shared/password.ts";

const gatewaySchema = z.object({
  requestId: z.string().uuid(),
  fingerprint: z.string().regex(/^[A-F0-9]{64}$/),
  subject: z.string().max(2000),
  issuer: z.string().max(2000),
  serialNumber: z.string().max(256),
  validTo: z.string().datetime(),
  returnPath: z.string().max(1000).default("/"),
});
const exchangeSchema = z.object({ code: z.string().min(20).max(200) });
const passwordLoginSchema = z.object({
  username: z.string().trim().min(4).max(100),
  password: z.string().min(8).max(200),
});
const changePasswordSchema = z.object({
  newPassword: z.string().min(12).max(200)
    .regex(/[a-z]/, "inclua uma letra minúscula")
    .regex(/[A-Z]/, "inclua uma letra maiúscula")
    .regex(/[0-9]/, "inclua um número")
    .regex(/[^A-Za-z0-9]/, "inclua um caractere especial"),
});
const encoder = new TextEncoder();

function safeReturnPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function verifyGatewaySignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  const unixTime = Number(timestamp);
  if (!Number.isFinite(unixTime) || Math.abs(Date.now() - unixTime) > 60_000) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.MTLS_GATEWAY_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const received = Uint8Array.from(signature.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  return received.length === 32 && crypto.subtle.verify(
    "HMAC",
    key,
    received,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
}

export function registerAuthRoutes(app: Hono) {
  app.post("/auth/password/login", async (c) => {
    const body = passwordLoginSchema.parse(await c.req.json());
    const usernameHash = await hashToken(normalizeUsername(body.username));
    const [guard] = await sql<{ lockedUntil: string | null }[]>`
      select "lockedUntil" from "PasswordLoginGuard" where "usernameHash" = ${usernameHash}
    `;
    if (guard?.lockedUntil && new Date(guard.lockedUntil).getTime() > Date.now()) {
      return c.json({ ok: false, erro: "acesso temporariamente bloqueado; tente novamente mais tarde" }, 429);
    }

    const [credential] = await sql<{
      id: string; passwordSalt: string; passwordHash: string; passwordIterations: number;
      name: string; institution: string; function: string; accessLevel: string;
      memberId: string | null; mustChangePassword: boolean;
    }[]>`
      select id, "passwordSalt", "passwordHash", "passwordIterations", name, institution,
             "function", "accessLevel", "memberId", "mustChangePassword"
      from "InstitutionalUser"
      where "usernameHash" = ${usernameHash} and active = true and "passwordHash" is not null
    `;
    const valid = credential
      ? await verifyPassword(body.password, credential.passwordSalt, credential.passwordHash, credential.passwordIterations)
      : (await derivePasswordHash(body.password, "00000000000000000000000000000000", passwordIterations), false);

    if (!credential || !valid) {
      await sql`
        insert into "PasswordLoginGuard" ("usernameHash", "failedCount", "lockedUntil")
        values (${usernameHash}, 1, null)
        on conflict ("usernameHash") do update set
          "failedCount" = case
            when "PasswordLoginGuard"."lockedUntil" is not null and "PasswordLoginGuard"."lockedUntil" <= now() then 1
            else "PasswordLoginGuard"."failedCount" + 1
          end,
          "lockedUntil" = case
            when (case
              when "PasswordLoginGuard"."lockedUntil" is not null and "PasswordLoginGuard"."lockedUntil" <= now() then 1
              else "PasswordLoginGuard"."failedCount" + 1
            end) >= 5 then now() + interval '15 minutes'
            else "PasswordLoginGuard"."lockedUntil"
          end,
          "updatedAt" = now()
      `;
      return c.json({ ok: false, erro: "usuário ou senha inválidos" }, 401);
    }

    await sql`delete from "PasswordLoginGuard" where "usernameHash" = ${usernameHash}`;
    const accessToken = randomToken("QDS");
    const sessionHash = await hashToken(accessToken);
    await sql`insert into "AuthSession" (id, "userId", "tokenHash", "authMethod", "expiresAt") values (${crypto.randomUUID()}, ${credential.id}, ${sessionHash}, 'PASSWORD_ADMIN', now() + interval '2 hours')`;
    return c.json({
      accessToken,
      expiresIn: 7200,
      user: {
        id: credential.id, name: credential.name, institution: credential.institution,
        function: credential.function, accessLevel: credential.accessLevel,
        memberId: credential.memberId, mustChangePassword: credential.mustChangePassword,
      },
    });
  });

  app.post("/auth/mtls/authorize", async (c) => {
    const rawBody = await c.req.text();
    const timestamp = c.req.header("x-gateway-timestamp") ?? "";
    const signature = c.req.header("x-gateway-signature") ?? "";
    if (!(await verifyGatewaySignature(rawBody, timestamp, signature))) {
      return c.json({ ok: false, erro: "gateway não autorizado" }, 401);
    }

    const body = gatewaySchema.parse(JSON.parse(rawBody));
    if (new Date(body.validTo).getTime() <= Date.now()) {
      return c.json({ ok: false, erro: "certificado expirado" }, 401);
    }

    const fingerprintHash = await hashToken(body.fingerprint);
    const [user] = await sql<{ id: string }[]>`
      select id from "InstitutionalUser"
      where "certificateFingerprintHash" = ${fingerprintHash} and active = true
    `;
    if (!user) return c.json({ ok: false, erro: "certificado não cadastrado" }, 403);

    const exchangeCode = randomToken("QD");
    const codeHash = await hashToken(exchangeCode);
    try {
      await sql.begin(async (tx) => {
        await tx`insert into "MtlsGatewayRequest" ("requestId", "expiresAt") values (${body.requestId}, now() + interval '2 minutes')`;
        await tx`insert into "AuthExchangeCode" ("codeHash", "userId", "expiresAt") values (${codeHash}, ${user.id}, now() + interval '1 minute')`;
        await tx`update "InstitutionalUser" set "lastLoginAt" = now() where id = ${user.id}`;
        await tx`delete from "MtlsGatewayRequest" where "expiresAt" < now()`;
      });
    } catch {
      return c.json({ ok: false, erro: "requisição já utilizada" }, 409);
    }

    return c.json({ code: exchangeCode, returnPath: safeReturnPath(body.returnPath) });
  });

  app.post("/auth/exchange", async (c) => {
    const { code } = exchangeSchema.parse(await c.req.json());
    const codeHash = await hashToken(code);
    const [exchange] = await sql<{ userId: string }[]>`
      delete from "AuthExchangeCode" where "codeHash" = ${codeHash} and "expiresAt" > now() returning "userId"
    `;
    if (!exchange) return c.json({ ok: false, erro: "código de acesso inválido ou expirado" }, 401);

    const accessToken = randomToken("QDS");
    const sessionHash = await hashToken(accessToken);
    const [user] = await sql<any[]>`
      select id, name, institution, "function", "accessLevel", "memberId", "mustChangePassword"
      from "InstitutionalUser" where id = ${exchange.userId}
    `;
    await sql`insert into "AuthSession" (id, "userId", "tokenHash", "expiresAt") values (${crypto.randomUUID()}, ${user.id}, ${sessionHash}, now() + interval '12 hours')`;
    return c.json({ accessToken, expiresIn: 43200, user });
  });

  app.get("/auth/me", async (c) => {
    const user = await authenticate(c);
    if (!user) return c.json({ ok: false, erro: "sessão inválida ou expirada" }, 401);
    return c.json({ user });
  });

  app.post("/auth/password/change", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"], true);
    if (isAuthResponse(auth)) return auth;
    const { newPassword } = changePasswordSchema.parse(await c.req.json());
    const salt = randomSalt();
    const passwordHash = await derivePasswordHash(newPassword, salt, passwordIterations);
    await sql.begin(async (tx) => {
      await tx`
        update "InstitutionalUser"
        set "passwordSalt" = ${salt}, "passwordHash" = ${passwordHash},
            "passwordIterations" = ${passwordIterations}, "mustChangePassword" = false
        where id = ${auth.id}
      `;
      await tx`update "AuthSession" set "revokedAt" = now() where "userId" = ${auth.id}`;
    });
    return c.json({ ok: true, loginRequired: true });
  });

  app.post("/auth/logout", async (c) => {
    const authorization = c.req.header("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (token) await sql`update "AuthSession" set "revokedAt" = now() where "tokenHash" = ${await hashToken(token)}`;
    return c.json({ ok: true });
  });
}
