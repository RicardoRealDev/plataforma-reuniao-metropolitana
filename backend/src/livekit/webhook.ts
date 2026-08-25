import type { FastifyInstance } from 'fastify';
import { TrackSource } from 'livekit-server-sdk';
import { webhookReceiver } from './client.js';
import { prisma } from '../prisma.js';
import { recordAttendance } from '../domain/attendance.js';
import { scheduleSheetSync } from '../sheets/client.js';

/**
 * O LiveKit assina o corpo bruto do POST (JWT no header Authorization cobrindo
 * um hash do body). Por isso o content-type type "application/webhook+json"
 * NÃO pode passar por um parser de JSON antes — precisa chegar aqui como
 * Buffer intacto, senão a verificação de assinatura falha.
 */
export function registerLiveKitWebhook(app: FastifyInstance) {
  app.addContentTypeParser(
    'application/webhook+json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  app.post('/webhooks/livekit', async (request, reply) => {
    const authHeader = request.headers.authorization ?? '';
    const rawBody = request.body as Buffer;

    let event;
    try {
      event = await webhookReceiver.receive(rawBody.toString('utf8'), authHeader);
    } catch (err) {
      request.log.warn({ err }, 'assinatura de webhook do LiveKit inválida');
      return reply.status(401).send({ ok: false, erro: 'assinatura inválida' });
    }

    const roomName = event.room?.name;
    const identity = event.participant?.identity;

    if (roomName && identity) {
      const meeting = await prisma.meeting.findUnique({ where: { livekitRoomName: roomName } });

      if (meeting) {
        let changed = false;
        if (event.event === 'track_published' && event.track?.source === TrackSource.CAMERA) {
          await recordAttendance(meeting.id, identity, 'CAMERA', 'PRESENT');
          changed = true;
        } else if (event.event === 'track_unpublished' && event.track?.source === TrackSource.CAMERA) {
          await recordAttendance(meeting.id, identity, 'CAMERA', 'ABSENT');
          changed = true;
        } else if (event.event === 'participant_left') {
          await recordAttendance(meeting.id, identity, 'CAMERA', 'ABSENT');
          changed = true;
        }
        if (changed) scheduleSheetSync(meeting.id);
      }
    }

    return reply.status(200).send({ ok: true });
  });
}
