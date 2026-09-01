import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import type { Council, Member } from '../lib/types.js';

interface EmailUser {
  id: string;
  name: string;
  institution: string;
  function: string;
  accessLevel: 'ADMIN' | 'OPERATOR' | 'PARTICIPANT';
  memberId: string | null;
  email: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

const accessLabels = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  PARTICIPANT: 'Participante',
} as const;

export function Acessos() {
  const [users, setUsers] = useState<EmailUser[]>([]);
  const [councils, setCouncils] = useState<Council[]>([]);
  const [userId, setUserId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [functionName, setFunctionName] = useState('Representante');
  const [accessLevel, setAccessLevel] = useState<EmailUser['accessLevel']>('PARTICIPANT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const members = useMemo(
    () => councils.flatMap((council) => council.members.map((member) => ({ council, member }))),
    [councils],
  );

  async function load() {
    setLoading(true);
    try {
      const [userData, councilData] = await Promise.all([
        api.get<EmailUser[]>('/admin/email-users'),
        api.get<Council[]>('/councils'),
      ]);
      setUsers(userData);
      setCouncils(councilData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os acessos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function selectUser(selectedId: string) {
    setUserId(selectedId);
    setError('');
    setSuccess('');
    const selected = users.find((user) => user.id === selectedId);
    if (!selected) return;
    setMemberId(selected.memberId ?? '');
    setEmail(selected.email ?? '');
    setName(selected.name);
    setInstitution(selected.institution);
    setFunctionName(selected.function);
    setAccessLevel(selected.accessLevel);
    setTemporaryPassword('');
  }

  function selectMember(selectedId: string) {
    setMemberId(selectedId);
    const selected = members.find(({ member }) => member.id === selectedId);
    if (!selected) return;
    setName(selected.member.representante);
    setInstitution(selected.member.ente);
    setFunctionName('Representante');
    setAccessLevel('PARTICIPANT');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api.post('/admin/email-users', {
        userId: userId || null,
        memberId: memberId || null,
        email,
        temporaryPassword,
        name,
        institution,
        function: functionName,
        accessLevel,
      });
      setSuccess('Acesso salvo. Entregue a senha temporária ao usuário por um canal seguro.');
      setTemporaryPassword('');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o acesso.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user: EmailUser) {
    setError('');
    setSuccess('');
    try {
      await api.post(`/admin/email-users/${user.id}/status`, { active: !user.active });
      await load();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Não foi possível alterar o acesso.');
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Administração</p>
        <h1 className="text-2xl font-semibold text-slate-900">Acessos por e-mail</h1>
        <p className="mt-1 text-sm text-slate-600">Vincule cada e-mail ao participante e defina uma senha temporária para o primeiro acesso.</p>
      </header>

      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {success && <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Cadastrar ou redefinir acesso</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={save}>
          <label className="text-sm font-medium text-slate-700">
            Conta existente
            <select className="mt-1 w-full rounded border border-slate-300 p-2" value={userId} onChange={(event) => selectUser(event.target.value)}>
              <option value="">Criar ou vincular pela representação</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email ?? 'sem e-mail'}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Representação
            <select className="mt-1 w-full rounded border border-slate-300 p-2" value={memberId} onChange={(event) => selectMember(event.target.value)}>
              <option value="">Sem representação vinculada</option>
              {members.map(({ council, member }: { council: Council; member: Member }) => (
                <option key={member.id} value={member.id}>{council.name} — {member.ente} — {member.representante}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Nome
            <input required minLength={2} className="mt-1 w-full rounded border border-slate-300 p-2" value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Instituição
            <input required minLength={2} className="mt-1 w-full rounded border border-slate-300 p-2" value={institution} onChange={(event) => setInstitution(event.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Função
            <input required minLength={2} className="mt-1 w-full rounded border border-slate-300 p-2" value={functionName} onChange={(event) => setFunctionName(event.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Nível de acesso
            <select className="mt-1 w-full rounded border border-slate-300 p-2" value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as EmailUser['accessLevel'])}>
              <option value="PARTICIPANT">Participante</option>
              <option value="OPERATOR">Operador</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            E-mail
            <input required type="email" autoComplete="off" className="mt-1 w-full rounded border border-slate-300 p-2" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Senha temporária
            <input required type="password" autoComplete="new-password" minLength={12} className="mt-1 w-full rounded border border-slate-300 p-2" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} />
            <span className="mt-1 block text-xs font-normal text-slate-500">Mínimo de 12 caracteres, com maiúscula, minúscula, número e símbolo.</span>
          </label>

          <div className="md:col-span-2">
            <button disabled={saving} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
              {saving ? 'Salvando…' : 'Salvar acesso por e-mail'}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">Usuários cadastrados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">E-mail</th><th className="px-4 py-3">Acesso</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3"><p className="font-medium">{user.name}</p><p className="text-xs text-slate-500">{user.institution} · {user.function}</p></td>
                  <td className="px-4 py-3">{user.email ?? <span className="text-amber-700">Não configurado</span>}</td>
                  <td className="px-4 py-3">{accessLabels[user.accessLevel]}</td>
                  <td className="px-4 py-3">{user.active ? (user.mustChangePassword ? 'Troca de senha pendente' : 'Ativo') : 'Desativado'}</td>
                  <td className="space-x-3 px-4 py-3">
                    <button className="text-slate-700 underline" onClick={() => selectUser(user.id)}>Configurar</button>
                    <button className="text-red-700 underline" onClick={() => void toggleStatus(user)}>{user.active ? 'Desativar' : 'Ativar'}</button>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={5}>Nenhum usuário cadastrado.</td></tr>}
              {loading && <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={5}>Carregando…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
