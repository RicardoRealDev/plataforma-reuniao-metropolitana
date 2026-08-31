import { Hono } from "jsr:@hono/hono@4";
import { z } from "npm:zod@3";
import { sql } from "../../_shared/db.ts";
import { issueParticipantToken } from "../../_shared/livekit/client.ts";
import { createMeetingSpreadsheet, syncMeetingToSheet } from "../../_shared/sheets/client.ts";
import { generateMinutes } from "../../_shared/domain/minutes.ts";
import type { AgendaItem, Council, Meeting, Member } from "../../_shared/types.ts";

const createMeetingSchema = z.object({
  councilId: z.string(),
  titulo: z.string().min(1),
});

const tokenSchema = z.object({
  memberId: z.string(),
});

export function registerMeetingRoutes(app: Hono) {
  app.post("/meetings", async (c) => {
    const body = createMeetingSchema.parse(await c.req.json());

    const [meeting] = await sql<Meeting[]>`
      insert into "Meeting" (id, "councilId", titulo, "livekitRoomName")
      values (${crypto.randomUUID()}, ${body.councilId}, ${body.titulo}, ${"reuniao-" + crypto.randomUUID()})
      returning *
    `;

    await createMeetingSpreadsheet(meeting.id);

    return c.json(meeting, 201);
  });

  app.get("/meetings/:id", async (c) => {
    const id = c.req.param("id");
    const [meeting] = await sql<Meeting[]>`select * from "Meeting" where id = ${id}`;
    if (!meeting) return c.json({ ok: false, erro: "reunião não encontrada" }, 404);

    const [council] = await sql<Council[]>`select * from "Council" where id = ${meeting.councilId}`;
    const members = await sql<Member[]>`
      select * from "Member" where "councilId" = ${meeting.councilId} order by "ordem" asc
    `;
    const agendaItems = await sql<AgendaItem[]>`
      select * from "AgendaItem" where "meetingId" = ${id} order by "ordem" asc
    `;

    return c.json({ ...meeting, council: { ...council, members }, agendaItems });
  });

  app.post("/meetings/:id/start", async (c) => {
    const id = c.req.param("id");
    const [meeting] = await sql<Meeting[]>`
      update "Meeting" set status = 'LIVE' where id = ${id} returning *
    `;
    if (!meeting) throw new Error(`Meeting ${id} não encontrado`);
    return c.json(meeting);
  });

  app.post("/meetings/:id/close", async (c) => {
    const id = c.req.param("id");
    const [meeting] = await sql<Meeting[]>`
      update "Meeting" set status = 'CLOSED', "closedAt" = now() where id = ${id} returning *
    `;
    if (!meeting) throw new Error(`Meeting ${id} não encontrado`);

    const texto = await generateMinutes(id);
    await syncMeetingToSheet(id);

    return c.json({ meeting, ata: texto });
  });

  app.post("/meetings/:id/token", async (c) => {
    const id = c.req.param("id");
    const { memberId } = tokenSchema.parse(await c.req.json());

    const [[meeting], [member]] = await Promise.all([
      sql<Meeting[]>`select * from "Meeting" where id = ${id}`,
      sql<Member[]>`select * from "Member" where id = ${memberId}`,
    ]);
    if (!meeting) throw new Error(`Meeting ${id} não encontrado`);
    if (!member) throw new Error(`Member ${memberId} não encontrado`);

    const token = await issueParticipantToken({
      roomName: meeting.livekitRoomName,
      identity: member.id,
      displayName: member.representante,
    });

    return c.json({ token, roomName: meeting.livekitRoomName });
  });
}
