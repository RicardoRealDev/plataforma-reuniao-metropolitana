import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';

export function Login() {
  const { emailLogin, passwordLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarAdmin, setMostrarAdmin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const returnPath = (location.state as { from?: string } | null)?.from ?? '/';

  async function entrarPorEmail(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const user = await emailLogin(email, password);
      navigate(user.mustChangePassword ? '/trocar-senha' : returnPath, { replace: true });
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  async function entrarComoAdmin(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const user = await passwordLogin(adminUsername, adminPassword);
      navigate(user.mustChangePassword ? '/trocar-senha' : returnPath, { replace: true });
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow-sm">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Quórum Digital</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Entrar na plataforma</h1>
          <p className="mt-2 text-sm text-slate-600">Use o e-mail cadastrado para acessar sua representação e participar da reunião.</p>
        </div>

        {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

        <form className="space-y-3" onSubmit={entrarPorEmail}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">E-mail</label>
          <input
            id="email"
            aria-label="E-mail"
            autoComplete="email"
            type="email"
            required
            className="w-full rounded border border-slate-300 p-2"
            placeholder="nome@instituicao.gov.br"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">Senha</label>
          <input
            id="password"
            aria-label="Senha"
            autoComplete="current-password"
            type="password"
            required
            minLength={8}
            className="w-full rounded border border-slate-300 p-2"
            placeholder="Sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button disabled={enviando} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-50">
            {enviando ? 'Entrando…' : 'Entrar com e-mail'}
          </button>
        </form>

        <button className="w-full text-sm text-slate-600 underline" onClick={() => setMostrarAdmin((value) => !value)}>
          {mostrarAdmin ? 'Ocultar acesso de contingência' : 'Acesso administrativo de contingência'}
        </button>

        {mostrarAdmin && (
          <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={entrarComoAdmin}>
            <p className="text-xs text-slate-500">Use este acesso apenas para cadastrar os primeiros e-mails administrativos.</p>
            <input
              aria-label="Usuário administrativo"
              autoComplete="username"
              className="w-full rounded border border-slate-300 p-2"
              placeholder="Usuário administrativo"
              value={adminUsername}
              onChange={(event) => setAdminUsername(event.target.value)}
            />
            <input
              aria-label="Senha administrativa"
              autoComplete="current-password"
              type="password"
              className="w-full rounded border border-slate-300 p-2"
              placeholder="Senha administrativa"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
            />
            <button disabled={enviando} className="w-full rounded bg-slate-700 px-4 py-2 text-white disabled:opacity-50">
              Entrar pela contingência
            </button>
          </form>
        )}

        <p className="text-xs text-slate-500">O acesso é individual e fica vinculado ao participante e à representação cadastrada.</p>
      </section>
    </main>
  );
}
