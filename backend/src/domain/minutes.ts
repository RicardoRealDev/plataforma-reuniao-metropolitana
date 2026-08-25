import { prisma } from '../prisma.js';
import { getAgendaResult } from './quorum.js';

export async function generateMinutes(meetingId: string): Promise<string> {
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: {
      council: true,
      agendaItems: { orderBy: { ordem: 'asc' } },
    },
  });

  const lines: string[] = [];
  lines.push(`ATA DA REUNIÃO — ${meeting.council.name}`);
  lines.push(`${meeting.titulo}`);
  lines.push(`Data: ${meeting.createdAt.toLocaleString('pt-BR')}`);
  lines.push('');

  for (const item of meeting.agendaItems) {
    if (item.status !== 'CLOSED') continue;
    const result = await getAgendaResult(item.id);
    lines.push(`Pauta: ${item.titulo}`);
    lines.push(
      `  Aptos: ${result.aptos} · Ausentes: ${result.ausentes} · ` +
        `Quórum (peso): ${result.pesoTotalAptos}/${result.pesoTotalEnte} — ` +
        `${result.quorumAtingido ? 'ATINGIDO' : 'NÃO ATINGIDO'}`,
    );
    for (const [choice, { contagem, peso }] of Object.entries(result.distribuicaoVotos)) {
      lines.push(`  ${choice}: ${contagem} voto(s), peso ${peso}`);
    }
    lines.push('');
  }

  const texto = lines.join('\n');

  await prisma.meetingMinutes.upsert({
    where: { meetingId },
    create: { meetingId, texto },
    update: { texto, generatedAt: new Date() },
  });

  return texto;
}
