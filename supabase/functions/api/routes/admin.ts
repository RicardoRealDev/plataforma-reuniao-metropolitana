import { Hono } from "jsr:@hono/hono@4";
import { env } from "../../_shared/env.ts";
import { seedCouncils } from "../../_shared/domain/seedData.ts";

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
}
