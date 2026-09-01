import { Hono } from "jsr:@hono/hono@4";
import { env } from "../../_shared/env.ts";
import { seedCouncils } from "../../_shared/domain/seedData.ts";
import { hashToken, isAuthResponse, requireAuth } from "../../_shared/auth.ts";
import { maskedDocument } from "../../_shared/certificateIdentity.ts";
import { sql } from "../../_shared/db.ts";
import { z } from "npm:zod@3";
import { derivePasswordHash, normalizeUsername, passwordIterations, randomSalt } from "../../_shared/password.ts";

const createUserSchema = z.object({
  name: z.string().trim().min(2),
  institution: z.string().trim().min(2),
  function: z.string().trim().min(2),
  accessLevel: z.enum(["ADMIN", "OPERATOR", "PARTICIPANT"]),
  memberId: z.string().nullable().optional(),
  certificateFingerprint: z.string()
    .transform((value) => value.replaceAll(":", "").toUpperCase())
    .pipe(z.string().regex(/^[A-F0-9]{64}$/)),
});

const createPasswordAdminSchema = z.object({
  name: z.string().trim().min(2),
  institution: z.string().trim().min(2),
  function: z.string().trim().min(2),
  username: z.string().trim().min(4).max(100),
  temporaryPassword: z.string().min(8).max(200),
});

const approveEnrollmentSchema = z.object({
  memberId: z.string().nullable().optional(),
  institution: z.string().trim().min(2).max(300).optional(),
  function: z.string().trim().min(2).max(200).default("Representante"),
  accessLevel: z.enum(["ADMIN", "OPERATOR", "PARTICIPANT"]).default("PARTICIPANT"),
});

