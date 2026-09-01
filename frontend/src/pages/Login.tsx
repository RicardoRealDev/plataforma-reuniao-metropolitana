import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

const MTLS_AUTH_URL = import.meta.env.VITE_MTLS_AUTH_URL;

const errorMessages: Record<string, string> = {
  certificado_nao_validado: 'O certificado apresentado não foi validado.',
  certificado_ausente: 'Nenhum certificado foi encontrado. Conecte o token e tente novamente.',
  certificado_expirado: 'O certificado do token está expirado.',
  identidade_nao_encontrada: 'O certificado é válido, mas não contém uma identidade reconhecível.',
  'certificado revogado pelo administrador': 'Este certificado foi revogado pelo administrador.',
  'identidade rejeitada pelo administrador': 'Esta identidade não foi autorizada para acessar o sistema.',
  'requisição já utilizada': 'Esta tentativa de acesso já foi utilizada. Tente novamente.',
  falha_no_certificado: 'Não foi possível validar o token físico.',
};

interface EnrollmentStatus {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  identity: {
    name: string;
    type: 'PF' | 'PJ' | 'UNKNOWN';
    documentMasked: string | null;
    legalEntityName: string | null;
  };
  certificateValidTo: string;
}
export function Login() {
  const { exchange, passwordLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const enrollmentCode = params.get('enrollment');
  const [enrollment, setEnrollment] = useState<EnrollmentStatus | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mostrarAdmin, setMostrarAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const gatewayError = params.get('erro');
    const code = params.get('code');
    if (gatewayError) setErro(errorMessages[gatewayError] ?? gatewayError);
    if (!code) return;

    setEnviando(true);
    exchange(code)
      .then(() => navigate(params.get('returnPath') || '/', { replace: true }))
      .catch((error) => setErro(error instanceof Error ? error.message : 'Não foi possível entrar.'))
      .finally(() => setEnviando(false));
  }, [exchange, navigate, params]);

  useEffect(() => {
    if (!enrollmentCode) {
      setEnrollment(null);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.get<EnrollmentStatus>(`/auth/enrollments/${encodeURIComponent(enrollmentCode)}`);
        if (active) setEnrollment(result);
      } catch (error) {
        if (active) setErro(error instanceof Error ? error.message : 'Não foi possível consultar a identificação.');
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [enrollmentCode]);

  function entrar() {
    if (!MTLS_AUTH_URL) {
      setErro('O endereço de autenticação do token ainda não foi configurado.');
      return;
    }
    const requested = params.get('returnPath')
      ?? (location.state as { from?: string } | null)?.from
      ?? '/';
    window.location.assign(`${MTLS_AUTH_URL}?returnPath=${encodeURIComponent(requested)}`);
  }

  async function entrarComoAdmin(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const user = await passwordLogin(username, password);
      navigate(user.mustChangePassword ? '/trocar-senha' : '/', { replace: true });
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
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Acesso com token institucional</h1>
          <p className="mt-2 text-sm text-slate-600">Conecte seu token ICP-Brasil ao computador para validar sua identidade.</p>
        </div>

        {enrollment && (
          <div className={`rounded-lg border p-4 ${
            enrollment.status === 'APPROVED'
              ? 'border-emerald-200 bg-emerald-50'
              : enrollment.status === 'REJECTED'
                ? 'border-red-200 bg-red-50'
                : 'border-amber-200 bg-amber-50'
          }`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identidade encontrada no certificado</p>
            <p className="mt-1 font-semibold text-slate-900">{enrollment.identity.name}</p>
            {enrollment.identity.legalEntityName && <p className="text-sm text-slate-700">{enrollment.identity.legalEntityName}</p>}
            {enrollment.identity.documentMasked && <p className="text-sm text-slate-600">Documento: {enrollment.identity.documentMasked}</p>}
            <p className="mt-2 text-sm">
              {enrollment.status === 'PENDING' && 'Aguardando o administrador vincular sua representação.'}
              {enrollment.status === 'APPROVED' && 'Identidade autorizada. Valide o token novamente para entrar.'}
              {enrollment.status === 'REJECTED' && 'O administrador não autorizou esta identidade.'}
            </p>
          </div>
        )}

        {!enrollment && (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>Conecte o token USB e confirme que o driver está instalado.</li>
            <li>Clique em “Identificar e entrar”.</li>
            <li>Selecione o certificado e informe o PIN na janela segura.</li>
          </ol>
        )}

        {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        <button
          disabled={enviando || enrollment?.status === 'REJECTED'}
          onClick={entrar}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-50"
        >
          {enviando
            ? 'Concluindo autenticação…'
            : enrollment?.status === 'APPROVED'
              ? 'Validar token e entrar'
              : 'Identificar e entrar'}
        </button>

        <button className="w-full text-sm text-slate-600 underline" onClick={() => setMostrarAdmin((value) => !value)}>
          {mostrarAdmin ? 'Ocultar acesso administrativo' : 'Acesso administrativo de contingência'}
        </button>
        {mostrarAdmin && (
          <form className="space-y-3 border-t border-slate-200 pt-4" onSubmit={entrarComoAdmin}>
            <input
              aria-label="Usuário administrativo"
              autoComplete="username"
              className="w-full rounded border border-slate-300 p-2"
              placeholder="Usuário"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <input
              aria-label="Senha administrativa"
              autoComplete="current-password"
              type="password"
              className="w-full rounded border border-slate-300 p-2"
              placeholder="Senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button disabled={enviando} className="w-full rounded bg-slate-700 px-4 py-2 text-white disabled:opacity-50">
              Entrar como administrador
            </button>
          </form>
        )}
        <p className="text-xs text-slate-500">O PIN e a chave privada permanecem no dispositivo e nunca são enviados ao Quórum Digital.</p>
      </section>
    </main>
  );
}
