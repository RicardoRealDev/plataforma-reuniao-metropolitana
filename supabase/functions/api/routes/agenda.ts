import { Hono } from "jsr:@hono/hono@4";
import { z } from "npm:zod@3";
import { sql } from "../../_shared/db.ts";
import {
  openAgendaItem,
  bulkFavorableVote,
  registerVoteException,
  closeAgendaItem,
  getAgendaResult,
} from "../../_shared/domain/quorum.ts";
import { scheduleSheetSync } from "../../_shared/sheets/client.ts";
import type { AgendaItem } from "../../_shared/types.ts";
import { isAuthResponse, requireAuth } from "../../_shared/auth.ts";

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

async function getAgendaItemOrThrow(id: string): Promise<AgendaItem> {
  const [item] = await sql<AgendaItem[]>`select * from "AgendaItem" where id = ${id}`;
  if (!item) throw new Error(`AgendaItem ${id} não encontrado`);
  return item;
}

export function registerAgendaRoutes(app: Hono) {
  app.post("/meetings/:id/agenda", async (c) => {
    const auth = await requireAuth(c, ["ADMIN", "OPERATOR"]);
    if (isAuthResponse(auth)) return auth;
    const id = c.req.param("id");
    const body = createAgendaSchema.parse(await c.req.json());
    const [item] = await sql<AgendaItem[]>`
      insert into "AgendaItem" (id, "meetingId", titulo, candidato, ordem)
      values (${crypto.randomUUID()}, ${id}, ${body.titulo}, ${body.candidato ?? null}, ${body.ordem})
      returning *
    `;
    return c.json(item, 201);
  });

  app.post("/agenda/:id/open", async (c) => {
    const auth = await requireAuth(c, ["ADMIN", "OPERATOR"]);
    if (isAuthResponse(auth)) return auth;
    const id = c.req.param("id");
    const result = await openAgendaItem(id);
    const item = await getAgendaItemOrThrow(id);
    await scheduleSheetSync(item.meetingId);
    return c.json(result);
  });

  app.post("/agenda/:id/bulk-favorable", async (c) => {
    const auth = await requireAuth(c, ["ADMIN", "OPERATOR"]);
    if (isAuthResponse(auth)) return auth;
    const id = c.req.param("id");
    await bulkFavorableVote(id, auth.id);
    const item = await getAgendaItemOrThrow(id);
    await scheduleSheetSync(item.meetingId);
    return c.json({ ok: true });
  });

  app.post("/agenda/:id/votes", async (c) => {
    const auth = await requireAuth(c, ["ADMIN", "OPERATOR"]);
    if (isAuthResponse(auth)) return auth;
    const id = c.req.param("id");
    const { memberId, choice } = voteSchema.parse(await c.req.json());
    await registerVoteException(id, memberId, choice, auth.id);
    const item = await getAgendaItemOrThrow(id);
    await scheduleSheetSync(item.meetingId);
    return c.json({ ok: true });
  });

  app.post("/agenda/:id/close", async (c) => {
    const auth = await requireAuth(c, ["ADMIN", "OPERATOR"]);
    if (isAuthResponse(auth)) return auth;
    const id = c.req.param("id");
    const item = await closeAgendaItem(id);
    await scheduleSheetSync(item.meetingId);
    return c.json(item);
  });

  app.get("/agenda/:id/result", async (c) => {
    const id = c.req.param("id");
    const result = await getAgendaResult(id);
    return c.json(result);
  });
}
