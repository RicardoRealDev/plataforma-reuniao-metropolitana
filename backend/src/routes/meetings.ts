import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { issueParticipantToken } from '../livekit/client.js';
import { createMeetingSpreadsheet, syncMeetingToSheet } from '../sheets/client.js';
import { generateMinutes } from '../domain/minutes.js';

const createMeetingSchema = z.object({
  councilId: z.string(),
  titulo: z.string().min(1),
});

const tokenSchema = z.object({
  memberId: z.string(),
});

export function registerMeetingRoutes(app: FastifyInstance) {
  app.post('/meetings', async (request, reply) => {
    const body = createMeetingSchema.parse(request.body);

    const meeting = await prisma.meeting.create({
      data: {
        councilId: body.councilId,
        titulo: body.titulo,
        livekitRoomName: `reuniao-${randomUUID()}`,
      },
    });

    await createMeetingSpreadsheet(meeting.id);

    return reply.status(201).send(meeting);
  });

  app.get('/meetings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: { council: { include: { members: { orderBy: { ordem: 'asc' } } } }, agendaItems: { orderBy: { ordem: 'asc' } } },
    });
    if (!meeting) return reply.status(404).send({ ok: false, erro: 'reunião não encontrada' });
    return meeting;
  });

  app.post('/meetings/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const meeting = await prisma.meeting.update({ where: { id }, data: { status: 'LIVE' } });
    return meeting;
  });

  app.post('/meetings/:id/close', async (request, reply) => {
    const { id } = request.params as { id: string };
    const meeting = await prisma.meeting.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
    const texto = await generateMinutes(id);
    await syncMeetingToSheet(id);
    return { meeting, ata: texto };
  });

  app.post('/meetings/:id/token', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { memberId } = tokenSchema.parse(request.body);

    const [meeting, member] = await Promise.all([
      prisma.meeting.findUniqueOrThrow({ where: { id } }),
      prisma.member.findUniqueOrThrow({ where: { id: memberId } }),
    ]);

    const token = await issueParticipantToken({
      roomName: meeting.livekitRoomName,
      identity: member.id,
      displayName: member.representante,
    });

    return { token, roomName: meeting.livekitRoomName };
  });
}
