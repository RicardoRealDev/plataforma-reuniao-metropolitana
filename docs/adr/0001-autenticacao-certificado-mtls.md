# ADR-0001: Autenticação direta por certificado físico com mTLS

**Status:** Implementada no sistema; gateway aguardando hospedagem mTLS
**Data:** 2026-08-31

## Contexto

Os usuários acessam o sistema com um token físico individual contendo
certificado ICP-Brasil. O login não deve depender de conta ou página do GOV.BR.
JavaScript no navegador não pode ler diretamente o token, o PIN ou a chave
privada.

## Decisão

Usar autenticação mTLS em um subdomínio dedicado. O Nginx no VPS solicita o
certificado ao navegador e valida sua cadeia. Um gateway isolado calcula a
impressão digital SHA-256 do certificado e envia ao Supabase uma requisição
assinada por HMAC.

O gateway também interpreta os campos obrigatórios de identidade da ICP-Brasil
no `Subject Alternative Name` e usa o `CN` como compatibilidade. CPF e impressão
digital completos trafegam somente entre o gateway e a API, por TLS e em uma
mensagem assinada. O banco armazena apenas HMAC desses valores, além do nome,
documento mascarado e dados mínimos de auditoria.

No primeiro acesso, um certificado ainda não conhecido cria uma solicitação
pendente. Um administrador confere a identidade e a vincula a um `Member` do
conselho. Depois da aprovação, o certificado entra automaticamente. Na renovação
do certificado, uma nova impressão digital pode ser vinculada automaticamente
quando o HMAC do CPF identifica exatamente um usuário ativo.

A autenticação gera um código de troca de uso único, válido por um minuto, e
depois uma sessão de 12 horas.

## Controles de segurança

- O gateway não é exposto diretamente; apenas o Nginx pode acessá-lo.
- Cabeçalhos de certificado recebidos da internet são sobrescritos pelo Nginx.
- Requisições gateway–Supabase têm assinatura HMAC, timestamp e identificador
  único contra repetição.
- Certificados desconhecidos não recebem acesso à reunião antes da aprovação.
- Certificados podem ser revogados pelo administrador; as sessões mTLS do
  usuário são encerradas no mesmo momento.
- O PIN e a chave privada nunca saem do token.
- A cadeia ICP-Brasil e as listas de certificados revogados devem ser mantidas
  atualizadas no VPS.
- CPF completo não é devolvido ao navegador nem persistido no banco.

## Consequências

- Não há redirecionamento ou dependência do Login Único GOV.BR.
- É necessário operar um VPS com HTTPS, Nginx e atualização das cadeias/LCRs.
- A remoção física do token não encerra imediatamente a sessão web. Esse recurso
  exigiria um aplicativo local e fica fora do MVP.
- Navegadores não notificam uma aplicação web quando o token é apenas conectado.
  O participante ainda precisa acionar o botão de entrada e confirmar o PIN na
  janela segura do sistema operacional.
