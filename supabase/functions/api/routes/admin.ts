import { Hono } from "jsr:@hono/hono@4";
import { env } from "../../_shared/env.ts";
import { seedCouncils } from "../../_shared/domain/seedData.ts";
import { hashToken } from "../../_shared/auth.ts";
import { sql } from "../../_shared/db.ts";
import { z } from "npm:zod@3";

const createUserSchema = z.object({
  name: z.string().trim().min(2),
  institution: z.string().trim().min(2),
  function: z.string().trim().min(2),
  accessLevel: z.enum(["ADMIN", "OPERATOR", "PARTICIPANT"]),
  memberId: z.string().nullable().optional(),
  certificateFingerprint: z.string().transform((value) => value.replaceAll(":", "").toUpperCase()).pipe(z.string().regex(/^[A-F0-9]{64}$/)),
});

/**
 * Rota temporária: usada para popular/re-popular o banco quando não há acesso
 * direto ao Postgres (ex: rede corporativa bloqueando o protocolo do Postgres,
 * como aconteceu aqui). Só funciona se ADMIN_SEED_TOKEN estiver configurado —
 * sem a variável, a rota sempre responde 403.
 */
export function registerAdminRoutes(app: Hono) {
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
        (id, name, institution, "function", "accessLevel", "memberId", "certificateFingerprintHash", "certificateFingerprintLast8")
      values
        (${id}, ${body.name}, ${body.institution}, ${body.function}, ${body.accessLevel},
         ${body.memberId ?? null}, ${fingerprintHash}, ${body.certificateFingerprint.slice(-8)})
    `;

    return c.json({
      user: { id, name: body.name, institution: body.institution, function: body.function,
        accessLevel: body.accessLevel, memberId: body.memberId ?? null,
        certificateFingerprintLast8: body.certificateFingerprint.slice(-8) },
    }, 201);
  });
}
