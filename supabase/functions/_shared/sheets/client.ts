import { env } from "../env.ts";

/**
 * Sincronização com Google Sheets — porte pendente (Fase 6 do plano de
 * migração). SHEETS_SYNC_ENABLED é false em produção hoje, então isso é um
 * no-op na prática; quando for ligado, isso precisa da integração real com
 * googleapis (ou REST + JWT via Web Crypto, se googleapis não rodar no Deno).
 */
export async function createMeetingSpreadsheet(_meetingId: string): Promise<void> {
  if (!env.SHEETS_SYNC_ENABLED) return;
  console.warn("SHEETS_SYNC_ENABLED=true mas a sincronização ainda não foi portada (Fase 6 pendente)");
}

export async function syncMeetingToSheet(_meetingId: string): Promise<void> {
  if (!env.SHEETS_SYNC_ENABLED) return;
  console.warn("SHEETS_SYNC_ENABLED=true mas a sincronização ainda não foi portada (Fase 6 pendente)");
}

// Sem debounce: cada chamada sincroniza direto. O setTimeout+Map em memória
// do backend Fastify original não sobrevive entre invocações de Edge Function.
export async function scheduleSheetSync(meetingId: string): Promise<void> {
  await syncMeetingToSheet(meetingId);
}
