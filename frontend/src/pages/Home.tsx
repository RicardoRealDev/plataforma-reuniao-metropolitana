import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import type { Council, Meeting } from '../lib/types.js';

export function Home() {
  const [councils, setCouncils] = useState<Council[]>([]);
  const [councilId, setCouncilId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    api.get<Council[]>('/councils').then((data) => {
      setCouncils(data);
      if (data[0]) setCouncilId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!councilId) return;
    api.get<Meeting[]>(`/councils/${councilId}/meetings`).then(setMeetings);
  }, [councilId]);

  async function criarReuniao() {
    if (!councilId || !titulo.trim()) return;
    const meeting = await api.post<Meeting>('/meetings', { councilId, titulo });
    setMeetings((prev) => [meeting, ...prev]);
    setTitulo('');
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold mb-6">Quórum Digital</h1>

      <div className="mb-8 space-y-3">
        <label className="block text-sm font-medium text-gray-700">Conselho</label>
        <select
          className="w-full rounded border border-gray-300 p-2"
          value={councilId}
          onChange={(e) => setCouncilId(e.target.value)}
        >
          {councils.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray-700">Título da reunião</label>
        <input
          className="w-full rounded border border-gray-300 p-2"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex: Reunião de instalação e apuração"
        />
        <button className="rounded bg-slate-800 px-4 py-2 text-white" onClick={criarReuniao}>
          Criar reunião
        </button>
      </div>

      <h2 className="mb-3 text-lg font-medium">Reuniões</h2>
      <ul className="space-y-2">
        {meetings.map((meeting) => (
          <li key={meeting.id} className="flex items-center justify-between rounded border border-gray-200 p-3">
            <div>
              <div className="font-medium">{meeting.titulo}</div>
              <div className="text-sm text-gray-500">{meeting.status}</div>
            </div>
            <div className="flex gap-3 text-sm">
              <Link className="text-slate-700 underline" to={`/reuniao/${meeting.id}/mesa`}>
                Mesa
              </Link>
              <Link className="text-slate-700 underline" to={`/reuniao/${meeting.id}/sala`}>
                Sala de vídeo
              </Link>
              <Link className="text-slate-700 underline" to={`/reuniao/${meeting.id}/dashboard`}>
                Dashboard
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
