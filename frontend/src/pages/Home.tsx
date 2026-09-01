import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import type { Council, Meeting } from '../lib/types.js';
import { useAuth } from '../lib/auth.js';

export function Home() {
  const { user, logout } = useAuth();
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
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quórum Digital</h1>
          {user && <p className="mt-1 text-sm text-gray-500">{user.name} · {user.function} · {user.institution}</p>}
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            {user.accessLevel === 'ADMIN' && <Link className="text-sm text-slate-700 underline" to="/admin/identidades">Identidades</Link>}
            <button className="text-sm text-slate-700 underline" onClick={() => void logout()}>Sair</button>
          </div>
        ) : (
          <Link className="rounded bg-slate-800 px-4 py-2 text-sm text-white" to="/login">Entrar</Link>
        )}
      </div>

      {user?.identityVerified && (
        <p className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Identidade verificada pelo certificado ICP-Brasil: {user.certificateIdentityName ?? user.name}
        </p>
      )}

      {user && user.accessLevel !== 'PARTICIPANT' && <div className="mb-8 space-y-3">
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
      </div>}

      <h2 className="mb-3 text-lg font-medium">Reuniões</h2>
      <ul className="space-y-2">
        {meetings.map((meeting) => (
          <li key={meeting.id} className="flex items-center justify-between rounded border border-gray-200 p-3">
            <div>
              <div className="font-medium">{meeting.titulo}</div>
              <div className="text-sm text-gray-500">{meeting.status}</div>
            </div>
            <div className="flex gap-3 text-sm">
              {user && user.accessLevel !== 'PARTICIPANT' && <Link className="text-slate-700 underline" to={`/reuniao/${meeting.id}/mesa`}>
                Mesa
              </Link>}
              {user && <Link className="text-slate-700 underline" to={`/reuniao/${meeting.id}/sala`}>
                Sala de vídeo
              </Link>}
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
