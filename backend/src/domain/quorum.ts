import { prisma } from '../prisma.js';
import { getAptosNow } from './attendance.js';

/** Abre a pauta: tira um "retrato" (snapshot) de quem está apto a votar agora. */
export async function openAgendaItem(agendaItemId: string) {
  const agendaItem = await prisma.agendaItem.findUniqueOrThrow({
    where: { id: agendaItemId },
    include: { meeting: true },
  });

  const aptos = await getAptosNow(agendaItem.meeting.id, agendaItem.meeting.councilId);

  await prisma.$transaction([
    prisma.voteSnapshot.deleteMany({ where: { agendaItemId } }),
    prisma.voteSnapshot.createMany({
      data: aptos.map(({ member, present }) => ({
        agendaItemId,
        memberId: member.id,
        wasPresent: present,
      })),
    }),
    prisma.agendaItem.update({
      where: { id: agendaItemId },
      data: { status: 'OPEN', openedAt: new Date() },
    }),
  ]);

  return {
    aptos: aptos.filter((a) => a.present).length,
    ausentes: aptos.filter((a) => !a.present).length,
  };
}

/** Lança em massa: presentes recebem o voto favorável (ou candidato), ausentes ficam "Ausente". */
export async function bulkFavorableVote(agendaItemId: string, operatorId?: string) {
  const agendaItem = await prisma.agendaItem.findUniqueOrThrow({
    where: { id: agendaItemId },
    include: { snapshots: true },
  });

  const favorableChoice = agendaItem.candidato ?? 'Sim';

  await prisma.$transaction(
    agendaItem.snapshots.map((snapshot) =>
      prisma.vote.upsert({
        where: { agendaItemId_memberId: { agendaItemId, memberId: snapshot.memberId } },
        create: {
          agendaItemId,
          memberId: snapshot.memberId,
          choice: snapshot.wasPresent ? favorableChoice : 'Ausente',
          operatorId,
        },
        update: {
          choice: snapshot.wasPresent ? favorableChoice : 'Ausente',
          operatorId,
          timestamp: new Date(),
        },
      }),
    ),
  );
}

/** Exceção pontual: sobrescreve o voto de um membro específico. */
export async function registerVoteException(
  agendaItemId: string,
  memberId: string,
  choice: string,
  operatorId?: string,
) {
  return prisma.vote.upsert({
    where: { agendaItemId_memberId: { agendaItemId, memberId } },
    create: { agendaItemId, memberId, choice, operatorId },
    update: { choice, operatorId, timestamp: new Date() },
  });
}

export async function closeAgendaItem(agendaItemId: string) {
  return prisma.agendaItem.update({
    where: { id: agendaItemId },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
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
  const agendaItem = await prisma.agendaItem.findUniqueOrThrow({
    where: { id: agendaItemId },
    include: {
      snapshots: { include: { member: true } },
      votes: { include: { member: true } },
    },
  });

  const pesoTotalEnte = agendaItem.snapshots.reduce((sum, s) => sum + s.member.pesoVoto, 0);
  const aptosSnapshots = agendaItem.snapshots.filter((s) => s.wasPresent);
  const pesoTotalAptos = aptosSnapshots.reduce((sum, s) => sum + s.member.pesoVoto, 0);

  const distribuicaoVotos: Record<string, { contagem: number; peso: number }> = {};
  for (const vote of agendaItem.votes) {
    const bucket = distribuicaoVotos[vote.choice] ?? { contagem: 0, peso: 0 };
    bucket.contagem += 1;
    bucket.peso += vote.member.pesoVoto;
    distribuicaoVotos[vote.choice] = bucket;
  }

  return {
    aptos: aptosSnapshots.length,
    ausentes: agendaItem.snapshots.length - aptosSnapshots.length,
    pesoTotalAptos,
    pesoTotalEnte,
    quorumAtingido: pesoTotalEnte > 0 && pesoTotalAptos / pesoTotalEnte >= 0.5,
    distribuicaoVotos,
  };
}
