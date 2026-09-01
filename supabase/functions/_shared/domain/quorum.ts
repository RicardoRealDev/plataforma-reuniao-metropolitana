import { sql } from "../db.ts";
import { getAptosNow } from "./attendance.ts";
import type { AgendaItem, Meeting, Vote, VoteSnapshot } from "../types.ts";

/** Abre a pauta: tira um "retrato" (snapshot) de quem está apto a votar agora. */
export async function openAgendaItem(agendaItemId: string) {
  const [agendaItem] = await sql<AgendaItem[]>`select * from "AgendaItem" where id = ${agendaItemId}`;
  if (!agendaItem) throw new Error(`AgendaItem ${agendaItemId} não encontrado`);

  const [meeting] = await sql<Meeting[]>`select * from "Meeting" where id = ${agendaItem.meetingId}`;
  if (!meeting) throw new Error(`Meeting ${agendaItem.meetingId} não encontrado`);

  const aptos = await getAptosNow(meeting.id, meeting.councilId);

  await sql.begin(async (tx) => {
    await tx`delete from "VoteSnapshot" where "agendaItemId" = ${agendaItemId}`;

    if (aptos.length > 0) {
      const rows = aptos.map(({ member, present }) => ({
        id: crypto.randomUUID(),
        agendaItemId,
        memberId: member.id,
        wasPresent: present,
      }));
      await tx`insert into "VoteSnapshot" ${tx(rows, "id", "agendaItemId", "memberId", "wasPresent")}`;
    }

    await tx`update "AgendaItem" set status = 'OPEN', "openedAt" = now() where id = ${agendaItemId}`;
  });

  return {
    aptos: aptos.filter((a) => a.present).length,
    ausentes: aptos.filter((a) => !a.present).length,
  };
}

/** Lança em massa: presentes recebem o voto favorável (ou candidato), ausentes ficam "Ausente". */
export async function bulkFavorableVote(agendaItemId: string, operatorId?: string) {
  const [agendaItem] = await sql<AgendaItem[]>`select * from "AgendaItem" where id = ${agendaItemId}`;
  if (!agendaItem) throw new Error(`AgendaItem ${agendaItemId} não encontrado`);

  const snapshots = await sql<VoteSnapshot[]>`select * from "VoteSnapshot" where "agendaItemId" = ${agendaItemId}`;
  const favorableChoice = agendaItem.candidato ?? "Sim";

  await sql.begin(async (tx) => {
    for (const snapshot of snapshots) {
      const choice = snapshot.wasPresent ? favorableChoice : "Ausente";
      await tx`
        insert into "Vote" (id, "agendaItemId", "memberId", choice, "operatorId")
        values (${crypto.randomUUID()}, ${agendaItemId}, ${snapshot.memberId}, ${choice}, ${operatorId ?? null})
        on conflict ("agendaItemId", "memberId")
        do update set choice = excluded.choice, "operatorId" = excluded."operatorId", "timestamp" = now()
      `;
    }
  });
}

/** Exceção pontual: sobrescreve o voto de um membro específico. */
export async function registerVoteException(
  agendaItemId: string,
  memberId: string,
  choice: string,
  operatorId?: string,
): Promise<Vote> {
  const [vote] = await sql<Vote[]>`
    insert into "Vote" (id, "agendaItemId", "memberId", choice, "operatorId")
    values (${crypto.randomUUID()}, ${agendaItemId}, ${memberId}, ${choice}, ${operatorId ?? null})
    on conflict ("agendaItemId", "memberId")
    do update set choice = excluded.choice, "operatorId" = excluded."operatorId", "timestamp" = now()
    returning *
  `;
  return vote;
}

export async function closeAgendaItem(agendaItemId: string): Promise<AgendaItem> {
  const [item] = await sql<AgendaItem[]>`
    update "AgendaItem" set status = 'CLOSED', "closedAt" = now() where id = ${agendaItemId} returning *
  `;
  if (!item) throw new Error(`AgendaItem ${agendaItemId} não encontrado`);
  return item;
}

export interface AgendaResult {
  aptos: number;
  ausentes: number;
  pesoTotalAptos: number;
  pesoTotalEnte: number;
  quorumAtingido: boolean;
  distribuicaoVotos: Record<string, { contagem: number; peso: number }>;
}

/** Quórum e resultado ponderados pelo peso de voto de cada ente (município/estado). */
export async function getAgendaResult(agendaItemId: string): Promise<AgendaResult> {
  const [exists] = await sql<{ id: string }[]>`select id from "AgendaItem" where id = ${agendaItemId}`;
  if (!exists) throw new Error(`AgendaItem ${agendaItemId} não encontrado`);

  const snapshots = await sql<(VoteSnapshot & { pesoVoto: number })[]>`
    select s.*, m."pesoVoto" as "pesoVoto"
    from "VoteSnapshot" s
    join "Member" m on m.id = s."memberId"
    where s."agendaItemId" = ${agendaItemId}
  `;
  const votes = await sql<(Vote & { pesoVoto: number })[]>`
    select v.*, m."pesoVoto" as "pesoVoto"
    from "Vote" v
    join "Member" m on m.id = v."memberId"
    where v."agendaItemId" = ${agendaItemId}
  `;

  const pesoTotalEnte = snapshots.reduce((sum, s) => sum + s.pesoVoto, 0);
  const aptosSnapshots = snapshots.filter((s) => s.wasPresent);
  const pesoTotalAptos = aptosSnapshots.reduce((sum, s) => sum + s.pesoVoto, 0);

  const distribuicaoVotos: Record<string, { contagem: number; peso: number }> = {};
  for (const vote of votes) {
    const bucket = distribuicaoVotos[vote.choice] ?? { contagem: 0, peso: 0 };
    bucket.contagem += 1;
    bucket.peso += vote.pesoVoto;
    distribuicaoVotos[vote.choice] = bucket;
  }

  return {
    aptos: aptosSnapshots.length,
    ausentes: snapshots.length - aptosSnapshots.length,
    pesoTotalAptos,
    pesoTotalEnte,
    quorumAtingido: pesoTotalEnte > 0 && pesoTotalAptos / pesoTotalEnte >= 0.5,
    distribuicaoVotos,
  };
}
