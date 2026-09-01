import { Hono } from "jsr:@hono/hono@4";
import { env } from "../../_shared/env.ts";
import { seedCouncils } from "../../_shared/domain/seedData.ts";
import { hashToken, isAuthResponse, requireAuth } from "../../_shared/auth.ts";
import { maskedDocument } from "../../_shared/certificateIdentity.ts";
import { sql } from "../../_shared/db.ts";
import { z } from "npm:zod@3";
import {
  derivePasswordHash,
  normalizeEmail,
  normalizeUsername,
  passwordIterations,
  randomSalt,
} from "../../_shared/password.ts";

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

const strongTemporaryPassword = z.string().min(12).max(200)
  .regex(/[a-z]/, "inclua uma letra minúscula")
  .regex(/[A-Z]/, "inclua uma letra maiúscula")
  .regex(/[0-9]/, "inclua um número")
  .regex(/[^A-Za-z0-9]/, "inclua um caractere especial");

const emailUserSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  email: z.string().trim().email().max(320),
  temporaryPassword: strongTemporaryPassword,
  name: z.string().trim().min(2).max(300),
  institution: z.string().trim().min(2).max(300),
  function: z.string().trim().min(2).max(200),
  accessLevel: z.enum(["ADMIN", "OPERATOR", "PARTICIPANT"]),
  memberId: z.string().nullable().optional(),
});

const emailUserStatusSchema = z.object({ active: z.boolean() });

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

  app.get("/admin/email-users", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const users = await sql<{
      id: string;
      name: string;
      institution: string;
      function: string;
      accessLevel: "ADMIN" | "OPERATOR" | "PARTICIPANT";
      memberId: string | null;
      email: string | null;
      active: boolean;
      mustChangePassword: boolean;
      lastLoginAt: string | null;
    }[]>`
      select id, name, institution, "function", "accessLevel", "memberId",
             "emailDisplay" as email, active, "mustChangePassword", "lastLoginAt"
      from "InstitutionalUser"
      order by active desc, name asc
    `;
    return c.json(users);
  });

  app.post("/admin/email-users", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const body = emailUserSchema.parse(await c.req.json());
    const emailNormalized = normalizeEmail(body.email);

    let name = body.name;
    let institution = body.institution;
    let functionName = body.function;
    if (body.memberId) {
      const [member] = await sql<{ id: string; representante: string; ente: string }[]>`
        select id, representante, ente from "Member" where id = ${body.memberId}
      `;
      if (!member) return c.json({ ok: false, erro: "representação não encontrada" }, 404);
      name = member.representante;
      institution = member.ente;
      if (body.accessLevel === "PARTICIPANT") functionName = "Representante";
    }

    let userId = body.userId ?? null;
    if (userId) {
      const [existingUser] = await sql<{ id: string }[]>`
        select id from "InstitutionalUser" where id = ${userId}
      `;
      if (!existingUser) return c.json({ ok: false, erro: "usuário não encontrado" }, 404);
    } else if (body.memberId) {
      const [memberUser] = await sql<{ id: string }[]>`
        select id from "InstitutionalUser" where "memberId" = ${body.memberId}
        order by active desc, "createdAt" asc limit 1
      `;
      userId = memberUser?.id ?? null;
    }

    if (userId === auth.id && body.accessLevel !== "ADMIN") {
      return c.json({ ok: false, erro: "o administrador não pode remover o próprio nível de acesso" }, 409);
    }
    if (body.memberId) {
      const [memberOwner] = await sql<{ id: string }[]>`
        select id from "InstitutionalUser"
        where "memberId" = ${body.memberId}
          and (${userId}::text is null or id <> ${userId})
        limit 1
      `;
      if (memberOwner) {
        return c.json({ ok: false, erro: "esta representação já está vinculada a outro usuário" }, 409);
      }
    }

    const [emailOwner] = await sql<{ id: string }[]>`
      select id from "InstitutionalUser"
      where "emailNormalized" = ${emailNormalized}
        and (${userId}::text is null or id <> ${userId})
    `;
    if (emailOwner) return c.json({ ok: false, erro: "este e-mail já está vinculado a outro usuário" }, 409);

    const salt = randomSalt();
    const passwordHash = await derivePasswordHash(body.temporaryPassword, salt, passwordIterations);
    const resolvedUserId = userId ?? crypto.randomUUID();
    await sql.begin(async (tx) => {
      if (userId) {
        await tx`
          update "InstitutionalUser"
          set name = ${name}, institution = ${institution}, "function" = ${functionName},
              "accessLevel" = ${body.accessLevel}, "memberId" = ${body.memberId ?? null},
              "emailNormalized" = ${emailNormalized}, "emailDisplay" = ${body.email.trim()},
              "passwordSalt" = ${salt}, "passwordHash" = ${passwordHash},
              "passwordIterations" = ${passwordIterations}, "mustChangePassword" = true,
              active = true
          where id = ${resolvedUserId}
        `;
      } else {
        await tx`
          insert into "InstitutionalUser"
            (id, name, institution, "function", "accessLevel", "memberId",
             "emailNormalized", "emailDisplay", "passwordSalt", "passwordHash",
             "passwordIterations", "mustChangePassword", active)
          values
            (${resolvedUserId}, ${name}, ${institution}, ${functionName}, ${body.accessLevel},
             ${body.memberId ?? null}, ${emailNormalized}, ${body.email.trim()}, ${salt},
             ${passwordHash}, ${passwordIterations}, true, true)
        `;
      }
      if (resolvedUserId !== auth.id) {
        await tx`update "AuthSession" set "revokedAt" = now() where "userId" = ${resolvedUserId} and "revokedAt" is null`;
      }
    });

    return c.json({
      user: {
        id: resolvedUserId,
        name,
        institution,
        function: functionName,
        accessLevel: body.accessLevel,
        memberId: body.memberId ?? null,
        email: body.email.trim(),
        active: true,
        mustChangePassword: true,
      },
    }, userId ? 200 : 201);
  });

  app.post("/admin/email-users/:id/status", async (c) => {
    const auth = await requireAuth(c, ["ADMIN"]);
    if (isAuthResponse(auth)) return auth;
    const userId = c.req.param("id");
    const { active } = emailUserStatusSchema.parse(await c.req.json());
    if (!active && userId === auth.id) {
      return c.json({ ok: false, erro: "o administrador não pode desativar a própria conta" }, 409);
    }
    const [user] = await sql<{ id: string }[]>`
      update "InstitutionalUser" set active = ${active} where id = ${userId} returning id
    `;
    if (!user) return c.json({ ok: false, erro: "usuário não encontrado" }, 404);
    if (!active) {
      await sql`update "AuthSession" set "revokedAt" = now() where "userId" = ${userId} and "revokedAt" is null`;
    }
    return c.json({ ok: true, active });
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
