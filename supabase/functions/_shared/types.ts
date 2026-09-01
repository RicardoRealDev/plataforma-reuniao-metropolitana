export type MeetingStatus = "SCHEDULED" | "LIVE" | "CLOSED";
export type AgendaItemStatus = "PENDING" | "OPEN" | "CLOSED";
export type AttendanceSource = "MANUAL" | "CAMERA";
export type AttendanceStatus = "PRESENT" | "ABSENT";

export interface Council {
  id: string;
  name: string;
  slug: string;
}

export interface Member {
  id: string;
  councilId: string;
  segmento: string;
  ente: string;
  representante: string;
  pesoVoto: number;
  ordem: number;
}

export interface Meeting {
  id: string;
  councilId: string;
  titulo: string;
  status: MeetingStatus;
  livekitRoomName: string;
  sheetId: string | null;
  sheetUrl: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  titulo: string;
  status: AgendaItemStatus;
  candidato: string | null;
  ordem: number;
  openedAt: Date | null;
  closedAt: Date | null;
}

export interface AttendanceEvent {
  id: string;
  meetingId: string;
  memberId: string;
  source: AttendanceSource;
  status: AttendanceStatus;
  timestamp: Date;
}

export interface VoteSnapshot {
  id: string;
  agendaItemId: string;
  memberId: string;
  wasPresent: boolean;
  timestamp: Date;
}

export interface Vote {
  id: string;
  agendaItemId: string;
  memberId: string;
  choice: string;
  operatorId: string | null;
  timestamp: Date;
}

export interface MeetingMinutes {
  id: string;
  meetingId: string;
  texto: string;
  generatedAt: Date;
}
