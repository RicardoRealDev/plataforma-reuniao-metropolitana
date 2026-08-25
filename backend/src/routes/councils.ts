import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';

export function registerCouncilRoutes(app: FastifyInstance) {
  app.get('/councils', async () => {
    return prisma.council.findMany({ include: { members: { orderBy: { ordem: 'asc' } } } });
  });

  app.get('/councils/:id/meetings', async (request) => {
    const { id } = request.params as { id: string };
    return prisma.meeting.findMany({ where: { councilId: id }, orderBy: { createdAt: 'desc' } });
  });
}
