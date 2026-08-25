export interface Member {
  id: string;
  councilId: string;
  segmento: string;
  ente: string;
  representante: string;
  pesoVoto: number;
  ordem: number;
}

export interface Council {
  id: string;
  name: string;
  slug: string;
  members: Member[];
}

export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'CLOSED';
export type AgendaItemStatus = 'PENDING' | 'OPEN' | 'CLOSED';

export interface Meeting {
  id: string;
  councilId: string;
  titulo: string;
  status: MeetingStatus;
  livekitRoomName: string;
  sheetUrl: string | null;
  createdAt: string;
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  titulo: string;
  status: AgendaItemStatus;
  candidato: string | null;
  ordem: number;
}

export interface MemberAttendance {
  member: Member;
  attendance: { present: boolean; manualStatus: string | null; cameraStatus: string | null };
}
