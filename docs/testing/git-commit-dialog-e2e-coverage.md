# Cobertura E2E do Diálogo de Commit Git

Data de atualização: 2026-07-07

## Resumo do Recurso

Esta rodada de requisitos consolidou as operações de escrita do Git no topo em uma entrada principal "Commit ou Push" e transformou o diálogo de commit em um fluxo de commit manual, compacto e com prioridade de teclado: a geração automática da mensagem de commit apenas preenche o campo de entrada, e commit / commit e push / push são acionados manualmente pelo usuário na área de ações Command na parte inferior.

## Inventário de Operações de UI

| ID | Operação de UI | Comportamento esperado | Camada de evidência |
| --- | --- | --- | --- |
| GCD01 | Clicar no botão principal "Commit ou Push" do Git no topo | Em repositório dirty, abre o diálogo de commit; o menu de três pontos não aparece mais à direita do botão | DOM / dialog |
| GCD02 | Abrir o diálogo de commit | Exibe o overlay padrão; o diálogo tem largura compacta `max-w-md`; o topo mostra a branch atual e as estatísticas de `+/-` | DOM / layout |
| GCD03 | Conteúdo do diálogo carregado | Foco automático no campo de entrada da mensagem de commit | activeElement |
| GCD04 | Clicar na branch atual no topo | Expande a lista de branches para troca; o diálogo de commit não exibe ações de footer de branch | DOM / branch list |
| GCD05 | Digitar a mensagem de commit manualmente | O campo de entrada mantém o foco e o conteúdo digitado | DOM value |
| GCD06 | Clicar no botão Sparkles no canto inferior direito | Apenas gera e preenche a mensagem de commit, sem fazer commit automático | service / DOM value |
| GCD07 | Alternar "Incluir alterações não preparadas" | O checkbox usa o estilo shadcn; o toggle afeta a contagem de arquivos e o escopo de stage/commit seguinte | DOM / service payload |
| GCD08 | Pressionar ArrowDown / ArrowUp com foco no campo da mensagem de commit | A ação Command selecionada abaixo alterna entre "Commit / Commit e push / Push" | DOM selected state |
| GCD09 | Pressionar ArrowDown / ArrowUp com foco no Command inferior | Também alterna a ação selecionada; não exibe o marcador de visto, apenas o badge de atalho do item selecionado | DOM selected state |
| GCD10 | Pressionar o atalho principal + Enter | macOS usa Command+Enter, Windows/Linux usa Ctrl+Enter, acionando a ação selecionada | keyboard / service call |
| GCD11 | Selecionar "Commit" | É preciso fazer o commit manualmente; se a entrada estiver vazia, primeiro gera uma mensagem de Conventional Commit e só então faz o commit | service call / git state |
| GCD12 | Selecionar "Commit e push" | Após o commit bem-sucedido, faz push da branch atual imediatamente | service call / git state |
| GCD13 | Clicar no botão principal em repositório clean e ahead | O botão principal passa a ser o caminho de push e abre o diálogo de push | DOM / service call |

## Decisões de Poda

| Candidato | Decisão | Motivo |
| --- | --- | --- |
| GCD01/GCD02/GCD03/GCD04/GCD05/GCD07/GCD08/GCD09 | accepted | UI pura / estado Git local é construível de forma estável, sem necessidade de requisição a provider ou remote remoto |
| GCD06 | planned | Exige replay de provider case-local ou captura manual; não pode ser misturado a um caso de UI pura |
| GCD10 | planned | Exige validar o mapeamento de atalhos por plataforma e o disparo da ação; adequado para uma asserção de service de commit sem push, isoladamente |
| GCD11 | planned | Altera o histórico Git; deve construir um repo descartável separado e verificar commit message / staged paths |
| GCD12/GCD13 | planned | Exigem fixture de remote/upstream e não podem ser testados junto com a UI básica do diálogo de commit |

## Plano de Casos E2E

