# ADR-0002: Autenticação institucional por e-mail e senha

**Status:** Aceita

## Contexto

O login por certificado físico exigiria driver compatível em cada computador e
um gateway público com mTLS. Essas dependências impediam o acesso uniforme à
plataforma publicada na Vercel.

## Decisão

Usar e-mail e senha como autenticação principal. O administrador cadastra o
e-mail, define uma senha temporária e vincula a conta a um `Member`. No primeiro
login, o usuário precisa trocar a senha antes de acessar as demais rotas.

O acesso administrativo anterior por nome de usuário permanece somente como
contingência para cadastrar o primeiro e-mail administrativo.

## Controles de segurança

- Senhas com PBKDF2-SHA-256, salt aleatório individual e 310 mil iterações.
- Senhas temporárias com pelo menos 12 caracteres, maiúscula, minúscula,
  número e símbolo.
- Troca obrigatória no primeiro acesso.
- Bloqueio de quinze minutos depois de cinco falhas consecutivas por conta.
- Tokens de sessão aleatórios armazenados no banco somente como HMAC.
- Sessões institucionais com validade de doze horas e revogação no logout,
  troca de senha ou desativação administrativa.
- E-mails únicos, normalizados e visíveis apenas ao administrador.

## Consequências

- O acesso funciona em navegadores comuns sem driver, token ou gateway mTLS.
- A identidade depende do cadastro e do vínculo feitos pelo administrador.
- Recuperação automática de senha por e-mail fica para uma etapa posterior;
  no MVP, o administrador redefine uma senha temporária.
- As tabelas e rotas do certificado permanecem temporariamente para auditoria e
  possibilidade de migração, mas não fazem parte do fluxo principal.
