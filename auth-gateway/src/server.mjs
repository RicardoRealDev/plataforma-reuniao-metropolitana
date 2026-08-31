import { createHmac, randomUUID, X509Certificate } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);
const supabaseAuthUrl = process.env.SUPABASE_AUTH_URL;
const frontendLoginUrl = process.env.FRONTEND_LOGIN_URL;
const gatewaySecret = process.env.MTLS_GATEWAY_SECRET;

if (!supabaseAuthUrl || !frontendLoginUrl || !gatewaySecret || gatewaySecret.length < 32) {
  throw new Error('SUPABASE_AUTH_URL, FRONTEND_LOGIN_URL e MTLS_GATEWAY_SECRET são obrigatórios.');
}

function redirect(response, location) {
  response.writeHead(302, { location, 'cache-control': 'no-store' });
  response.end();
}

function loginRedirect(params) {
  const url = new URL(frontendLoginUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function safeReturnPath(value) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function certificateFromHeaders(headers) {
  if (headers['x-ssl-client-verify'] !== 'SUCCESS') throw new Error('certificado_nao_validado');
  const encodedPem = headers['x-ssl-client-cert'];
  if (typeof encodedPem !== 'string' || !encodedPem) throw new Error('certificado_ausente');
  const certificate = new X509Certificate(decodeURIComponent(encodedPem));
  const now = Date.now();
  if (Date.parse(certificate.validFrom) > now || Date.parse(certificate.validTo) <= now) {
    throw new Error('certificado_expirado');
  }
  return certificate;
}

async function authorize(certificate, returnPath) {
  const payload = JSON.stringify({
    requestId: randomUUID(),
    fingerprint: certificate.fingerprint256.replaceAll(':', '').toUpperCase(),
    subject: certificate.subject,
    issuer: certificate.issuer,
    serialNumber: certificate.serialNumber,
    validTo: new Date(certificate.validTo).toISOString(),
    returnPath,
  });
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', gatewaySecret).update(`${timestamp}.${payload}`).digest('hex');
  const response = await fetch(supabaseAuthUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gateway-timestamp': timestamp,
      'x-gateway-signature': signature,
    },
    body: payload,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.erro ?? 'falha_na_autorizacao');
  return body;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://gateway.local');
  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === '/certificate' && request.method === 'GET') {
    try {
      const certificate = certificateFromHeaders(request.headers);
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({
        fingerprint256: certificate.fingerprint256,
        subject: certificate.subject,
        issuer: certificate.issuer,
        serialNumber: certificate.serialNumber,
        validFrom: new Date(certificate.validFrom).toISOString(),
        validTo: new Date(certificate.validTo).toISOString(),
      }, null, 2));
    } catch (error) {
      response.writeHead(401, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ erro: error instanceof Error ? error.message : 'falha_no_certificado' }));
    }
    return;
  }
  if (url.pathname !== '/login' || request.method !== 'GET') {
    response.writeHead(404).end();
    return;
  }

  try {
    const certificate = certificateFromHeaders(request.headers);
    const result = await authorize(certificate, safeReturnPath(url.searchParams.get('returnPath')));
    redirect(response, loginRedirect({ code: result.code, returnPath: result.returnPath }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'falha_no_certificado';
    redirect(response, loginRedirect({ erro: message }));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Gateway mTLS ouvindo na porta ${port}`);
});
