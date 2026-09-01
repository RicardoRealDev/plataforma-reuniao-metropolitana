import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import type { Council, Member } from '../lib/types.js';

interface PendingEnrollment {
  id: string;
  name: string;
  type: 'PF' | 'PJ' | 'UNKNOWN';
  documentMasked: string | null;
  legalEntityName: string | null;
  issuerName: string;
  fingerprintLast8: string;
  serialLast8: string;
  validTo: string;
  createdAt: string;
}

interface CertificateCredential {
  id: string;
  fingerprintLast8: string;
  subjectName: string;
  certificateType: 'PF' | 'PJ' | 'UNKNOWN';
  issuerName: string;
  validTo: string | null;
  status: 'ACTIVE' | 'REVOKED';
  lastUsedAt: string | null;
  userId: string;
  name: string;
  institution: string;
  function: string;
  accessLevel: 'ADMIN' | 'OPERATOR' | 'PARTICIPANT';
  memberId: string | null;
}

export function Identidades() {
  const [pending, setPending] = useState<PendingEnrollment[]>([]);
  const [credentials, setCredentials] = useState<CertificateCredential[]>([]);
  const [councils, setCouncils] = useState<Council[]>([]);
  const [memberByEnrollment, setMemberByEnrollment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [erro, setErro] = useState('');

  const members = useMemo(
    () => councils.flatMap((council) => council.members.map((member) => ({ council, member }))),
    [councils],
  );

  const load = useCallback(async () => {
    setErro('');
    try {
      const [pendingResult, credentialsResult, councilsResult] = await Promise.all([
        api.get<PendingEnrollment[]>('/admin/certificate-enrollments'),
        api.get<CertificateCredential[]>('/admin/certificate-credentials'),
        api.get<Council[]>('/councils'),
      ]);
      setPending(pendingResult);
      setCredentials(credentialsResult);
      setCouncils(councilsResult);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível carregar as identidades.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(enrollment: PendingEnrollment) {
    const memberId = memberByEnrollment[enrollment.id];
    if (!memberId) {
      setErro('Selecione o ente e a representação antes de aprovar.');
      return;
    }
    setWorkingId(enrollment.id);
    setErro('');
    try {
      await api.post(`/admin/certificate-enrollments/${enrollment.id}/approve`, {
        memberId,
        accessLevel: 'PARTICIPANT',
        function: 'Representante',
      });
      await load();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível aprovar a identidade.');
    } finally {
      setWorkingId('');
    }
  }

  async function reject(enrollment: PendingEnrollment) {
    if (!window.confirm(`Rejeitar a identidade de ${enrollment.name}?`)) return;
    setWorkingId(enrollment.id);
    setErro('');
    try {
      await api.post(`/admin/certificate-enrollments/${enrollment.id}/reject`);
      await load();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível rejeitar a identidade.');
    } finally {
      setWorkingId('');
    }
  }

  async function revoke(credential: CertificateCredential) {
    if (!window.confirm(`Revogar o certificado vinculado a ${credential.name}? A sessão por token será encerrada.`)) return;
    setWorkingId(credential.id);
    setErro('');
    try {
      await api.post(`/admin/certificate-credentials/${credential.id}/revoke`);
      await load();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível revogar o certificado.');
    } finally {
      setWorkingId('');
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Administração</p>
          <h1 className="text-2xl font-semibold text-slate-900">Identidades e certificados</h1>
          <p className="mt-1 text-sm text-slate-600">Aprove o primeiro acesso e vincule cada token à representação correta.</p>
        </div>
        <Link className="text-sm text-slate-700 underline" to="/">Voltar</Link>
      </header>

      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {loading && <p className="text-sm text-slate-500">Carregando identidades…</p>}

      {!loading && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Aguardando aprovação</h2>
            <p className="text-sm text-slate-500">O nome e o documento mascarado foram extraídos do certificado ICP-Brasil.</p>
          </div>
          {pending.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500">Nenhuma identidade pendente.</p>}
          {pending.map((enrollment) => (
            <article key={enrollment.id} className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50/50 p-5 md:grid-cols-[1fr_1.3fr]">
              <div>
                <p className="font-semibold text-slate-900">{enrollment.name}</p>
                {enrollment.legalEntityName && <p className="text-sm text-slate-700">{enrollment.legalEntityName}</p>}
                <dl className="mt-3 space-y-1 text-sm text-slate-600">
                  <div><dt className="inline font-medium">Documento:</dt> <dd className="inline">{enrollment.documentMasked ?? 'não informado'}</dd></div>
                  <div><dt className="inline font-medium">Emissor:</dt> <dd className="inline">{enrollment.issuerName}</dd></div>
                  <div><dt className="inline font-medium">Certificado:</dt> <dd className="inline">final {enrollment.fingerprintLast8}</dd></div>
                  <div><dt className="inline font-medium">Validade:</dt> <dd className="inline">{new Date(enrollment.validTo).toLocaleDateString('pt-BR')}</dd></div>
                </dl>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700" htmlFor={`member-${enrollment.id}`}>Ente e representação</label>
                <select
                  id={`member-${enrollment.id}`}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
                  value={memberByEnrollment[enrollment.id] ?? ''}
                  onChange={(event) => setMemberByEnrollment((current) => ({ ...current, [enrollment.id]: event.target.value }))}
                >
                  <option value="">Selecione a representação</option>
                  {members.map(({ council, member }: { council: Council; member: Member }) => (
                    <option key={member.id} value={member.id}>{council.name} · {member.ente} · {member.representante}</option>
                  ))}
                </select>
                <div className="flex gap-3">
                  <button
                    disabled={workingId === enrollment.id}
                    onClick={() => void approve(enrollment)}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Aprovar e vincular
                  </button>
                  <button
                    disabled={workingId === enrollment.id}
                    onClick={() => void reject(enrollment)}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {!loading && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Certificados vinculados</h2>
            <p className="text-sm text-slate-500">Somente impressões digitais protegidas e dados mínimos de auditoria ficam armazenados.</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Participante</th>
                  <th className="px-4 py-3 font-medium">Instituição</th>
                  <th className="px-4 py-3 font-medium">Certificado</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {credentials.map((credential) => (
                  <tr key={credential.id}>
                    <td className="px-4 py-3"><span className="font-medium text-slate-900">{credential.name}</span><br /><span className="text-slate-500">{credential.function}</span></td>
                    <td className="px-4 py-3 text-slate-700">{credential.institution}</td>
                    <td className="px-4 py-3 text-slate-600">Final {credential.fingerprintLast8}<br />{credential.validTo ? `até ${new Date(credential.validTo).toLocaleDateString('pt-BR')}` : 'cadastro legado'}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${credential.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{credential.status === 'ACTIVE' ? 'Ativo' : 'Revogado'}</span></td>
                    <td className="px-4 py-3 text-right">
                      {credential.status === 'ACTIVE' && (
                        <button disabled={workingId === credential.id} onClick={() => void revoke(credential)} className="text-red-700 underline disabled:opacity-50">Revogar</button>
                      )}
                    </td>
                  </tr>
                ))}
                {credentials.length === 0 && <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={5}>Nenhum certificado vinculado.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