type PendingEnrollment = {
  id: string;
  fingerprintHash: string;
  fingerprintLast8: string;
  subjectName: string;
  cpfHash: string | null;
  documentLast2: string | null;
  certificateType: "PF" | "PJ" | "UNKNOWN";
  legalEntityName: string | null;
  issuerName: string;
  serialLast8: string;
  validFrom: string;
  validTo: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

export function registerAdminRoutes(app: Hono) {
  // Rotas de bootstrap protegidas por segredo operacional. Não são usadas pela
  // interface web e podem ser desabilitadas removendo ADMIN_SEED_TOKEN.
  app.post("/admin/seed", async (c) => {
    if (!env.ADMIN_SEED_TOKEN || c.req.header("x-admin-token") !== env.ADMIN_SEED_TOKEN) {
      return c.json({ ok: false, erro: "não autorizado" }, 403);
    }
    await seedCouncils();
    return c.json({ ok: true });
  });

  app.post("/admin/users", async (c) => {
    if (!env.ADMIN_SEED_TOKEN || c.req.header("x-admin-token") !== env.ADMIN_SEED_TOKEN) {
      return c.json({ ok: false, erro: "não autorizado" }, 403);
    }
    const body = createUserSchema.parse(await c.req.json());
    const fingerprintHash = await hashToken(body.certificateFingerprint);
    const id = crypto.randomUUID();
    await sql`
      insert into "InstitutionalUser"
        (id, name, institution, "function", "accessLevel", "memberId",
         "certificateFingerprintHash", "certificateFingerprintLast8")
      values
        (${id}, ${body.name}, ${body.institution}, ${body.function}, ${body.accessLevel},
         ${body.memberId ?? null}, ${fingerprintHash}, ${body.certificateFingerprint.slice(-8)})
    `;
    return c.json({
      user: {
        id,
        name: body.name,
        institution: body.institution,
        function: body.function,
        accessLevel: body.accessLevel,
        memberId: body.memberId ?? null,
        certificateFingerprintLast8: body.certificateFingerprint.slice(-8),
      },
    }, 201);
  });

  app.post("/admin/password-users", async (c) => {
    if (!env.ADMIN_SEED_TOKEN || c.req.header("x-admin-token") !== env.ADMIN_SEED_TOKEN) {
      return c.json({ ok: false, erro: "não autorizado" }, 403);
    }
    const body = createPasswordAdminSchema.parse(await c.req.json());
    const usernameHash = await hashToken(normalizeUsername(body.username));
    const salt = randomSalt();
    const passwordHash = await derivePasswordHash(body.temporaryPassword, salt, passwordIterations);
    const id = crypto.randomUUID();
    await sql`
      insert into "InstitutionalUser"
        (id, name, institution, "function", "accessLevel", "usernameHash", "usernameDisplay",
         "passwordSalt", "passwordHash", "passwordIterations", "mustChangePassword")
      values
        (${id}, ${body.name}, ${body.institution}, ${body.function}, 'ADMIN', ${usernameHash},
         ${body.username}, ${salt}, ${passwordHash}, ${passwordIterations}, true)
    `;
    return c.json({
      user: { id, name: body.name, username: body.username, accessLevel: "ADMIN", mustChangePassword: true },
    }, 201);
  });

  app.get("/admin/certificate-enrollments", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const enrollments = await sql<PendingEnrollment[]>`
      select id, "fingerprintLast8", "subjectName", "documentLast2", "certificateType",
             "legalEntityName", "issuerName", "serialLast8", "validTo", status, "createdAt"
      from "CertificateEnrollment"
      where status = 'PENDING' and "expiresAt" > now()
      order by "createdAt" asc
    `;
    return c.json(enrollments.map((item) => ({
      id: item.id,
      name: item.subjectName,
      type: item.certificateType,
      documentMasked: maskedDocument(item.certificateType, item.documentLast2),
      legalEntityName: item.legalEntityName,
      issuerName: item.issuerName,
      fingerprintLast8: item.fingerprintLast8,
      serialLast8: item.serialLast8,
      validTo: item.validTo,
      createdAt: item.createdAt,
    })));
  });

  app.post("/admin/certificate-enrollments/:id/approve", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const body = approveEnrollmentSchema.parse(await c.req.json());
    if (body.accessLevel === "PARTICIPANT" && !body.memberId) {
      return c.json({ ok: false, erro: "selecione a representação do participante" }, 400);
    }

    const [enrollment] = await sql<PendingEnrollment[]>`
      select * from "CertificateEnrollment"
      where id = ${c.req.param("id")} and status = 'PENDING' and "expiresAt" > now()
    `;
    if (!enrollment) return c.json({ ok: false, erro: "solicitação pendente não encontrada" }, 404);

    let member: { id: string; ente: string; representante: string } | null = null;
    if (body.memberId) {
      const [foundMember] = await sql<{ id: string; ente: string; representante: string }[]>`
        select id, ente, representante from "Member" where id = ${body.memberId}
      `;
      if (!foundMember) return c.json({ ok: false, erro: "representação não encontrada" }, 404);
      member = foundMember;
    }

    let [user] = body.memberId
      ? await sql<{ id: string }[]>`
          select id from "InstitutionalUser" where "memberId" = ${body.memberId} and active = true limit 1
        `
      : [];
    if (!user && enrollment.cpfHash) {
      const matches = await sql<{ id: string }[]>`
        select id from "InstitutionalUser" where "cpfHash" = ${enrollment.cpfHash} and active = true
      `;
      if (matches.length === 1) user = matches[0];
    }

    const userId = user?.id ?? crypto.randomUUID();
    const institution = body.institution
      ?? member?.ente
      ?? enrollment.legalEntityName
      ?? "Instituição não informada";

    await sql.begin(async (tx) => {
      if (user) {
        await tx`
          update "InstitutionalUser"
          set "cpfHash" = coalesce("cpfHash", ${enrollment.cpfHash}),
              "certificateIdentityName" = ${enrollment.subjectName},
              "identityVerifiedAt" = now(),
              "memberId" = coalesce(${body.memberId ?? null}, "memberId")
          where id = ${userId}
        `;
      } else {
        await tx`
          insert into "InstitutionalUser"
            (id, name, institution, "function", "accessLevel", "memberId", "cpfHash",
             "certificateIdentityName", "identityVerifiedAt")
          values
            (${userId}, ${enrollment.subjectName}, ${institution}, ${body.function},
             ${body.accessLevel}, ${body.memberId ?? null}, ${enrollment.cpfHash},
             ${enrollment.subjectName}, now())
        `;
      }
      await tx`
        insert into "CertificateCredential"
          (id, "userId", "fingerprintHash", "fingerprintLast8", "subjectName", "cpfHash",
           "certificateType", "issuerName", "serialLast8", "validFrom", "validTo", status)
        values
          (${crypto.randomUUID()}, ${userId}, ${enrollment.fingerprintHash},
           ${enrollment.fingerprintLast8}, ${enrollment.subjectName}, ${enrollment.cpfHash},
           ${enrollment.certificateType}, ${enrollment.issuerName}, ${enrollment.serialLast8},
           ${enrollment.validFrom}, ${enrollment.validTo}, 'ACTIVE')
      `;
      await tx`
        update "CertificateEnrollment"
        set status = 'APPROVED', "approvedAt" = now(), "updatedAt" = now(),
            "approvedByUserId" = ${auth.id}, "linkedUserId" = ${userId}
        where id = ${enrollment.id} and status = 'PENDING'
      `;
    });

    const [approvedUser] = await sql<Record<string, unknown>[]>`
      select id, name, institution, "function", "accessLevel", "memberId"
      from "InstitutionalUser" where id = ${userId}
    `;
    return c.json({ ok: true, user: approvedUser });
  });

  app.post("/admin/certificate-enrollments/:id/reject", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const [enrollment] = await sql<{ id: string }[]>`
      update "CertificateEnrollment"
      set status = 'REJECTED', "updatedAt" = now(), "approvedByUserId" = ${auth.id}
      where id = ${c.req.param("id")} and status = 'PENDING'
      returning id
    `;
    if (!enrollment) return c.json({ ok: false, erro: "solicitação pendente não encontrada" }, 404);
    return c.json({ ok: true });
  });

  app.get("/admin/certificate-credentials", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const credentials = await sql<Record<string, unknown>[]>`
      select credential.id, credential."fingerprintLast8", credential."subjectName",
             credential."certificateType", credential."issuerName", credential."validTo",
             credential.status, credential."lastUsedAt", u.id as "userId", u.name,
             u.institution, u."function", u."accessLevel", u."memberId"
      from "CertificateCredential" credential
      join "InstitutionalUser" u on u.id = credential."userId"
      order by credential."createdAt" desc
    `;
    return c.json(credentials);
  });

  app.post("/admin/certificate-credentials/:id/revoke", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const [credential] = await sql<{ userId: string }[]>`
      update "CertificateCredential"
      set status = 'REVOKED', "revokedAt" = now()
      where id = ${c.req.param("id")} and status = 'ACTIVE'
      returning "userId"
    `;
    if (!credential) return c.json({ ok: false, erro: "certificado ativo não encontrado" }, 404);
    await sql`
      update "AuthSession" set "revokedAt" = now()
      where "userId" = ${credential.userId} and "authMethod" = 'ICPBRASIL_MTLS' and "revokedAt" is null
    `;
    return c.json({ ok: true });
  });
}
