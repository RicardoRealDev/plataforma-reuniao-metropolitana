import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { google } from 'googleapis';

const clientPath = process.argv[2];
const outputPath = resolve(process.argv[3] ?? './secrets/google-oauth-token.json');
const port = Number(process.env.OAUTH_CALLBACK_PORT ?? 53682);

if (!clientPath) {
  throw new Error('Uso: node scripts/google-oauth-setup.mjs <client-secret.json> [arquivo-saida]');
}

const clientFile = JSON.parse(await readFile(resolve(clientPath), 'utf8'));
const credentials = clientFile.installed ?? clientFile.web;
if (!credentials?.client_id || !credentials?.client_secret) {
  throw new Error('Arquivo OAuth inválido: client_id/client_secret ausentes.');
}

const redirectUri = `http://localhost:${port}`;
const oauth = new google.auth.OAuth2(credentials.client_id, credentials.client_secret, redirectUri);
const authorizeUrl = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

console.log(`AUTHORIZE_URL=${authorizeUrl}`);
console.log(`Aguardando retorno em ${redirectUri} ...`);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', redirectUri);
    const error = url.searchParams.get('error');
    if (error) throw new Error(`Google recusou a autorização: ${error}`);
    const code = url.searchParams.get('code');
    if (!code) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Código OAuth ausente.');
      return;
    }

    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('O Google não retornou refresh_token. Revogue o acesso anterior e tente novamente.');
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
          refresh_token: tokens.refresh_token,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<h1>Autorização concluída</h1><p>Você pode fechar esta janela.</p>');
    console.log(`TOKEN_SAVED=${outputPath}`);
    server.close();
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Falha na autorização. Consulte o terminal.');
    console.error(error instanceof Error ? error.message : error);
    server.close(() => process.exitCode = 1);
  }
});

server.listen(port, '127.0.0.1');
