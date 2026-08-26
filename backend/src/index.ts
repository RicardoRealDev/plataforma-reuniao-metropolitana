import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import { registerLiveKitWebhook } from './livekit/webhook.js';
import { registerCouncilRoutes } from './routes/councils.js';
import { registerMeetingRoutes } from './routes/meetings.js';
import { registerAttendanceRoutes } from './routes/attendance.js';
import { registerAgendaRoutes } from './routes/agenda.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerAdminRoutes } from './routes/admin.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

registerLiveKitWebhook(app);
registerCouncilRoutes(app);
registerMeetingRoutes(app);
registerAttendanceRoutes(app);
registerAgendaRoutes(app);
registerDashboardRoutes(app);
registerAdminRoutes(app);

app.get('/', async () => ({ ok: true, servico: 'Quórum Digital — backend' }));

app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
