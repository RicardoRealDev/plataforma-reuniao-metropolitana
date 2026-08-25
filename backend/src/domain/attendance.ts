import { prisma } from '../prisma.js';
import type { AttendanceSource, AttendanceStatus } from '@prisma/client';

/**
 * Presença dual-source: manual (Plano B) e câmera (LiveKit) convivem na mesma
 * sessão. A presença final de um membro é a união das duas fontes — se
 * QUALQUER fonte disser "presente" no seu evento mais recente, o membro conta
 * como presente. Uma fonte nunca apaga o estado da outra (mesma regra do
 * doPost/processarEventoZoom_ do Code.gs original).
 */

export async function recordAttendance(
  meetingId: string,
  memberId: string,
  source: AttendanceSource,
  status: AttendanceStatus,
) {
  return prisma.attendanceEvent.create({
    data: { meetingId, memberId, source, status },
  });
}

export interface MemberAttendance {
  memberId: string;
  present: boolean;
  manualStatus: AttendanceStatus | null;
  cameraStatus: AttendanceStatus | null;
}

export async function getCurrentAttendance(meetingId: string): Promise<Map<string, MemberAttendance>> {
  const events = await prisma.attendanceEvent.findMany({
    where: { meetingId },
    orderBy: { timestamp: 'asc' },
  });

  const latestBySource = new Map<string, { manual?: AttendanceStatus; camera?: AttendanceStatus }>();
  for (const event of events) {
    const entry = latestBySource.get(event.memberId) ?? {};
    if (event.source === 'MANUAL') entry.manual = event.status;
    if (event.source === 'CAMERA') entry.camera = event.status;
    latestBySource.set(event.memberId, entry);
  }

  const result = new Map<string, MemberAttendance>();
  for (const [memberId, { manual, camera }] of latestBySource) {
    result.set(memberId, {
      memberId,
      present: manual === 'PRESENT' || camera === 'PRESENT',
      manualStatus: manual ?? null,
      cameraStatus: camera ?? null,
    });
  }
  return result;
}

export async function getAptosNow(meetingId: string, councilId: string) {
  const [members, attendance] = await Promise.all([
    prisma.member.findMany({ where: { councilId }, orderBy: { ordem: 'asc' } }),
    getCurrentAttendance(meetingId),
  ]);

  return members.map((member) => ({
    member,
    present: attendance.get(member.id)?.present ?? false,
  }));
}
