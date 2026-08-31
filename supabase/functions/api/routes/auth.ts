import { Hono } from "jsr:@hono/hono@4";
import { z } from "npm:zod@3";
import { sql } from "../../_shared/db.ts";
import { authenticate, hashToken, randomToken } from "../../_shared/auth.ts";
import { env } from "../../_shared/env.ts";

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
      select id, name, institution, "function", "accessLevel", "memberId"
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

  app.post("/auth/logout", async (c) => {
    const authorization = c.req.header("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (token) await sql`update "AuthSession" set "revokedAt" = now() where "tokenHash" = ${await hashToken(token)}`;
    return c.json({ ok: true });
  });
}
