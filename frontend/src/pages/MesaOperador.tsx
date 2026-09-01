import { useEffect, useState, useCallback } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import type { AgendaItem, Council, Meeting, MemberAttendance } from '../lib/types.js';
import { useAuth } from '../lib/auth.js';

type MeetingDetail = Meeting & { council: Council; agendaItems: AgendaItem[] };

interface AgendaResult {
  aptos: number;
  ausentes: number;
  pesoTotalAptos: number;
  pesoTotalEnte: number;
  quorumAtingido: boolean;
  distribuicaoVotos: Record<string, { contagem: number; peso: number }>;
}

export function MesaOperador() {
  const { user } = useAuth();
  const { meetingId } = useParams<{ meetingId: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [attendance, setAttendance] = useState<MemberAttendance[]>([]);
  const [novaPauta, setNovaPauta] = useState('');
  const [candidato, setCandidato] = useState('');
  const [resultados, setResultados] = useState<Record<string, AgendaResult>>({});

  const carregar = useCallback(async () => {
    if (!meetingId) return;
    const [m, a] = await Promise.all([
      api.get<MeetingDetail>(`/meetings/${meetingId}`),
      api.get<MemberAttendance[]>(`/meetings/${meetingId}/attendance`),
    ]);
    setMeeting(m);
    setAttendance(a);
  }, [meetingId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function alternarPresenca(memberId: string, present: boolean) {
    if (!meetingId) return;
    await api.post(`/meetings/${meetingId}/attendance`, { memberId, status: present ? 'PRESENT' : 'ABSENT' });
    carregar();
  }

  async function criarPauta() {
    if (!meetingId || !novaPauta.trim()) return;
    await api.post(`/meetings/${meetingId}/agenda`, { titulo: novaPauta, candidato: candidato || undefined });
    setNovaPauta('');
    setCandidato('');
    carregar();
  }

  async function abrirPauta(agendaItemId: string) {
    await api.post(`/agenda/${agendaItemId}/open`);
    carregar();
  }

  async function todosFavoraveis(agendaItemId: string) {
    await api.post(`/agenda/${agendaItemId}/bulk-favorable`, {});
    await verResultado(agendaItemId);
  }

  async function fecharPauta(agendaItemId: string) {
    await api.post(`/agenda/${agendaItemId}/close`);
    carregar();
    verResultado(agendaItemId);
  }

  async function verResultado(agendaItemId: string) {
    const result = await api.get<AgendaResult>(`/agenda/${agendaItemId}/result`);
    setResultados((prev) => ({ ...prev, [agendaItemId]: result }));
  }

  async function iniciarReuniao() {
    if (!meetingId) return;
    await api.post(`/meetings/${meetingId}/start`);
    carregar();
  }

  async function encerrarReuniao() {
    if (!meetingId) return;
    await api.post(`/meetings/${meetingId}/close`);
    carregar();
  }

  if (user?.accessLevel === 'PARTICIPANT') return <Navigate to="/" replace />;
  if (!meeting) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{meeting.titulo}</h1>
          <p className="text-gray-500">
            {meeting.council.name} — status: {meeting.status}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="rounded bg-emerald-700 px-3 py-2 text-sm text-white" onClick={iniciarReuniao}>
            Iniciar
          </button>
          <button className="rounded bg-red-700 px-3 py-2 text-sm text-white" onClick={encerrarReuniao}>
            Encerrar
          </button>
        </div>
      </div>

      {meeting.sheetUrl && (
        <a className="block text-sm text-slate-700 underline" href={meeting.sheetUrl} target="_blank" rel="noreferrer">
          Abrir planilha da reunião (Google Sheets)
        </a>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Presença manual (Plano B)</h2>
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {attendance.map(({ member, attendance: a }) => (
            <li key={member.id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">
                  {member.ente} — {member.representante}
                </div>
                <div className="text-xs text-gray-500">
                  manual: {a.manualStatus ?? '—'} · câmera: {a.cameraStatus ?? '—'}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className={`rounded px-3 py-1 text-sm ${a.present ? 'bg-emerald-600 text-white' : 'bg-gray-100'}`}
                  onClick={() => alternarPresenca(member.id, true)}
                >
                  Presente
                </button>
                <button
                  className={`rounded px-3 py-1 text-sm ${!a.present ? 'bg-red-600 text-white' : 'bg-gray-100'}`}
                  onClick={() => alternarPresenca(member.id, false)}
                >
                  Ausente
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Pautas</h2>
        <div className="mb-4 flex gap-2">
          <input
            className="flex-1 rounded border border-gray-300 p-2"
            placeholder="Título da pauta (ex: Vice-Presidência)"
            value={novaPauta}
            onChange={(e) => setNovaPauta(e.target.value)}
          />
          <input
            className="w-48 rounded border border-gray-300 p-2"
            placeholder="Candidato (opcional)"
            value={candidato}
            onChange={(e) => setCandidato(e.target.value)}
          />
          <button className="rounded bg-slate-800 px-4 py-2 text-white" onClick={criarPauta}>
            Adicionar
          </button>
        </div>

        <ul className="space-y-3">
          {meeting.agendaItems.map((item) => {
            const result = resultados[item.id];
            return (
              <li key={item.id} className="rounded border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium">
                    {item.titulo} {item.candidato && `— ${item.candidato}`}
                  </div>
                  <span className="text-xs text-gray-500">{item.status}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-slate-700 px-3 py-1 text-sm text-white" onClick={() => abrirPauta(item.id)}>
                    Abrir votação
                  </button>
                  <button className="rounded bg-slate-700 px-3 py-1 text-sm text-white" onClick={() => todosFavoraveis(item.id)}>
                    Todos presentes favoráveis
                  </button>
                  <button className="rounded bg-slate-700 px-3 py-1 text-sm text-white" onClick={() => fecharPauta(item.id)}>
                    Fechar pauta
                  </button>
                  <button className="rounded bg-gray-200 px-3 py-1 text-sm" onClick={() => verResultado(item.id)}>
                    Ver resultado
                  </button>
                </div>
                {result && (
                  <div className="mt-3 text-sm text-gray-700">
                    Aptos: {result.aptos} · Ausentes: {result.ausentes} · Peso: {result.pesoTotalAptos}/{result.pesoTotalEnte} ·{' '}
                    <span className={result.quorumAtingido ? 'text-emerald-700' : 'text-red-700'}>
                      {result.quorumAtingido ? 'Quórum atingido' : 'Quórum não atingido'}
                    </span>
                    <div className="mt-1">
                      {Object.entries(result.distribuicaoVotos).map(([choice, v]) => (
                        <span key={choice} className="mr-3">
                          {choice}: {v.contagem} (peso {v.peso})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