| Caso | Caminho | Status | Setup | Ação | Asserção |
| --- | --- | --- | --- | --- | --- |
| GCD-UI-01 | `packages/desktop/test/e2e/git/git-commit-dialog-ui-flow.test.ts` | formal | Antes do WDIO iniciar, inicializar o workspace padrão como repositório Git, contendo staged, unstaged e um segundo branch local | Abrir o diálogo de commit, digitar a mensagem, alternar o checkbox, alternar o Command com as setas, expandir a lista de branches | O overlay do diálogo existe, o campo de entrada recebe foco automático, e o estado dos botões / checkbox / Command / branch list está conforme o esperado |
| GCD-GEN-01 | a definir | planned | replay de provider case-local + repo dirty | Clicar no Sparkles para gerar | Uma mensagem de Conventional Commit é preenchida no campo e nenhum commit é acionado |
| GCD-COMMIT-01 | a definir | planned | repo descartável + sem remote | Digitar a message manualmente e acionar "Commit" com Cmd/Ctrl+Enter | Um commit é adicionado ao histórico Git; apenas os arquivos do escopo atual entram em stage |
| GCD-PUSH-01 | a definir | planned | bare remote descartável + branch ahead | Clicar no botão principal em repositório clean e ahead | O diálogo de push é aberto e o push / set-upstream é executado |

## Notas de Passagem

- O dry-run de `e2e:promote` confirmou que o script atual só suporta `conversation-session`; nesta rodada o domínio Git foi movido manualmente para a raiz de casos formais sob a mesma regra de promoção. A ferramenta de promote pode ser estendida para o domínio `git` mais adiante.
- O `e2e:fixture:check` atual só suporta o diretório formal `conversation-session`; `GCD-UI-01` não depende de fixture de provider, e a validação formal se baseia em um único spec do WDIO.
- O contrato estável de `GCD-UI-01` é `providerRequestPolicy=none`, sem clicar em gerar, commit ou push.
- Os casos futuros de geração / commit / push precisam ser separados em fixtures case-local, para evitar que requisições ao modelo, efeitos colaterais no histórico Git e push para o remote se contaminem mutuamente.

## Migração do Raio de Canto do Diálogo (2026-09-04)

Com base nas [regras de raio de canto de diálogos do DESIGN.md](../../DESIGN.md#dialogs), o shell comum dos Dialogs passa a usar uniformemente `2xl`, removendo as sobrescritas de negócio com `xl` / `3xl`; a pré-visualização de anexos do chat, a pré-visualização de capturas da tela de feedback e a pré-visualização de capturas da tela do CUA mantêm explicitamente `xl`. Esta rodada não ajusta os containers internos nem os controles do diálogo.

GCD-UI-01 ganha uma asserção de raio de canto calculado de 16px para o diálogo de commit. O padrão compartilhado, as sobrescritas de negócio e as três exceções de pré-visualização são cobertas por testes unitários. Desktop e Web móvel reutilizam os mesmos componentes, sem mudança de processo, sincronização de estado ou semântica de recuperação; a verificação visual independente entre plataformas e no mobile precisa ser registrada à parte.

### Resultados da Verificação Desta Rodada

- O novo teste de raio de canto falhava antes da alteração; após a alteração, os testes unitários relacionados passaram (34 itens na primeira rodada; após incluir a busca na área de chat, 18 itens desse grupo de testes passaram).
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e` e `pnpm lint` passaram; o Lint apresentou 41 warnings já existentes e 0 erros.
- GCD-UI-01 no Electron do macOS: 1/1 passou, incluindo a asserção de raio de canto calculado de 16px; run ID: `desktop-e2e-20260904080854303-p50838-b01f152a8e3d50f0`.
- As entradas das três pré-visualizações que mantêm `xl` foram verificadas por teste unitário, sem execução individual da UI de pré-visualização; Web móvel, Windows e Linux ainda não passaram por verificação visual independente.