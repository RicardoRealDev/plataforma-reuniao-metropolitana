import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { recordAttendance, getCurrentAttendance } from '../domain/attendance.js';
import { scheduleSheetSync } from '../sheets/client.js';

const manualAttendanceSchema = z.object({
  memberId: z.string(),
  status: z.enum(['PRESENT', 'ABSENT']),
});

export function registerAttendanceRoutes(app: FastifyInstance) {
  app.post('/meetings/:id/attendance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { memberId, status } = manualAttendanceSchema.parse(request.body);

    await recordAttendance(id, memberId, 'MANUAL', status);
    scheduleSheetSync(id);

    return reply.status(201).send({ ok: true });
  });

  app.get('/meetings/:id/attendance', async (request) => {
    const { id } = request.params as { id: string };
    const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id }, include: { council: { include: { members: true } } } });
    const attendance = await getCurrentAttendance(id);

    return meeting.council.members.map((member) => ({
      member,
      attendance: attendance.get(member.id) ?? { present: false, manualStatus: null, cameraStatus: null },
    }));
  });
}
