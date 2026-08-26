import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { prisma } from '../prisma.js';
import { seedCouncils } from '../domain/seedData.js';

/**
 * Rota temporária: usada para popular o banco em produção quando não há
 * acesso SSH/local ao banco (ex: rede corporativa bloqueando a porta de SSH
 * do provedor). Só funciona se ADMIN_SEED_TOKEN estiver configurado — sem a
 * variável, a rota sempre responde 403.
 */
export function registerAdminRoutes(app: FastifyInstance) {
  app.post('/admin/seed', async (request, reply) => {
    if (!env.ADMIN_SEED_TOKEN || request.headers['x-admin-token'] !== env.ADMIN_SEED_TOKEN) {
      return reply.status(403).send({ ok: false, erro: 'não autorizado' });
    }

    await seedCouncils(prisma);
    return { ok: true };
  });
}
