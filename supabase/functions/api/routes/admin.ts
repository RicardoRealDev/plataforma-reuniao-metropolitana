import { Hono } from "jsr:@hono/hono@4";
import { env } from "../../_shared/env.ts";
import { seedCouncils } from "../../_shared/domain/seedData.ts";
import { hashIdentity } from "../../_shared/auth.ts";
import { sql } from "../../_shared/db.ts";
import { z } from "npm:zod@3";

const createUserSchema = z.object({
  name: z.string().trim().min(2),
  institution: z.string().trim().min(2),
  function: z.string().trim().min(2),
  accessLevel: z.enum(["ADMIN", "OPERATOR", "PARTICIPANT"]),
  memberId: z.string().nullable().optional(),
  cpf: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().length(11)),
  expectedCnpj: z.string().optional().transform((value) => value?.replace(/\D/g, "") || null),
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
    const subjectHash = await hashIdentity(body.cpf);
    const id = crypto.randomUUID();
    await sql`
      insert into "InstitutionalUser"
        (id, name, institution, "function", "accessLevel", "memberId", "govbrSubjectHash", "cpfLast4", "expectedCnpj")
      values
        (${id}, ${body.name}, ${body.institution}, ${body.function}, ${body.accessLevel},
         ${body.memberId ?? null}, ${subjectHash}, ${body.cpf.slice(-4)}, ${body.expectedCnpj})
    `;

    return c.json({
      user: { id, name: body.name, institution: body.institution, function: body.function,
        accessLevel: body.accessLevel, memberId: body.memberId ?? null, cpfLast4: body.cpf.slice(-4) },
    }, 201);
  });
}
