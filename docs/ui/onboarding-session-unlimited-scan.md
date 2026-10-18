# Onboarding Session Unlimited Scan

## Contexto

O assistente de migração de dados da seção "Guia inicial" (Onboarding) das configurações varre as sessões nativas do Claude Code na máquina local. Antes, a etapa de sessões oferecia apenas três opções de quantidade de retorno: `30`, `50` e `100`; o serviço de varredura já suportava, quando `limit` não é informado, devolver todos os candidatos.

## Comportamento

- O menu suspenso de quantidade de retorno da etapa de sessões do Onboarding exibe:
  - `30`
  - `50`
  - `100`
  - `Sem limite`
- Ao selecionar `Sem limite`, a UI não passa `limit` para `scanImportableClaudeSessions`.
- A camada de serviço continua varredendo, filtrando e ordenando por `updatedAt` em ordem decrescente conforme a lógica existente; os resultados só são truncados quando um `limit` positivo é informado.

## Limites

- A alteração afeta apenas as opções de varredura de sessões do assistente de migração de dados do Onboarding.
- O campo numérico da página de migração das configurações independentes mantém a interação atual, com máximo de 500.
- Não altera a lógica de importação, o filtro de workspace, o filtro de intervalo de tempo ou os limites de suporte entre desktop e web.