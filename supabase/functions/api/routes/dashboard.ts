import { Hono } from "jsr:@hono/hono@4";
import { sql } from "../../_shared/db.ts";
import { getCurrentAttendance } from "../../_shared/domain/attendance.ts";
import { getAgendaResult } from "../../_shared/domain/quorum.ts";
import { generateMinutes } from "../../_shared/domain/minutes.ts";
import type { AgendaItem, Council, Meeting, Member, Vote } from "../../_shared/types.ts";

export function registerDashboardRoutes(app: Hono) {
  app.get("/meetings/:id/dashboard", async (c) => {
    const id = c.req.param("id");

    const [meeting] = await sql<Meeting[]>`select * from "Meeting" where id = ${id}`;
    if (!meeting) throw new Error(`Meeting ${id} não encontrado`);

    const [council] = await sql<Council[]>`select * from "Council" where id = ${meeting.councilId}`;
    const members = await sql<Member[]>`
      select * from "Member" where "councilId" = ${meeting.councilId} order by "ordem" asc
    `;
    const agendaItems = await sql<AgendaItem[]>`
      select * from "AgendaItem" where "meetingId" = ${id} order by "ordem" asc
    `;

    const attendance = await getCurrentAttendance(id);

    const presencaPorSegmento: Record<string, { presentes: number; total: number }> = {};
    const presencaPorEnte: Record<string, boolean> = {};
    let presentes = 0;

    for (const member of members) {
      const present = attendance.get(member.id)?.present ?? false;
      if (present) presentes += 1;

      const bucket = presencaPorSegmento[member.segmento] ?? { presentes: 0, total: 0 };
      bucket.total += 1;
      if (present) bucket.presentes += 1;
      presencaPorSegmento[member.segmento] = bucket;

      presencaPorEnte[member.ente] = present;
    }

    const resultadosPorPauta = await Promise.all(
      agendaItems
        .filter((item) => item.status !== "PENDING")
        .map(async (item) => ({ pauta: item.titulo, status: item.status, ...(await getAgendaResult(item.id)) })),
    );

    const recentVotes = await sql<(Vote & { pautaTitulo: string; ente: string; representante: string })[]>`
      select v.*, ai.titulo as "pautaTitulo", m.ente as ente, m.representante as representante
      from "Vote" v
      join "AgendaItem" ai on ai.id = v."agendaItemId"
      join "Member" m on m.id = v."memberId"
      where ai."meetingId" = ${id}
      order by v."timestamp" desc
      limit 20
    `;

    return c.json({
      reuniao: { id: meeting.id, titulo: meeting.titulo, status: meeting.status, conselho: council.name },
      resumo: { totalMembros: members.length, presentes, ausentes: members.length - presentes },
      presencaPorSegmento,
      presencaPorEnte,
      resultadosPorPauta,
      votosRecentes: recentVotes.map((v) => ({
        pauta: v.pautaTitulo,
        ente: v.ente,
        representante: v.representante,
        voto: v.choice,
        timestamp: v.timestamp,
      })),
    });
  });

  app.get("/meetings/:id/minutes", async (c) => {
    const id = c.req.param("id");
    const [existing] = await sql<{ texto: string }[]>`
      select texto from "MeetingMinutes" where "meetingId" = ${id}
    `;
    const texto = existing?.texto ?? (await generateMinutes(id));
    return c.json({ texto });
  });
}
