import { TrackSource } from "npm:livekit-server-sdk@2";
import { webhookReceiver } from "../_shared/livekit/client.ts";
import { sql } from "../_shared/db.ts";
import { recordAttendance } from "../_shared/domain/attendance.ts";
import { scheduleSheetSync } from "../_shared/sheets/client.ts";
import type { Meeting } from "../_shared/types.ts";

/**
 * O LiveKit assina o corpo bruto do POST (JWT no header Authorization cobrindo
 * um hash do body) — por isso o body precisa chegar aqui sem qualquer parsing
 * prévio, senão a verificação de assinatura falha. `req.text()` do Deno já
 * entrega isso puro, sem parser de content-type no meio do caminho (mesma
 * garantia que o content-type parser customizado do Fastify original dava).
 *
 * Função isolada sem Hono de propósito: um middleware que leia o body antes
 * da hora quebraria essa verificação.
 */
Deno.serve(async (req) => {
  const authHeader = req.headers.get("authorization") ?? "";
  const rawBody = await req.text();

  let event;
  try {
    event = await webhookReceiver.receive(rawBody, authHeader);
  } catch (err) {
    console.warn("assinatura de webhook do LiveKit inválida", err);
    return Response.json({ ok: false, erro: "assinatura inválida" }, { status: 401 });
  }

  const roomName = event.room?.name;
  const identity = event.participant?.identity;

  if (roomName && identity) {
    const [meeting] = await sql<Meeting[]>`
      select * from "Meeting" where "livekitRoomName" = ${roomName}
    `;

    if (meeting) {
      let changed = false;
      if (event.event === "track_published" && event.track?.source === TrackSource.CAMERA) {
        await recordAttendance(meeting.id, identity, "CAMERA", "PRESENT");
        changed = true;
      } else if (event.event === "track_unpublished" && event.track?.source === TrackSource.CAMERA) {
        await recordAttendance(meeting.id, identity, "CAMERA", "ABSENT");
        changed = true;
      } else if (event.event === "participant_left") {
        await recordAttendance(meeting.id, identity, "CAMERA", "ABSENT");
        changed = true;
      }
      if (changed) await scheduleSheetSync(meeting.id);
    }
  }

  return Response.json({ ok: true });
});
