import { sql } from "../db.ts";
import { getAgendaResult } from "./quorum.ts";
import type { AgendaItem, Meeting } from "../types.ts";

export async function generateMinutes(meetingId: string): Promise<string> {
  const [meeting] = await sql<(Meeting & { councilName: string })[]>`
    select m.*, c.name as "councilName"
    from "Meeting" m
    join "Council" c on c.id = m."councilId"
    where m.id = ${meetingId}
  `;
  if (!meeting) throw new Error(`Meeting ${meetingId} não encontrado`);

  const agendaItems = await sql<AgendaItem[]>`
    select * from "AgendaItem" where "meetingId" = ${meetingId} order by "ordem" asc
  `;

  const lines: string[] = [];
  lines.push(`ATA DA REUNIÃO — ${meeting.councilName}`);
  lines.push(`${meeting.titulo}`);
  lines.push(`Data: ${new Date(meeting.createdAt).toLocaleString("pt-BR")}`);
  lines.push("");

  for (const item of agendaItems) {
    if (item.status !== "CLOSED") continue;
    const result = await getAgendaResult(item.id);
    lines.push(`Pauta: ${item.titulo}`);
    lines.push(
      `  Aptos: ${result.aptos} · Ausentes: ${result.ausentes} · ` +
        `Quórum (peso): ${result.pesoTotalAptos}/${result.pesoTotalEnte} — ` +
        `${result.quorumAtingido ? "ATINGIDO" : "NÃO ATINGIDO"}`,
    );
    for (const [choice, { contagem, peso }] of Object.entries(result.distribuicaoVotos)) {
      lines.push(`  ${choice}: ${contagem} voto(s), peso ${peso}`);
    }
    lines.push("");
  }

  const texto = lines.join("\n");

  await sql`
    insert into "MeetingMinutes" (id, "meetingId", texto, "generatedAt")
    values (${crypto.randomUUID()}, ${meetingId}, ${texto}, now())
    on conflict ("meetingId") do update set texto = excluded.texto, "generatedAt" = now()
  `;

  return texto;
}
