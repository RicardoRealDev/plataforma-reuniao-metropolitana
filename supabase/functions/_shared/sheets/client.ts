import { env } from "../env.ts";
import { sql } from "../db.ts";
import { getCurrentAttendance } from "../domain/attendance.ts";
import { getAgendaResult } from "../domain/quorum.ts";
import type { AgendaItem, Meeting, Member, Vote } from "../types.ts";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface MeetingWithCouncil extends Meeting {
  councilName: string;
}

interface VoteWithMember extends Vote {
  ente: string;
  representante: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function isEnabled(): boolean {
  const hasOauth = Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
  return env.SHEETS_SYNC_ENABLED && (hasOauth || Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON));
}

function base64Url(value: string | Uint8Array): string {
  const binary = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  let text = "";
  for (const byte of binary) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseCredentials(): ServiceAccountCredentials {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON não configurado");
  }
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccountCredentials;
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Credencial Google inválida: client_email/private_key ausentes");
  }
  return credentials;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "")),
    (char) => char.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  if (
    env.GOOGLE_OAUTH_CLIENT_ID &&
    env.GOOGLE_OAUTH_CLIENT_SECRET &&
    env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    });
    const body = await response.json();
    if (!response.ok || !body.access_token) {
      throw new Error(`Falha ao renovar OAuth Google (${response.status}): ${JSON.stringify(body)}`);
    }
    cachedToken = {
      value: body.access_token as string,
      expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  }

  const credentials = parseCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: SCOPES.join(" "),
    aud: credentials.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(credentials.private_key);
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  ));

  const response = await fetch(credentials.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Falha no OAuth Google (${response.status}): ${JSON.stringify(body)}`);
  }

  cachedToken = {
    value: body.access_token as string,
    expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function googleRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Google API ${response.status} em ${url}: ${JSON.stringify(body)}`);
  }
  return body as T;
}

async function getMeeting(meetingId: string): Promise<MeetingWithCouncil> {
  const [meeting] = await sql<MeetingWithCouncil[]>`
    select m.*, c.name as "councilName"
    from "Meeting" m
    join "Council" c on c.id = m."councilId"
    where m.id = ${meetingId}
  `;
  if (!meeting) throw new Error(`Meeting ${meetingId} não encontrado`);
  return meeting;
}

async function writeRange(sheetId: string, range: string, values: unknown[][]): Promise<void> {
  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values }) },
  );
}

export async function createMeetingSpreadsheet(
  meetingId: string,
): Promise<{ sheetId: string; sheetUrl: string } | null> {
  if (!isEnabled()) return null;

  const meeting = await getMeeting(meetingId);
  const created = await googleRequest<{ spreadsheetId: string; spreadsheetUrl: string }>(
    "https://sheets.googleapis.com/v4/spreadsheets",
    {
      method: "POST",
      body: JSON.stringify({
        properties: {
          title: `Ata — ${meeting.councilName} — ${new Date(meeting.createdAt).toLocaleDateString("pt-BR")}`,
        },
        sheets: ["Presença", "Votos", "Resumo"].map((title) => ({ properties: { title } })),
      }),
    },
  );

  for (const email of env.SHEETS_SHARE_WITH_EMAILS) {
    await googleRequest(
      `https://www.googleapis.com/drive/v3/files/${created.spreadsheetId}/permissions?sendNotificationEmail=false`,
      {
        method: "POST",
        body: JSON.stringify({ type: "user", role: "writer", emailAddress: email }),
      },
    );
  }

  await sql`
    update "Meeting"
    set "sheetId" = ${created.spreadsheetId}, "sheetUrl" = ${created.spreadsheetUrl}
    where id = ${meetingId}
  `;
  await syncMeetingToSheet(meetingId);
  return { sheetId: created.spreadsheetId, sheetUrl: created.spreadsheetUrl };
}

export async function syncMeetingToSheet(meetingId: string): Promise<void> {
  if (!isEnabled()) return;

  const meeting = await getMeeting(meetingId);
  if (!meeting.sheetId) return;

  const [members, agendaItems, attendance] = await Promise.all([
    sql<Member[]>`
      select * from "Member" where "councilId" = ${meeting.councilId} order by ordem asc
    `,
    sql<AgendaItem[]>`
      select * from "AgendaItem" where "meetingId" = ${meetingId} order by ordem asc
    `,
    getCurrentAttendance(meetingId),
  ]);

  const attendanceRows: unknown[][] = [
    ["Ente", "Representante", "Segmento", "Peso", "Presente", "Fonte manual", "Fonte câmera"],
    ...members.map((member) => {
      const current = attendance.get(member.id);
      return [
        member.ente,
        member.representante,
        member.segmento,
        member.pesoVoto,
        current?.present ? "Sim" : "Não",
        current?.manualStatus ?? "",
        current?.cameraStatus ?? "",
      ];
    }),
  ];

  const voteRows: unknown[][] = [["Pauta", "Ente", "Representante", "Voto"]];
  const summaryRows: unknown[][] = [["Pauta", "Aptos", "Ausentes", "Peso aptos", "Peso total", "Quórum"]];

  for (const item of agendaItems) {
    const votes = await sql<VoteWithMember[]>`
      select v.*, m.ente, m.representante
      from "Vote" v
      join "Member" m on m.id = v."memberId"
      where v."agendaItemId" = ${item.id}
      order by m.ordem asc
    `;
    for (const vote of votes) {
      voteRows.push([item.titulo, vote.ente, vote.representante, vote.choice]);
    }

    if (item.status === "OPEN" || item.status === "CLOSED") {
      const result = await getAgendaResult(item.id);
      summaryRows.push([
        item.titulo,
        result.aptos,
        result.ausentes,
        result.pesoTotalAptos,
        result.pesoTotalEnte,
        result.quorumAtingido ? "Atingido" : "Não atingido",
      ]);
    }
  }

  await Promise.all([
    writeRange(meeting.sheetId, "Presença!A1", attendanceRows),
    writeRange(meeting.sheetId, "Votos!A1", voteRows),
    writeRange(meeting.sheetId, "Resumo!A1", summaryRows),
  ]);
}

export async function scheduleSheetSync(meetingId: string): Promise<void> {
  await syncMeetingToSheet(meetingId);
}
