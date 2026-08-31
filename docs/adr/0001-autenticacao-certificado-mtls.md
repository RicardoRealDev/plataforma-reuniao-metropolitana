# ADR-0001: Autenticação direta por certificado físico com mTLS

**Status:** Aceita, aguardando configuração do VPS  
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

O Supabase armazena somente um HMAC da impressão digital e os oito últimos
caracteres para identificação administrativa. A autenticação gera um código de
troca de uso único, válido por um minuto, e depois uma sessão de 12 horas.

## Controles de segurança

- O gateway não é exposto diretamente; apenas o Nginx pode acessá-lo.
- Cabeçalhos de certificado recebidos da internet são sobrescritos pelo Nginx.
- Requisições gateway–Supabase têm assinatura HMAC, timestamp e identificador
  único contra repetição.
- O PIN e a chave privada nunca saem do token.
- A cadeia ICP-Brasil e as listas de certificados revogados devem ser mantidas
  atualizadas no VPS.
- Um certificado renovado possui nova impressão digital e precisa ser associado
  novamente ao usuário.

## Consequências

- Não há redirecionamento ou dependência do Login Único GOV.BR.
- É necessário operar um VPS com HTTPS, Nginx e atualização das cadeias/LCRs.
- A remoção física do token não encerra imediatamente a sessão web. Esse recurso
  exigiria um aplicativo local e fica fora do MVP.

