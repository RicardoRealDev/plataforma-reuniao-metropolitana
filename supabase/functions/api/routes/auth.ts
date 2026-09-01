import { Hono } from "jsr:@hono/hono@4";
import { z } from "npm:zod@3";
import { sql } from "../../_shared/db.ts";
import { authenticate, hashToken, isAuthResponse, randomToken, requireAuth } from "../../_shared/auth.ts";
import { env } from "../../_shared/env.ts";
import { derivePasswordHash, normalizeUsername, passwordIterations, randomSalt, verifyPassword } from "../../_shared/password.ts";
import { documentLast2, hashCpf, maskedDocument } from "../../_shared/certificateIdentity.ts";

const gatewaySchema = z.object({
  requestId: z.string().uuid(),
  certificate: z.object({
    fingerprint: z.string().regex(/^[A-F0-9]{64}$/),
    fingerprintLast8: z.string().regex(/^[A-F0-9]{8}$/),
    subjectName: z.string().trim().min(2).max(300),
    issuerName: z.string().trim().min(2).max(500),
    serialLast8: z.string().regex(/^[A-F0-9]{1,8}$/),
    validFrom: z.string().datetime(),
    validTo: z.string().datetime(),
  }),
  identity: z.object({
    type: z.enum(["PF", "PJ", "UNKNOWN"]),
    name: z.string().trim().min(2).max(300),
    cpf: z.string().regex(/^\d{11}$/).nullable(),
    cnpj: z.string().regex(/^\d{14}$/).nullable(),
    legalEntityName: z.string().trim().max(300).nullable(),
  }),
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
    await sql`
      insert into "AuthSession" (id, "userId", "tokenHash", "authMethod", "expiresAt")
      values (${crypto.randomUUID()}, ${credential.id}, ${sessionHash}, 'PASSWORD_ADMIN', now() + interval '2 hours')
    `;
    return c.json({
      accessToken,
      expiresIn: 7200,
      user: {
        id: credential.id,
        name: credential.name,
        institution: credential.institution,
        function: credential.function,
        accessLevel: credential.accessLevel,
        memberId: credential.memberId,
        mustChangePassword: credential.mustChangePassword,
        identityVerified: false,
        certificateIdentityName: null,
        authenticationMethod: "PASSWORD_ADMIN",
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
    if (new Date(body.certificate.validFrom).getTime() > Date.now()
      || new Date(body.certificate.validTo).getTime() <= Date.now()) {
      return c.json({ ok: false, erro: "certificado expirado" }, 401);
    }

    try {
      await sql`
        insert into "MtlsGatewayRequest" ("requestId", "expiresAt")
        values (${body.requestId}, now() + interval '2 minutes')
      `;
      await sql`delete from "MtlsGatewayRequest" where "expiresAt" < now()`;
    } catch {
      return c.json({ ok: false, erro: "requisição já utilizada" }, 409);
    }

    const fingerprintHash = await hashToken(body.certificate.fingerprint);
    const cpfHash = await hashCpf(body.identity.cpf);
    const [existingCredential] = await sql<{ id: string; userId: string; status: "ACTIVE" | "REVOKED" }[]>`
      select credential.id, credential."userId", credential.status
      from "CertificateCredential" credential
      join "InstitutionalUser" u on u.id = credential."userId"
      where credential."fingerprintHash" = ${fingerprintHash} and u.active = true
    `;
    if (existingCredential?.status === "REVOKED") {
      return c.json({ ok: false, erro: "certificado revogado pelo administrador" }, 403);
    }

    let userId = existingCredential?.userId ?? null;
    if (!userId) {
      const [legacyUser] = await sql<{ id: string }[]>`
        select id from "InstitutionalUser"
        where "certificateFingerprintHash" = ${fingerprintHash} and active = true
      `;
      userId = legacyUser?.id ?? null;
    }

    const [rejectedEnrollment] = await sql<{ status: string }[]>`
      select status from "CertificateEnrollment"
      where "fingerprintHash" = ${fingerprintHash} and status = 'REJECTED'
    `;
    if (!userId && rejectedEnrollment) {
      return c.json({ ok: false, erro: "identidade rejeitada pelo administrador" }, 403);
    }

    // Certificados renovados têm nova impressão digital. O CPF, armazenado
    // somente como HMAC, permite o vínculo automático se houver exatamente um
    // cadastro institucional aprovado para a pessoa.
    if (!userId && cpfHash) {
      const matchingUsers = await sql<{ id: string }[]>`
        select id from "InstitutionalUser" where "cpfHash" = ${cpfHash} and active = true
      `;
      if (matchingUsers.length === 1) userId = matchingUsers[0].id;
    }

    if (!userId) {
      const enrollmentCode = randomToken("QD");
      const publicCodeHash = await hashToken(enrollmentCode);
      const last2 = documentLast2(body.identity.cpf, body.identity.cnpj);
      await sql`
        insert into "CertificateEnrollment"
          (id, "publicCodeHash", "fingerprintHash", "fingerprintLast8", "subjectName",
           "cpfHash", "documentLast2", "certificateType", "legalEntityName", "issuerName",
           "serialLast8", "validFrom", "validTo", status, "expiresAt")
        values
          (${crypto.randomUUID()}, ${publicCodeHash}, ${fingerprintHash},
           ${body.certificate.fingerprintLast8}, ${body.identity.name}, ${cpfHash}, ${last2},
           ${body.identity.type}, ${body.identity.legalEntityName}, ${body.certificate.issuerName},
           ${body.certificate.serialLast8}, ${body.certificate.validFrom},
           ${body.certificate.validTo}, 'PENDING', now() + interval '7 days')
        on conflict ("fingerprintHash") do update set
          "publicCodeHash" = excluded."publicCodeHash",
          "subjectName" = excluded."subjectName",
          "cpfHash" = excluded."cpfHash",
          "documentLast2" = excluded."documentLast2",
          "certificateType" = excluded."certificateType",
          "legalEntityName" = excluded."legalEntityName",
          "issuerName" = excluded."issuerName",
          "serialLast8" = excluded."serialLast8",
          "validFrom" = excluded."validFrom",
          "validTo" = excluded."validTo",
          "updatedAt" = now(),
          "expiresAt" = excluded."expiresAt"
      `;
      return c.json({
        status: "PENDING",
        enrollmentCode,
        returnPath: safeReturnPath(body.returnPath),
      }, 202);
    }

    await sql.begin(async (tx) => {
      await tx`
        insert into "CertificateCredential"
          (id, "userId", "fingerprintHash", "fingerprintLast8", "subjectName", "cpfHash",
           "certificateType", "issuerName", "serialLast8", "validFrom", "validTo", status,
           "lastUsedAt")
        values
          (${crypto.randomUUID()}, ${userId}, ${fingerprintHash}, ${body.certificate.fingerprintLast8},
           ${body.identity.name}, ${cpfHash}, ${body.identity.type}, ${body.certificate.issuerName},
           ${body.certificate.serialLast8}, ${body.certificate.validFrom}, ${body.certificate.validTo},
           'ACTIVE', now())
        on conflict ("fingerprintHash") do update set
          "lastUsedAt" = now(), "validTo" = excluded."validTo", "subjectName" = excluded."subjectName"
      `;
      await tx`
        update "InstitutionalUser"
        set "lastLoginAt" = now(),
            "identityVerifiedAt" = now(),
            "certificateIdentityName" = ${body.identity.name},
            "cpfHash" = coalesce("cpfHash", ${cpfHash})
        where id = ${userId}
      `;
    });

    const exchangeCode = randomToken("QD");
    const codeHash = await hashToken(exchangeCode);
    await sql`
      insert into "AuthExchangeCode" ("codeHash", "userId", "expiresAt")
      values (${codeHash}, ${userId}, now() + interval '1 minute')
    `;
    return c.json({ status: "AUTHORIZED", code: exchangeCode, returnPath: safeReturnPath(body.returnPath) });
  });

  app.get("/auth/enrollments/:code", async (c) => {
    const code = c.req.param("code");
    if (!code.startsWith("QD_") || code.length > 200) {
      return c.json({ ok: false, erro: "solicitação de identidade inválida" }, 404);
    }
    const publicCodeHash = await hashToken(code);
    const [enrollment] = await sql<{
      status: "PENDING" | "APPROVED" | "REJECTED";
      subjectName: string;
      certificateType: "PF" | "PJ" | "UNKNOWN";
      documentLast2: string | null;
      legalEntityName: string | null;
      validTo: string;
    }[]>`
      select status, "subjectName", "certificateType", "documentLast2", "legalEntityName", "validTo"
      from "CertificateEnrollment"
      where "publicCodeHash" = ${publicCodeHash} and "expiresAt" > now()
    `;
    if (!enrollment) return c.json({ ok: false, erro: "solicitação de identidade não encontrada" }, 404);
    return c.json({
      status: enrollment.status,
      identity: {
        name: enrollment.subjectName,
        type: enrollment.certificateType,
        documentMasked: maskedDocument(enrollment.certificateType, enrollment.documentLast2),
        legalEntityName: enrollment.legalEntityName,
      },
      certificateValidTo: enrollment.validTo,
    });
  });

  app.post("/auth/exchange", async (c) => {
    const { code } = exchangeSchema.parse(await c.req.json());
    const codeHash = await hashToken(code);
    const [exchange] = await sql<{ userId: string }[]>`
      delete from "AuthExchangeCode"
      where "codeHash" = ${codeHash} and "expiresAt" > now()
      returning "userId"
    `;
    if (!exchange) return c.json({ ok: false, erro: "código de acesso inválido ou expirado" }, 401);

    const accessToken = randomToken("QDS");
    const sessionHash = await hashToken(accessToken);
    const [user] = await sql<Record<string, unknown>[]>`
      select id, name, institution, "function", "accessLevel", "memberId", "mustChangePassword",
             "certificateIdentityName", ("identityVerifiedAt" is not null) as "identityVerified",
             'ICPBRASIL_MTLS' as "authenticationMethod"
      from "InstitutionalUser" where id = ${exchange.userId}
    `;
    await sql`
      insert into "AuthSession" (id, "userId", "tokenHash", "authMethod", "expiresAt")
      values (${crypto.randomUUID()}, ${exchange.userId}, ${sessionHash}, 'ICPBRASIL_MTLS', now() + interval '12 hours')
    `;
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
    if (token) {
      await sql`
        update "AuthSession" set "revokedAt" = now()
        where "tokenHash" = ${await hashToken(token)}
      `;
    }
    return c.json({ ok: true });
  });
}
