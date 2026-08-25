import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { getCurrentAttendance } from '../domain/attendance.js';
import { getAgendaResult } from '../domain/quorum.js';
import { generateMinutes } from '../domain/minutes.js';

export function registerDashboardRoutes(app: FastifyInstance) {
  app.get('/meetings/:id/dashboard', async (request) => {
    const { id } = request.params as { id: string };

    const meeting = await prisma.meeting.findUniqueOrThrow({
      where: { id },
      include: {
        council: { include: { members: { orderBy: { ordem: 'asc' } } } },
        agendaItems: { orderBy: { ordem: 'asc' } },
      },
    });

    const attendance = await getCurrentAttendance(id);

    const presencaPorSegmento: Record<string, { presentes: number; total: number }> = {};
    const presencaPorEnte: Record<string, boolean> = {};
    let presentes = 0;

    for (const member of meeting.council.members) {
      const present = attendance.get(member.id)?.present ?? false;
      if (present) presentes += 1;

      const bucket = presencaPorSegmento[member.segmento] ?? { presentes: 0, total: 0 };
      bucket.total += 1;
      if (present) bucket.presentes += 1;
      presencaPorSegmento[member.segmento] = bucket;

      presencaPorEnte[member.ente] = present;
    }

    const resultadosPorPauta = await Promise.all(
      meeting.agendaItems
        .filter((item) => item.status !== 'PENDING')
        .map(async (item) => ({ pauta: item.titulo, status: item.status, ...(await getAgendaResult(item.id)) })),
    );

    const recentVotes = await prisma.vote.findMany({
      where: { agendaItem: { meetingId: id } },
      include: { member: true, agendaItem: true },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    return {
      reuniao: { id: meeting.id, titulo: meeting.titulo, status: meeting.status, conselho: meeting.council.name },
      resumo: { totalMembros: meeting.council.members.length, presentes, ausentes: meeting.council.members.length - presentes },
      presencaPorSegmento,
      presencaPorEnte,
      resultadosPorPauta,
      votosRecentes: recentVotes.map((v) => ({
        pauta: v.agendaItem.titulo,
        ente: v.member.ente,
        representante: v.member.representante,
        voto: v.choice,
        timestamp: v.timestamp,
      })),
    };
  });

  app.get('/meetings/:id/minutes', async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.meetingMinutes.findUnique({ where: { meetingId: id } });
    const texto = existing?.texto ?? (await generateMinutes(id));
    return { texto };
  });
}
