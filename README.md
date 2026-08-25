# Quórum Digital

Sistema web independente para conduzir reuniões e votações dos Conselhos
Metropolitanos (Palmas, Araguaína, Gurupi) — vídeo próprio (LiveKit
self-hosted), presença dual-source (manual + câmera), votação por pauta com
quórum ponderado por ente, dashboard ao vivo e geração de ata.

Inspirado no domínio funcional do projeto original
[`Planilha-Metropolitana`](https://github.com/RicardoRealDev/Planilha-Metropolitana)
(Google Apps Script), mas como aplicação independente — sem depender de Google
Sheets/Apps Script para funcionar. O Google Sheets é usado apenas como saída
sincronizada (relatório em formato já conhecido pelos conselhos), opcional.

Esta é a **Fase 1** de um roteiro em 3 fases (ver estudo de viabilidade
publicado durante o planejamento). **Reconhecimento facial não faz parte desta
fase** — presença ao vivo é feita por evento de câmera ligada/desligada via
webhook do LiveKit, sem nenhuma leitura biométrica.

## Requisitos

- Node.js 20+ e npm
- Docker e Docker Compose
- (Opcional) `gcloud` CLI, se for habilitar a sincronização com Google Sheets

## Subir a infraestrutura (LiveKit + Postgres)

```bash
docker compose up -d
```

Isso sobe `livekit-server` (portas 7880/7881/7882) e Postgres (porta 5432)
usando as configurações de desenvolvimento em `livekit.yaml` e
`docker-compose.yml`. **Troque as chaves antes de qualquer uso fora do seu
próprio computador.**

## Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:migrate
npm run seed
npm run dev
```

API sobe em `http://localhost:4000`.

### Sincronização com Google Sheets (opcional)

Sem configurar nada, o sistema funciona normalmente — a sincronização com
planilhas fica desligada por padrão. Para habilitar:

```bash
./scripts/setup-google-cloud.sh <SEU_PROJECT_ID>
```

Isso habilita as APIs necessárias no Google Cloud e gera uma chave de conta de
serviço em `backend/secrets/service-account.json`. Depois, no `backend/.env`:

```
SHEETS_SYNC_ENABLED=true
SHEETS_SHARE_WITH_EMAILS=operador1@exemplo.gov.br,operador2@exemplo.gov.br
```

A cada reunião criada, uma nova planilha é gerada automaticamente e
compartilhada com os e-mails configurados, e passa a receber presença e votos
quase em tempo real.

## Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Interface sobe em `http://localhost:5173`.

## Testando o fluxo ponta a ponta

1. Abra `http://localhost:5173`, escolha um conselho e crie uma reunião.
2. Abra a tela **Mesa** dessa reunião — é o painel de controle do operador.
3. Em duas abas/navegadores diferentes, abra a tela **Sala de vídeo**,
   selecione um representante diferente em cada aba e entre com câmera ligada.
4. Volte para a **Mesa**: a presença por câmera deve aparecer automaticamente
   (via webhook do LiveKit), somada a qualquer presença manual lançada.
5. Crie uma pauta, abra a votação (tira uma foto de quem está apto), use
   "todos presentes favoráveis" ou registre exceções pontuais, e feche a pauta.
6. Abra a tela **Dashboard** para ver o resumo, presença por segmento/ente,
   distribuição de votos e o log dos últimos votos.
7. Encerre a reunião na Mesa — isso gera a ata automaticamente.

## Estrutura

```
quorum-digital/
  docker-compose.yml     # livekit-server + postgres
  livekit.yaml            # config do LiveKit (dev — troque as chaves em produção)
  backend/                # Fastify + Prisma + integração LiveKit/Sheets
  frontend/               # React + Vite + Tailwind + componentes LiveKit
  scripts/
    setup-google-cloud.sh # setup único da conta de serviço do Google Sheets
```

## Fora de escopo nesta fase

- Reconhecimento/leitura facial (fases futuras, condicionadas a parecer
  jurídico/DPO — ver estudo de viabilidade).
- Autenticação robusta de operadores (SSO/2FA).
- Deploy em produção (TURN/TLS reais, domínio) — esta fase roda localmente via
  Docker Compose para validar o fluxo ponta a ponta.
