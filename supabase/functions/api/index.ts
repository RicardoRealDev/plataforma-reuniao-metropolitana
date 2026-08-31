import { Hono } from "jsr:@hono/hono@4";
import { cors } from "jsr:@hono/hono@4/cors";
import { registerCouncilRoutes } from "./routes/councils.ts";
import { registerMeetingRoutes } from "./routes/meetings.ts";
import { registerAttendanceRoutes } from "./routes/attendance.ts";
import { registerAgendaRoutes } from "./routes/agenda.ts";
import { registerDashboardRoutes } from "./routes/dashboard.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerAuthRoutes } from "./routes/auth.ts";

// Supabase encaminha a function com o prefixo /functions/v1 removido, mas
// mantém o nome da function no path (ex: /functions/v1/api/councils chega
// aqui como /api/councils) — confirmado empiricamente com uma rota de debug.
const app = new Hono().basePath("/api");

app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"] }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, erro: "erro interno" }, 500);
});

app.get("/", (c) => c.json({ ok: true, servico: "Quórum Digital — backend" }));

registerCouncilRoutes(app);
registerAuthRoutes(app);
registerMeetingRoutes(app);
registerAttendanceRoutes(app);
registerAgendaRoutes(app);
registerDashboardRoutes(app);
registerAdminRoutes(app);

Deno.serve(app.fetch);
