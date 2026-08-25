import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { openAgendaItem, bulkFavorableVote, registerVoteException, closeAgendaItem, getAgendaResult } from '../domain/quorum.js';
import { scheduleSheetSync } from '../sheets/client.js';

const createAgendaSchema = z.object({
  titulo: z.string().min(1),
  candidato: z.string().optional(),
  ordem: z.number().default(0),
});

const voteSchema = z.object({
  memberId: z.string(),
  choice: z.string().min(1),
  operatorId: z.string().optional(),
});

export function registerAgendaRoutes(app: FastifyInstance) {
  app.post('/meetings/:id/agenda', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createAgendaSchema.parse(request.body);
    const item = await prisma.agendaItem.create({ data: { meetingId: id, ...body } });
    return reply.status(201).send(item);
  });

  app.post('/agenda/:id/open', async (request) => {
    const { id } = request.params as { id: string };
    const result = await openAgendaItem(id);
    const item = await prisma.agendaItem.findUniqueOrThrow({ where: { id } });
    scheduleSheetSync(item.meetingId);
    return result;
  });

  app.post('/agenda/:id/bulk-favorable', async (request) => {
    const { id } = request.params as { id: string };
    const { operatorId } = z.object({ operatorId: z.string().optional() }).parse(request.body ?? {});
    await bulkFavorableVote(id, operatorId);
    const item = await prisma.agendaItem.findUniqueOrThrow({ where: { id } });
    scheduleSheetSync(item.meetingId);
    return { ok: true };
  });

  app.post('/agenda/:id/votes', async (request) => {
    const { id } = request.params as { id: string };
    const { memberId, choice, operatorId } = voteSchema.parse(request.body);
    await registerVoteException(id, memberId, choice, operatorId);
    const item = await prisma.agendaItem.findUniqueOrThrow({ where: { id } });
    scheduleSheetSync(item.meetingId);
    return { ok: true };
  });

  app.post('/agenda/:id/close', async (request) => {
    const { id } = request.params as { id: string };
    const item = await closeAgendaItem(id);
    scheduleSheetSync(item.meetingId);
    return item;
  });

  app.get('/agenda/:id/result', async (request) => {
    const { id } = request.params as { id: string };
    return getAgendaResult(id);
  });
}
