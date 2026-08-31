# ADR-0001: Autenticação institucional por certificado físico via GOV.BR

**Status:** Aceita, aguardando credenciais de homologação  
**Data:** 2026-08-31

## Contexto

Os usuários devem acessar o sistema com um token físico individual contendo
certificado ICP-Brasil A3. Um navegador não oferece ao JavaScript acesso direto
ao dispositivo, à chave privada ou aos eventos de inserção e remoção do token.

## Decisão

Usar o Login Único GOV.BR como provedor OpenID Connect e aceitar o acesso apenas
quando o retorno indicar autenticação X.509 em dispositivo físico (`type =
device`). O CPF retornado é transformado por HMAC antes de ser comparado com o
cadastro institucional. O CPF completo não é persistido.

O GOV.BR autentica a pessoa; o Quórum Digital mantém o vínculo entre essa
identidade, instituição, função, conselho e permissões. Após o callback, um
código de troca de uso único e validade de um minuto gera uma sessão local de
12 horas.

## Opções consideradas

### GOV.BR/OIDC

- Menor responsabilidade sobre validação da cadeia ICP-Brasil.
- Compatível com certificado físico e PIN fornecido fora da aplicação.
- Exige credenciais de homologação e domínio oficial para produção.

### mTLS próprio

- Controle integral do fluxo.
- Exigiria gateway TLS dedicado, cadeia ICP-Brasil, revogação, logs e operação
  de infraestrutura adicional.

### Aplicativo local com PKCS#11

- Permitiria detectar inserção e remoção do token.
- Exigiria instalação e manutenção por sistema operacional e fabricante.
- Fica reservado para uma fase posterior; não é necessário no MVP.

## Consequências

- O PIN e a chave privada nunca passam pela aplicação.
- A entrada exige conectar o token, clicar no botão e concluir o fluxo GOV.BR.
- A retirada física do token não encerra imediatamente uma sessão já criada.
- Toda ação protegida pode ser atribuída ao usuário institucional autenticado.

