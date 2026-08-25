import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';

interface DashboardData {
  reuniao: { titulo: string; status: string; conselho: string };
  resumo: { totalMembros: number; presentes: number; ausentes: number };
  presencaPorSegmento: Record<string, { presentes: number; total: number }>;
  presencaPorEnte: Record<string, boolean>;
  resultadosPorPauta: Array<{
    pauta: string;
    status: string;
    aptos: number;
    ausentes: number;
    quorumAtingido: boolean;
    distribuicaoVotos: Record<string, { contagem: number; peso: number }>;
  }>;
  votosRecentes: Array<{ pauta: string; ente: string; representante: string; voto: string; timestamp: string }>;
}

export function Dashboard() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    const load = () => api.get<DashboardData>(`/meetings/${meetingId}/dashboard`).then(setData);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [meetingId]);

  if (!data) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">{data.reuniao.titulo}</h1>
        <p className="text-gray-500">
          {data.reuniao.conselho} — {data.reuniao.status}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded border border-gray-200 p-4 text-center">
          <div className="text-3xl font-semibold">{data.resumo.totalMembros}</div>
          <div className="text-sm text-gray-500">Membros</div>
        </div>
        <div className="rounded border border-gray-200 p-4 text-center">
          <div className="text-3xl font-semibold text-emerald-700">{data.resumo.presentes}</div>
          <div className="text-sm text-gray-500">Presentes</div>
        </div>
        <div className="rounded border border-gray-200 p-4 text-center">
          <div className="text-3xl font-semibold text-red-700">{data.resumo.ausentes}</div>
          <div className="text-sm text-gray-500">Ausentes</div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Presença por segmento</h2>
        <div className="space-y-2">
          {Object.entries(data.presencaPorSegmento).map(([segmento, v]) => (
            <div key={segmento}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{segmento}</span>
                <span>
                  {v.presentes}/{v.total}
                </span>
              </div>
              <div className="h-2 w-full rounded bg-gray-100">
                <div className="h-2 rounded bg-emerald-600" style={{ width: `${(v.presentes / v.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Presença por ente</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.presencaPorEnte).map(([ente, present]) => (
            <span
              key={ente}
              className={`rounded-full px-3 py-1 text-sm ${present ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
            >
              {ente}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Resultado por pauta</h2>
        <ul className="space-y-2">
          {data.resultadosPorPauta.map((r) => (
            <li key={r.pauta} className="rounded border border-gray-200 p-3">
              <div className="font-medium">
                {r.pauta} <span className="text-xs text-gray-500">({r.status})</span>
              </div>
              <div className="text-sm text-gray-700">
                Aptos: {r.aptos} · Ausentes: {r.ausentes} ·{' '}
                <span className={r.quorumAtingido ? 'text-emerald-700' : 'text-red-700'}>
                  {r.quorumAtingido ? 'Quórum atingido' : 'Quórum não atingido'}
                </span>
              </div>
              <div className="mt-1 text-sm">
                {Object.entries(r.distribuicaoVotos).map(([choice, v]) => (
                  <span key={choice} className="mr-3">
                    {choice}: {v.contagem}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Últimos votos</h2>
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {data.votosRecentes.map((v, i) => (
            <li key={i} className="flex justify-between p-2 text-sm">
              <span>
                {v.ente} — {v.representante} ({v.pauta})
              </span>
              <span className="font-medium">{v.voto}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
