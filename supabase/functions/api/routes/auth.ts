import { Hono } from "jsr:@hono/hono@4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6";
import { z } from "npm:zod@3";
import { sql } from "../../_shared/db.ts";
import { authenticate, hashIdentity, hashToken, randomToken } from "../../_shared/auth.ts";
import { env } from "../../_shared/env.ts";

const exchangeSchema = z.object({ code: z.string().min(20).max(200) });
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function safeReturnPath(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function frontendRedirect(params: Record<string, string>): string {
  const url = new URL("/login", env.GOVBR_FRONTEND_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function registerAuthRoutes(app: Hono) {
  app.get("/auth/govbr/start", async (c) => {
    const state = randomToken("QD");
    const nonce = randomToken("QD");
    const codeVerifier = randomToken("QD") + randomToken("QD");
    const stateHash = await hashToken(state);
    await sql`
      insert into "GovBrAuthAttempt" ("stateHash", nonce, "codeVerifier", "returnPath", "expiresAt")
      values (${stateHash}, ${nonce}, ${codeVerifier}, ${safeReturnPath(c.req.query("returnPath"))}, now() + interval '10 minutes')
    `;

    const authorize = new URL("/authorize", env.GOVBR_BASE_URL);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", env.GOVBR_CLIENT_ID);
    authorize.searchParams.set("scope", "openid profile email govbr_recupera_certificadox509");
    authorize.searchParams.set("redirect_uri", env.GOVBR_REDIRECT_URI);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("code_challenge", await sha256(codeVerifier));
    authorize.searchParams.set("code_challenge_method", "S256");
    return c.redirect(authorize.toString());
  });

  app.get("/auth/govbr/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return c.redirect(frontendRedirect({ erro: "retorno_invalido" }));

    const stateHash = await hashToken(state);
    const [attempt] = await sql<{ nonce: string; codeVerifier: string; returnPath: string }[]>`
      delete from "GovBrAuthAttempt"
      where "stateHash" = ${stateHash} and "expiresAt" > now()
      returning nonce, "codeVerifier", "returnPath"
    `;
    if (!attempt) return c.redirect(frontendRedirect({ erro: "sessao_expirada" }));

    const credentials = btoa(`${env.GOVBR_CLIENT_ID}:${env.GOVBR_CLIENT_SECRET}`);
    const tokenResponse = await fetch(new URL("/token", env.GOVBR_BASE_URL), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${credentials}` },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env.GOVBR_REDIRECT_URI,
        code_verifier: attempt.codeVerifier,
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.id_token || !tokens.access_token) {
      console.error("Falha no token GOV.BR", tokenResponse.status);
      return c.redirect(frontendRedirect({ erro: "falha_no_provedor" }));
    }

    const jwks = createRemoteJWKSet(new URL("/jwk", env.GOVBR_BASE_URL));
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      audience: env.GOVBR_CLIENT_ID,
      issuer: [env.GOVBR_BASE_URL, `${env.GOVBR_BASE_URL}/`],
    });
    if (payload.nonce !== attempt.nonce || typeof payload.sub !== "string") {
      return c.redirect(frontendRedirect({ erro: "identidade_invalida" }));
    }

    const certResponse = await fetch(new URL("/api/x509/info", env.GOVBR_BASE_URL), {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const certificate = await certResponse.json();
    const methods = Array.isArray(certificate.amr) ? certificate.amr.map(String) : [];
    if (!certResponse.ok || certificate.type !== "device" || !methods.some((method: string) => method.startsWith("x509"))) {
      return c.redirect(frontendRedirect({ erro: "use_certificado_fisico" }));
    }

    const subjectHash = await hashIdentity(payload.sub);
    const [user] = await sql<{ id: string }[]>`
      select id from "InstitutionalUser"
      where "govbrSubjectHash" = ${subjectHash} and active = true
        and ("expectedCnpj" is null or "expectedCnpj" = ${String(payload.cnpj ?? "").replace(/\D/g, "")})
    `;
    if (!user) return c.redirect(frontendRedirect({ erro: "usuario_nao_cadastrado" }));

    const exchangeCode = randomToken("QD");
    const codeHash = await hashToken(exchangeCode);
    await sql.begin(async (tx) => {
      await tx`insert into "AuthExchangeCode" ("codeHash", "userId", "expiresAt") values (${codeHash}, ${user.id}, now() + interval '1 minute')`;
      await tx`update "InstitutionalUser" set "lastLoginAt" = now() where id = ${user.id}`;
    });
    return c.redirect(frontendRedirect({ code: exchangeCode, returnPath: attempt.returnPath }));
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

  app.get("/auth/govbr/logout", (c) => {
    const url = new URL("/logout", env.GOVBR_BASE_URL);
    url.searchParams.set("post_logout_redirect_uri", env.GOVBR_FRONTEND_URL);
    return c.redirect(url.toString());
  });
}
