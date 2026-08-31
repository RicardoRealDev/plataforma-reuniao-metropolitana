# Gateway de autenticação por token físico

Serviço mTLS que autentica diretamente certificados ICP-Brasil apresentados por
tokens físicos, sem GOV.BR. Ele deve rodar em um VPS com um subdomínio exclusivo,
por exemplo `token.exemplo.gov.br`.

## Pré-requisitos

- VPS Ubuntu 24.04 com portas 80 e 443 liberadas.
- Registro DNS do subdomínio apontando para o IP do VPS.
- Docker Engine e plugin Docker Compose.
- Certificado HTTPS do subdomínio em `/etc/letsencrypt/live/DOMINIO/`.
- Cadeia de ACs ICP-Brasil confiável em `certs/ca-bundle.pem`.
- LCRs das autoridades aceitas, atualizadas e habilitadas no Nginx antes da
  produção.

## Configuração

Crie `auth-gateway/.env` sem versioná-lo:

```env
AUTH_DOMAIN=token.exemplo.gov.br
PORT=3000
SUPABASE_AUTH_URL=https://SEU_PROJETO.supabase.co/functions/v1/api/auth/mtls/authorize
FRONTEND_LOGIN_URL=https://SEU_FRONTEND/login
MTLS_GATEWAY_SECRET=um-segredo-aleatorio-de-no-minimo-32-caracteres
```

O mesmo `MTLS_GATEWAY_SECRET` deve ser configurado nos segredos da Edge Function
do Supabase. Configure também `AUTH_TOKEN_PEPPER`, com outro valor aleatório.

## Inicialização

Obtenha primeiro o certificado HTTPS, antes de ocupar as portas com o Compose:

```bash
sudo certbot certonly --standalone -d token.exemplo.gov.br
docker compose up -d --build
docker compose logs -f
```

O gateway não publica a porta 3000. Apenas o Nginx, que sobrescreve os cabeçalhos
de certificado, consegue acessá-lo pela rede interna do Compose.

## Cadastrar um certificado

1. Conecte o token no computador.
2. Abra `https://token.exemplo.gov.br/certificate`.
3. Selecione o certificado e informe o PIN na janela do sistema.
4. Copie `fingerprint256` e cadastre o usuário pela rota administrativa.

Exemplo de corpo para `POST /api/admin/users`:

```json
{
  "name": "Nome do representante",
  "institution": "Prefeitura de Exemplo",
  "function": "Representante titular",
  "accessLevel": "PARTICIPANT",
  "memberId": "id-do-membro",
  "certificateFingerprint": "AA:BB:...:FF"
}
```

A API salva somente um HMAC da impressão digital. O valor completo não fica no
banco. Certificados renovados precisam ser cadastrados novamente.

## Produção

Descomente `ssl_crl` em `nginx/default.conf.template` somente depois de instalar
e automatizar a atualização de `certs/crl-bundle.pem`. A validação de revogação
é obrigatória antes de aceitar usuários reais.
