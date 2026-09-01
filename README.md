# Quórum Digital

Sistema web para conduzir reuniões e votações dos Conselhos Metropolitanos de
Palmas, Araguaína e Gurupi. O MVP não usa biometria: a presença é registrada
manualmente e também acompanha eventos de câmera do LiveKit.

O domínio foi portado do projeto
[`Planilha-Metropolitana`](https://github.com/RicardoRealDev/Planilha-Metropolitana),
incluindo votação por pauta, snapshot de membros aptos, quórum ponderado por
ente, dashboard ao vivo, geração automática de ata e exportação para Google
Sheets.

## Produção

- Frontend: React/Vite publicado na Vercel
- API e webhook: Supabase Edge Functions
- Banco de dados: PostgreSQL do Supabase
- Videochamada: LiveKit Cloud
- Relatórios: Google Sheets/Drive usando OAuth da conta proprietária
- Login institucional: e-mail e senha, com vínculo administrativo à representação

Aplicação: <https://frontend-henna-eight-30.vercel.app>

A API e a interface de gestão de acessos ficam publicadas no Supabase e na
Vercel. Cada conta recebe uma senha temporária e precisa substituí-la no primeiro
acesso. O diretório `auth-gateway/` permanece apenas como referência da abordagem
de certificado físico descontinuada.

O Railway não faz parte da arquitetura atual. O Docker Compose permanece no
repositório apenas para desenvolvimento local opcional.

## Fluxo da reunião

1. O operador escolhe o conselho e cria a reunião.
2. Na **Mesa**, inicia a reunião e registra presença manual quando necessário.
3. Cada representante entra pela **Sala de vídeo**. O LiveKit envia ao webhook
   os eventos de entrada, saída e câmera ligada/desligada.
4. O operador cria uma pauta e abre a votação. Nesse momento, o sistema grava
   um snapshot dos representantes aptos.
5. Os votos são computados com o peso do ente e o dashboard atualiza ao vivo.
6. Ao encerrar a reunião, o sistema gera a ata e sincroniza presença, votos e
   resumo em uma planilha criada no Google Drive da conta autorizada.

## Desenvolvimento local

### Pré-requisitos

- Node.js 20 ou superior
- npm
- Docker e Docker Compose, somente se quiser usar Postgres e LiveKit locais
- Supabase CLI para testar e publicar Edge Functions

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Variáveis principais:

```env
VITE_API_URL=https://SEU_PROJETO.supabase.co/functions/v1/api
VITE_LIVEKIT_URL=wss://SEU_PROJETO.livekit.cloud
```

### Infraestrutura local opcional

```bash
docker compose up -d
```

Esse comando inicia Postgres e LiveKit locais. As chaves de desenvolvimento de
`livekit.yaml` nunca devem ser reutilizadas em produção.

### Supabase

As funções estão em `supabase/functions` e o esquema inicial em
`supabase/migrations`. Segredos devem ser configurados no Supabase e nunca
salvos no Git:

- `DB_POOL_URL`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `AUTH_TOKEN_PEPPER`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `SHEETS_SYNC_ENABLED`
- `SHEETS_SHARE_WITH_EMAILS`

O webhook do LiveKit deve apontar para:

```text
https://SEU_PROJETO.supabase.co/functions/v1/livekit-webhook
```

## Verificação

```bash
cd frontend
npm run build
```

O teste de produção em `scripts/e2e-production.mjs` cobre criação e início da
reunião, presença, pauta, votação, quórum, dashboard, encerramento, ata e URL da
planilha. Ele cria dados reais e só deve ser executado em um ambiente destinado
a testes.

## Segurança

- Arquivos `.env`, tokens OAuth e chaves privadas são ignorados pelo Git.
- O segredo da API do LiveKit fica somente no servidor; o navegador recebe um
  token temporário de participante.
- O webhook valida a assinatura enviada pelo LiveKit.
- O login institucional usa e-mail e senha; o administrador vincula a conta ao
  participante e à representação em `/admin/acessos`.
- Senhas são armazenadas com PBKDF2-SHA-256, salt individual e 310 mil
  iterações. A senha temporária precisa ser trocada no primeiro acesso.
- Depois de cinco falhas consecutivas, novas tentativas para aquela conta ficam
  bloqueadas por quinze minutos.
- Administradores podem ter um acesso de contingência por usuário e senha, com
  bloqueio após cinco falhas, sessão de duas horas e troca obrigatória da senha
  temporária no primeiro login.

O fluxo atual está documentado em
`docs/adr/0002-autenticacao-email-senha.md`. A decisão anterior por certificado
foi preservada em `docs/adr/0001-autenticacao-certificado-mtls.md` para
histórico.

## Fora de escopo do MVP

- Reconhecimento ou leitura facial.
- Captura invisível de áudio ou vídeo.
- Biometria de qualquer natureza.
