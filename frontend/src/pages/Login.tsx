import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.js';
import { API_URL } from '../lib/api.js';

const errorMessages: Record<string, string> = {
  retorno_invalido: 'O GOV.BR retornou dados incompletos.',
  sessao_expirada: 'A tentativa de acesso expirou. Tente novamente.',
  falha_no_provedor: 'Não foi possível concluir a autenticação no GOV.BR.',
  identidade_invalida: 'Não foi possível validar a identidade retornada.',
  use_certificado_fisico: 'Use a opção de certificado digital com o token físico conectado.',
  usuario_nao_cadastrado: 'Certificado válido, mas esta pessoa ainda não está cadastrada no sistema.',
};

export function Login() {
  const { exchange } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const providerError = params.get('erro');
    const code = params.get('code');
    if (providerError) setErro(errorMessages[providerError] ?? 'Não foi possível entrar.');
    if (!code) return;

    setEnviando(true);
    exchange(code)
      .then(() => navigate(params.get('returnPath') || '/', { replace: true }))
      .catch((error) => setErro(error instanceof Error ? error.message : 'Não foi possível entrar.'))
      .finally(() => setEnviando(false));
  }, [exchange, location.search, navigate]);

  function entrar() {
    const requested = (location.state as { from?: string } | null)?.from ?? '/';
    window.location.assign(`${API_URL}/auth/govbr/start?returnPath=${encodeURIComponent(requested)}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow-sm">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Quórum Digital</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Acesso com certificado</h1>
          <p className="mt-2 text-sm text-slate-600">Conecte seu token ICP-Brasil ao computador e prossiga pelo GOV.BR.</p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>Conecte o token USB e confirme que o driver está instalado.</li>
          <li>Clique no botão abaixo e escolha “Certificado digital”.</li>
          <li>Selecione o certificado e informe o PIN na janela segura.</li>
        </ol>
        {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        <button disabled={enviando} onClick={entrar} className="w-full rounded-lg bg-blue-700 px-4 py-2.5 font-medium text-white disabled:opacity-50">
          {enviando ? 'Concluindo autenticação…' : 'Entrar com GOV.BR e certificado digital'}
        </button>
        <p className="text-xs text-slate-500">O Quórum Digital nunca recebe o PIN nem a chave privada do token.</p>
      </section>
    </main>
  );
}
