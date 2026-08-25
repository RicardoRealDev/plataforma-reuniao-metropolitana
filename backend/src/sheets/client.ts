import fs from 'node:fs';
import { google } from 'googleapis';
import { env } from '../env.js';
import { prisma } from '../prisma.js';
import { getCurrentAttendance } from '../domain/attendance.js';
import { getAgendaResult } from '../domain/quorum.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'];

function isEnabled(): boolean {
  return env.SHEETS_SYNC_ENABLED && !!env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH && fs.existsSync(env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH);
}

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
    scopes: SCOPES,
  });
}

/**
 * Cria a planilha de saída da reunião (Postgres continua sendo a fonte de
 * verdade — isto é só um espelho no formato que os conselhos já conhecem).
 * Sem credenciais configuradas, a Fase 1 continua funcionando normalmente
 * sem essa sincronização.
 */
export async function createMeetingSpreadsheet(meetingId: string): Promise<{ sheetId: string; sheetUrl: string } | null> {
  if (!isEnabled()) return null;

  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId }, include: { council: true } });
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: `Ata — ${meeting.council.name} — ${meeting.createdAt.toLocaleDateString('pt-BR')}` },
      sheets: [{ properties: { title: 'Presença' } }, { properties: { title: 'Votos' } }, { properties: { title: 'Resumo' } }],
    },
  });

  const sheetId = created.data.spreadsheetId!;
  const sheetUrl = created.data.spreadsheetUrl!;

  for (const email of env.SHEETS_SHARE_WITH_EMAILS) {
    await drive.permissions.create({
      fileId: sheetId,
      sendNotificationEmail: false,
      requestBody: { type: 'user', role: 'writer', emailAddress: email },
    });
  }

  await prisma.meeting.update({ where: { id: meetingId }, data: { sheetId, sheetUrl } });

  return { sheetId, sheetUrl };
}

async function writeRange(sheetId: string, range: string, values: unknown[][]) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

export async function syncMeetingToSheet(meetingId: string) {
  if (!isEnabled()) return;

  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { agendaItems: { orderBy: { ordem: 'asc' } }, council: { include: { members: { orderBy: { ordem: 'asc' } } } } },
  });
  if (!meeting.sheetId) return;

  const attendance = await getCurrentAttendance(meetingId);
  const attendanceRows = [
    ['Ente', 'Representante', 'Segmento', 'Peso', 'Presente', 'Fonte manual', 'Fonte câmera'],
    ...meeting.council.members.map((m) => {
      const a = attendance.get(m.id);
      return [m.ente, m.representante, m.segmento, m.pesoVoto, a?.present ? 'Sim' : 'Não', a?.manualStatus ?? '', a?.cameraStatus ?? ''];
    }),
  ];
  await writeRange(meeting.sheetId, 'Presença!A1', attendanceRows);

  const voteRows: unknown[][] = [['Pauta', 'Ente', 'Representante', 'Voto']];
  const summaryRows: unknown[][] = [['Pauta', 'Aptos', 'Ausentes', 'Peso aptos', 'Peso total', 'Quórum']];

  for (const item of meeting.agendaItems) {
    const votes = await prisma.vote.findMany({ where: { agendaItemId: item.id }, include: { member: true } });
    for (const vote of votes) {
      voteRows.push([item.titulo, vote.member.ente, vote.member.representante, vote.choice]);
    }

    if (item.status === 'OPEN' || item.status === 'CLOSED') {
      const result = await getAgendaResult(item.id);
      summaryRows.push([
        item.titulo,
        result.aptos,
        result.ausentes,
        result.pesoTotalAptos,
        result.pesoTotalEnte,
        result.quorumAtingido ? 'Atingido' : 'Não atingido',
      ]);
    }
  }

  await writeRange(meeting.sheetId, 'Votos!A1', voteRows);
  await writeRange(meeting.sheetId, 'Resumo!A1', summaryRows);
}

const pendingSync = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 4000;

/** Enfileira uma sincronização com a planilha, agrupando eventos próximos no tempo. */
export function scheduleSheetSync(meetingId: string) {
  if (!isEnabled()) return;

  const existing = pendingSync.get(meetingId);
  if (existing) clearTimeout(existing);

  pendingSync.set(
    meetingId,
    setTimeout(() => {
      pendingSync.delete(meetingId);
      syncMeetingToSheet(meetingId).catch((err) => console.error('Falha ao sincronizar planilha:', err));
    }, DEBOUNCE_MS),
  );
}
