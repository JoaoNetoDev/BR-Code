# 04 — Correções P0 do assistente e extração do controlador de fluxo

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** nada, pode começar imediatamente.

**Comportamentos a entregar:**

Primeiro corrigir alguns problemas do assistente de conexão que travam o usuário:

- **Credenciais salvas ausentes**: o botão principal passa a ser "Adicionar a senha"; ao clicar, o usuário volta ao formulário e o campo de senha recebe o foco.
- **Dispositivo de destino já online**: informa explicitamente ao usuário "já foi usada a conexão existente" e não salva as credenciais recém-digitadas.
- **Enquanto está conectando**: o botão principal passa a ser "Cancelar conexão" e fica clicável.
- **Conexões WSL e Docker**: o texto de fase não exibe mais a nomenclatura de SSH.
- **Cancelamento pelo usuário**: deixa de ser exibido como erro.

Depois, sem alterar o comportamento, extrair o fluxo do assistente para um controlador testável, incluindo a intenção de entrada, os pontos de espera, o recolhimento e o fechamento e o destino do resultado. Assim fica mais fácil refazer as três telas ([10](./10-three-screen-wizard-and-selection.md), [11](./11-connecting-and-directory-screens.md)).

Escopo:

- **Defeitos P0 do assistente**:
  - Ao clicar em "Tentar novamente" sem credenciais, a falha se repete indefinidamente.
  - Quando o dispositivo de destino já está online, a conexão é reutilizada em silêncio, sem nenhuma indicação.
  - Durante a conexão, o botão principal permanece sempre não clicável.
  - Nas conexões WSL e Docker, é exibido o texto de fase de SSH.
  - Depois de o usuário cancelar a instalação, a interface exibe um painel de erro em vermelho.
- **Pré-refatoração**:
  - Extrair o controlador de fluxo mantendo inalterados todos os comportamentos observáveis.
  - Os testes atuais do assistente afirmam por meio da captura das props de subcomponentes; os fluxos cobertos nesta rodada precisam ser reescritos como testes que afirmam o comportamento pelo DOM e pelas portas de serviço.

Critérios de aceite:

- [x] **Credenciais ausentes**: o botão principal exibe "Adicionar a senha"; ao clicar, o usuário volta ao formulário e o campo de senha recebe o foco, sem o loop de novas tentativas que necessariamente falha. É preciso haver cobertura de teste do assistente e de E2E.
- [x] **Dispositivo de destino já online**: ao criar uma conexão manualmente, se o destino for um dispositivo que já está online, a interface exibe "este dispositivo já está conectado por `<descrição da conexão>`, e a conexão existente foi usada diretamente", sem salvar as credenciais recém-digitadas. É preciso haver cobertura de teste.
- [x] **Em conexão**: o botão principal é "Cancelar conexão" e está disponível; após a conexão bem-sucedida, o fluxo avança automaticamente para a próxima etapa.
- [x] **Texto de fase**: SSH, WSL e Docker têm cada um seu próprio texto de fase, em português e em inglês.
- [x] **Cancelamento explícito**: depois que o usuário cancela a instalação ou a conexão, a interface exibe "Cancelado", e não um painel de erro.
- [x] **Pré-refatoração**: depois da extração do controlador de fluxo, os mesmos casos de comportamento de antes e depois passam; os novos testes não capturam mais as props de subcomponentes.
- [x] **Atualização das especificações**: registrar na especificação de UX o "aviso de reutilização quando o dispositivo já está online". Os demais defeitos ficam registrados por testes de regressão.
- [x] **Verificações obrigatórias**: após `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E de SSH afetados passarem, fazer o commit local.

Registro de aceite (2026-09-27): `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` e `pnpm --filter @zcode/desktop typecheck:e2e` passaram; `pnpm test:unit --retry=1` passou na íntegra com 2.028 arquivos e 18.628 testes (14 testes preexistentes ignorados), e a última alteração de encerramento do fluxo foi verificada por mais 34 casos de DOM do assistente. SSH CONN-01/02, CONN-03 e CONN-06/07 correspondentes às três specs foram executados de verdade e passaram; os artefatos estão em [Plano SSH P0](../../testing/ssh-remote-p0-e2e-plan.md#rdux-04-向导回归). As revisões dos eixos Standards / Spec não tiveram pendências; o novo E2E permanece pending e ainda não foi promovido manualmente.
