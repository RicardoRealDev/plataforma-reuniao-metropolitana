import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';

export function TrocarSenha() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmation) return setError('As senhas não coincidem.');
    setSaving(true);
    setError('');
    try {
      await changePassword(password);
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível trocar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form className="w-full max-w-md space-y-4 rounded-xl bg-white p-8 shadow-sm" onSubmit={submit}>
        <h1 className="text-2xl font-semibold">Defina uma nova senha</h1>
        <p className="text-sm text-slate-600">Use pelo menos 12 caracteres, com maiúscula, minúscula, número e caractere especial.</p>
        <input aria-label="Nova senha" autoComplete="new-password" type="password" className="w-full rounded border border-slate-300 p-2" placeholder="Nova senha" value={password} onChange={(event) => setPassword(event.target.value)} />
        <input aria-label="Confirmar nova senha" autoComplete="new-password" type="password" className="w-full rounded border border-slate-300 p-2" placeholder="Confirme a nova senha" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={saving} className="w-full rounded bg-slate-900 px-4 py-2.5 text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Trocar senha'}</button>
      </form>
    </main>
  );
}
