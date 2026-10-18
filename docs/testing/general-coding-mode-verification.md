# Modo Geral/Programação: superfície de impacto e verificação

## Feature Summary

| Campo                         | Valor                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor / capacidade | Diferenças de exibição e preservação de painéis entre os modos geral e de programação                                                                   |
| Camada de mudança             | apresentação, origem de opções, padrão de rascunho, validação, persistência                                     |
| Modo de operação              | implementation-handoff; completar a verificação final conforme a semântica de produto já confirmada       |
| Sementes primárias            | `createZCodeStore`、`useIsGeneralMode`、`useAppPanels`、`ToolCallBlockComponent`、`ConversationRowView` |
| Fora de escopo                | prompts de modelo, gestão de artefatos, visualização unificada de arquivos, deslocamento do botão de configurações, alteração do protocolo continuous/replayable |

## Matriz de superfícies de UI

| Cenário do usuário / entrada de UI | Implementação compartilhada | Owner de exibição/autoridade, padrões e destino | Validação / ação de envio | Limite de modo / invariantes de isolamento |
| ----------------------- | -------------------------------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------------------------ |
| Alternar aparência nas configurações / menu do avatar | `settingsCodePreview` / `WorkspaceSidebarFooter` | ZCodeStore; padrão coding; localStorage | setInterfaceMode / difusão existente | Desktop/Web compartilhado; não altera o modo de task, o modelo nem as permissões |
| Ver comandos e modificações de arquivos | Os quatro renderers de `ToolCallBlocks` | Nó de tool original, apenas exibição derivada | canToggle/forceOpen, filtros de título e detalhe | Não remove resultados originais; clique em arquivo segue usando a pré-visualização existente |
| Pensamento / resposta final | `ConversationRowView` / `MessageResponse` | Row original; preferência de pré-visualização de código | Exibição do texto original do pensamento, forceCodeWrap | Aplicado em streaming e concluído; não escreve de volta o original |
| Área de Git de status / resumo de turnos | `conversationStatusPanelModel` / `ConversationTurnGroup` | Git original e projeção de task | Ocultar Git model / resumo | Não interrompe a consulta de Git nem reescreve o repositório |
| Novo review/terminal | `AnimatedSidePanePanel` / quickPick / Terminal | useAppPanels; etiquetas existentes e estado do terminal | Filtro de opções, impedir criação | Itens já abertos são preservados; o fechamento existente continua funcionando |
| Abrir externamente | `WorkspaceEditorButtonGroup` / openWithEditors | Programas instalados / preferência de seleção existente | Filtro para gerenciador de arquivos | Não sobrescreve a preferência de editor já salva |
| Isolamento das configurações de Dev | SettingService | Cobertura explícita de home / retorno ao ambiente original | get/update existentes | Compatível com o caminho original quando não há override configurado |

## Comportamento Compartilhado e Divergente

Os componentes compartilhados leem a mesma preferência de modo. O filtro de candidatos e as regras de exibição
são executados separadamente por entrada; etiquetas abertas e terminais mantêm owners independentes. Não há
nova configuração remota, ação de envio em runtime ou semântica de recuperação. As restrições de navegador e a
ausência de editor nativo no Web são preservadas; o celular não revalida a capacidade de lançamento nativo do
Desktop.

## Relacionamentos da Funcionalidade

| Rank           | De -> aresta semântica -> Para                                   | Motivo e evidência                                             |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| must-inspect   | preferência -> projects-to -> entradas de conversa/configurações/painéis | Todos os chamadores de `useIsGeneralMode` e `createQuickPickCommands` |
| must-inspect   | troca de modo -> must-not-mutate -> estado de painéis já abertos | useAppPanels devolve o sidePaneState / isTerminalOpen original |
| should-inspect | modo -> projects-to -> quebra de linha de código, área de Git | MessageResponse, conversationStatusPanelModel          |
| conditional    | ambiente Dev -> persists-to -> diretório de configurações independente | SettingService.resolveUserHomeDir                      |
| invariant-only | preferência de UI -> must-remain-isolated-from -> stream do Agent / remoto | protocolo shared, runtime e relay sem alterações |
| evidence-only  | unit tests / UI E2E pending -> covered-by -> cases da tabela abaixo | Testes unitários não são prova de remote end-to-end |

## Owners de Estado e Destinos de Commit

Veja o diagrama de estados da [spec da funcionalidade](../ui/general-coding-mode.md). O ZCodeStore possui o
modo; useAppPanels/taskSidePaneMemory possui os painéis; o TerminalSession possui o PTY; CLI/runtime possui os
dados originais das tasks. A correção de ambiente do serviço de configurações altera apenas o local de
configuração sob o home Dev explícito.

## Invariantes a Preservar

A troca de modo não fecha PTY, não perde etiquetas e itens selecionados, não altera o texto original, não
altera a preferência de quebra de linha salva, não dispara requisições de modelo e não espalha a semântica de
restauração replayable do celular para o desktop continuous.

## Evidência do Codegraph

O ambiente de ferramentas atual não possui serviço nem CLI de codegraph; a varredura de profundidade 2 do
codegraph não foi executada. Símbolos compartilhados, chamadores diretos e testes foram rastreados com rg
preciso e pelo diff atual; não se pode alegar conclusão de uma varredura de grafo de código.

## Candidatos de Deriva do Grafo / Delta do Grafo

O grafo semântico existente não incluía o modo de interface; conforme o escopo confirmado, registram-se a
capacidade, o owner da preferência e as relações de entrada. O grafo não registra a proposta não implementada de
“abrir o conteúdo do arquivo pelo nome unificado”. A resolvibilidade mecânica dos seeds de código é verificada
à parte; a verificação do codegraph continua indisponível.

## Decisões de Fronteira / Registro de Esclarecimentos

- accepted: o usuário exigiu os nomes modo geral/programação; o modo geral oculta entradas técnicas e preserva painéis já abertos.
- accepted: o usuário confirmou que está disponível e que a fase é de testes e documentação antes da submissão; não submeter nem enviar ativamente.
- ignored: visualização unificada de nomes de arquivo, que ainda segue as regras de patch/file; a discussão não foi confundida com implementação nova nesta rodada.
- pruned: o produto cartesiano completo de modelos/providers distintos, já que o modo não participa da requisição; representa-se por preferências de UI e registros de ferramenta inalterados.
- pruned: o produto cartesiano completo de tema×idioma×workspace; esta rodada cobre no desktop o tema padrão em chinês, os casos de hook de identidade remota cobrem a preservação do estado compartilhado e nativo multiplataforma e o controle remoto pelo celular ficam para verificação no ambiente real.

## Casos Aceitos / Matriz de Cobertura

| ID      | Setup                                     | Ação                      | Asserções / evidência não-UI                         | Entrada de verificação e estado                           |
| ------- | ----------------------------------------- | --------------------------- | ------------------------------------------------------- | ---------------------------------------- |
| MODE-01 | sem valor/valor antigo/valor inválido                          | Inicialização e troca                | Padrão/compatibilidade normalizados corretamente, preferência salva, difusão sem eco                 | unit passed                              |
| MODE-02 | coding, terminal inferior e abas git/terminal já abertas | coding -> general -> coding | Mesmo tab id, item ativo e estado de colapso preservados; fechamento ainda funciona; criação controlada | hook passed; pending Electron 2/2 passed |
| MODE-03 | general, painel lateral vazio                       | Ver página inicial/novo/menu de comandos    | Sem review/terminal, botão de novo oculto, entrada de navegador preservada        | unit passed; pending Electron 2/2 passed |
| MODE-04 | Ferramentas de execução/modificação, em execução/concluídas/falha          | Troca de modo                    | Mudança de visibilidade do detalhe, estado de falha preservado, nó original não modificado            | unit passed                              |
| MODE-05 | Ligação do texto original do pensamento, resposta com código                  | Projeção e retorno                  | Pensamento restaura a ligação original; a quebra de linha da resposta não sobrescreve a preferência salva                | unit passed                              |
| MODE-06 | Estado do Git e editores instalados                    | Troca de modo                    | Área de Git oculta, gerenciador de arquivos preservado                              | unit passed                              |
| MODE-07 | Home Dev explícito / home comum                 | Atualizar configurações                    | Escreve apenas no caminho de configuração alvo, sem poluir o home real                       | service unit passed                      |

## Handoff de Planejamento / Notas de Handoff de E2E

- UI E2E: `ui-shell/manual-review/pending/general-coding-mode.test.ts`; sem requisições de modelo, sem necessidade de resposta do provider.
- A renderização de dados de conversa existentes é coberta por testes unitários de componente; desta vez não se falsifica saída de modelo para simular verificação de rede real.
- O E2E usa um home de teste independente e o processo de escopo de run do framework; não mexe na instância de desenvolvimento do usuário.
- O novo E2E permanece pending; sua promoção e eventual inclusão no suite Docker são tratadas separadamente conforme o ciclo de vida.
- Não é preciso repetir perguntas sobre semântica já confirmada. Escopo pendente: Windows/Linux nativo, controle remoto real pelo celular e varredura do grafo de código.

## Resultados da Verificação

2026-09-11, macOS arm64, Node 24.14.0 / pnpm 10.33.2; baseline `042a36cad2`.

- Testes unitários relacionados antes da remoção do filtro de pensamento: executado `vitest related --run` sobre os arquivos realmente alterados da árvore de trabalho, 410 arquivos aprovados, 4119 passed / 3 skipped. Não é apenas a comparação de um escopo vazio do HEAD já commitado.
- Testes unitários direcionados antes da remoção do filtro de pensamento: 8 arquivos, 121 casos, todos aprovados (há sobreposição com os testes relacionados e as contagens não são somadas). Cobre normalização da preferência, persistência, difusão sem eco, owner de painéis, exibição de ferramentas em execução/concluídas/falha, cerca de pensamento, contêiner/cópia/quebra de linha de código em respostas, projeção de Git, filtro de editores e isolamento do Dev home.
- Electron isolado: 2/2 do spec pending desta página aprovados. Cria de fato review, terminal lateral e terminal inferior; após trocar de modo, valida tab id/item selecionado inalterados, saída existente do PTY marcada de forma independente e fechamento efetivo; também valida página de configurações/menu do avatar/refresco de preferência.
- `pnpm lint`: 0 errors, 41 warnings; nenhum lint warning novo nos arquivos desta rodada.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm architecture:check --changed`: aprovados, 0 novas violações de arquitetura.
- `pnpm verify:pre-push`: aprovado; como ainda não há commit, sua fase affected compara `origin/staging..HEAD` e fica vazia, sendo pulada. Os testes unitários relacionados da árvore de trabalho acima validam o código não commitado atual; um push real ainda deve passar pelo hook novamente.
- Verificação de formato dos arquivos alterados: 44 arquivos aprovados; três catalogs/matrix grandes e já existentes também tinham problemas de formato no HEAD, e apenas o índice de cobertura desta rodada foi acrescentado, sem reorganizar todas as tabelas históricas. `git diff --check` aprovado.
- Verificação do baseline: já foi feito fast-forward para o staging obtido nesta rodada no início; a verificação final com `--no-fetch` ficou em sincronia. O fetch online final falhou por timeout de conexão em `git.example.invalid:443`; o remoto deve ser atualizado novamente antes de submeter/enviar.
- YAML do grafo, relações entre nós e verificação da existência de arquivos/símbolos dos seeds de código aprovados; a varredura do codegraph não foi executada.

### Verificação após a remoção do filtro de código do pensamento

Conforme a decisão de produto mais recente, a função de filtro de código do pensamento e seus 7 testes de filtro
foram removidos, e `ReasoningRowView` voltou à mesma ligação de texto original do staging; o comportamento
original de renderização de Markdown e de colapso não muda.

- Execução direcionada de `interfaceMode.test.ts`, `v4ConversationRowViewUserEdit.test.ts`, `messageResponseStreamdownMode.test.ts`: 3 arquivos, 83 casos aprovados.
- `pnpm lint`: 0 errors, 41 warnings; `pnpm typecheck`, `pnpm architecture:check --changed` (0 violations) e `git diff --check` aprovados.
- O E2E completo de Electron não foi reexecutado nesta rodada; os resultados de E2E citados acima vêm de antes da remoção do filtro.

### Ajuste de escopo do menu de contexto de arquivo

Conforme a decisão de produto mais recente, o filtro de modo do menu de contexto dos links de arquivo da
resposta e os mocks temporários de teste foram revertidos; tanto os links de arquivo da resposta quanto a
árvore de arquivos da barra lateral mantêm o conjunto completo original de candidatos de aplicações externas e
as restrições de disponibilidade remota. O filtro de modo do botão “Abrir” no topo é mantido.

Após a reversão, os testes unitários direcionados de 3 arquivos e 48 casos foram aprovados; lint (0 errors,
41 warnings), typecheck, verificação de arquitetura e `git diff --check` passaram.

### Verificação após sincronizar com o staging (2026-09-11)

- Fast-forward de `042a36cad2` para o `origin/staging` obtido online nesta rodada: `87d6a7b2fc`, incorporando 81 commits.
- As alterações não commitadas originais e os 8 arquivos de funcionalidades não rastreados foram todos recuperados; nos conflitos dos dois documentos de diretório de testes de conversa, o conteúdo do upstream foi mantido e a seção de modo foi acrescentada. O diretório de demonstração `mode-output-demo1/` foi preservado.
- `pnpm install --frozen-lockfile --prefer-offline`, `pnpm typecheck`, `pnpm lint` (0 errors, 41 warnings), verificação de arquitetura (0 violations), verificação de atualidade do baseline e `git diff --check` passaram.
- Testes unitários relacionados à árvore de trabalho: 413 arquivos, 410 passed / 3 failed; 4157 passed / 4 timeout / 3 skipped. Os timeouts envolvem atualização automática, escrita de configurações e leitura da configuração SSH.
- Após a primeira rodada, os 3 arquivos de teste acima foram reexecutados isoladamente com `--maxWorkers=1`: 93/93 aprovados, sem afrouxar limites de timeout e sem modificar a lógica de negócio correspondente. As duas rodadas têm sobreposição e não têm suas contagens somadas.
- O E2E completo de Electron não foi reexecutado nesta rodada; as evidências de E2E citadas acima pertencem ao baseline antigo. Nenhum commit foi criado nem enviado.

### Como executar e evidências

Primeira execução a partir de um build limpo (requer as dependências do repositório já instaladas):

```bash
ZCODE_E2E_MANUAL_REVIEW=1 \
ZCODE_BUILTIN_PROVIDER_CONFIG_FILE="$PWD/config/provider/zcode-builtin.json" \
  mise exec -- pnpm --filter @zcode/desktop test:e2e -- \
  --spec './test/e2e/ui-shell/manual-review/pending/general-coding-mode.test.ts'
```

Nesta rodada o build E2E completo foi concluído primeiro; depois, ao modificar apenas os testes, o build é
reaproveitado com `ZCODE_E2E_SKIP_BUILD=1 ZCODE_E2E_SKIP_AGENT_BUILD=1` do framework. A config explícita de
provider impede que a inicialização do teste caia na inicialização de configuração remota impossível de
concluir; isso não altera a resposta do modelo nem envia requisições de conversa.

Relatório Electron aprovado: `packages/desktop/.e2e-artifacts/desktop-e2e-20260910161155755-p86485-1e1dbe00b0b94651/summary.md`.

Resultados locais em `.cache/concise-professional/`: `prep-related.log`, `mode-unit-final.log`,
`mode-e2e.log`, `prep-lint.log`, `prep-typecheck.log`, `prep-e2e-typecheck.log`, `prep-prepush.log`. Os logs são
produtos locais de verificação e não entram na submissão.

Diagnóstico de falhas: a primeira execução travou na inicialização da configuração; uma criação de sessão do
WebDriver deu timeout. A primeira versão do teste de modo também usava clique no DOM para abrir o trigger do
Radix e depois trocava consecutivamente sem esperar o menu antigo sair. O resultado final passou a usar clique
real e esperar a desmontagem do menu antigo; não foi adicionado sleep fixo nem a lógica de produto foi modificada
por esses problemas de teste.

### Cobertura ainda não declarada

Execução nativa em Windows/Linux, controle remoto real pelo celular, outros idiomas/temas e Docker
replay/admissão em CI ainda não foram verificados. O novo E2E continua pending e não pode ser escrito como
cobertura oficial de CI; a visualização unificada de arquivos por link continua fora do escopo desta
implementação. `mode-output-demo1/` é um produto de teste manual, mantido localmente e excluído da submissão.

### Reverificação de preparação do MR (2026-09-14)

- Baseline: `c71d91499b`, alvo `origin/staging` é `2408407197`; verificação de baseline online aprovada.
- `pnpm typecheck`, `pnpm lint` (42 warnings, 0 errors), verificação de arquitetura (0 violations) e `git diff --check` aprovados.
- Primeira rodada de testes unitários relacionados: 418 arquivos aprovados, 4163 casos aprovados, 3 pulados; dois arquivos de testes de controle remoto falharam ao carregar por falta do executável do Electron nesta máquina. Depois que o fluxo de inicialização do E2E concluiu a instalação do Electron, os dois arquivos foram reexecutados direcionadamente com 74/74 aprovados.
- Os casos de modo do Electron atuais passam 2/2. A reverificação corrigiu duas premissas de interação do próprio teste: o textarea oculto do xterm não pode ser clicado diretamente; clicar antes de terminar a animação de saída do menu Radix acionava por engano a entrada do navegador. Passou-se a esperar a desmontagem do menu, clicar no terminal visível e validar o foco, sem modificar a implementação do produto nem adicionar sleep fixo.
- Relatório aprovado: `packages/desktop/.e2e-artifacts/desktop-e2e-20260914125059185-p5323-92d9bc8a33e5b101/summary.md`; captura de tela: `packages/desktop/.e2e-artifacts/general-coding-mode/general-mode-pty.png`. Ambos são produtos locais de verificação; a captura de tela é entregue como anexo do MR.
- A cobertura inclui macOS, chinês e tema escuro padrão; as combinações end-to-end de controle remoto pelo celular, Windows/Linux e outros idiomas/temas continuam sem verificação. No envio continua sendo executado o hook pre-push completo, sem pular portões.

### Promoção dos casos de UI Shell

O usuário confirmou a aceitação e os dois testes MODE-01 e MODE-02/03 do mesmo arquivo foram promovidos para
`packages/desktop/test/e2e/ui-shell/general-coding-mode.test.ts`, com correção do caminho relativo do helper e
sincronização das referências de diretório e matriz. O caminho e o estado pending citados acima são mantidos como
registro histórico de verificação.

O script `e2e:promote` existente suporta apenas conversation-session, e o dry run rejeita caminhos ui-shell; desta
vez a migração foi feita diretamente na área original, sem alterar o script nem mover o caso para a área errada.
Os casos apenas operam a UI e o PTY local e não enviam requisições de modelo, portanto não existe fixture de
resposta de modelo local do caso. A execução no caminho oficial não usa `ZCODE_E2E_MANUAL_REVIEW`. A admissão do
preset Docker ainda não foi executada e não se declara cobertura de CI no Docker.

Verificação da promoção: 2/2 aprovados no caminho oficial em macOS (sem manual-review), relatório
`packages/desktop/.e2e-artifacts/desktop-e2e-20260914135304096-p28302-df659cf52d0d2fbd/summary.md`. Typecheck,
desktop typecheck:e2e, lint e verificação de arquitetura passaram. A execução adicional da auditoria de
cobertura de conversation falhou; depois de restaurar temporariamente todas as alterações desta rodada para o
HEAD e reexecutar, a saída da auditoria foi idêntica, confirmando que se trata de drift de estatísticas/documento
gerado preexistente e de que esta rodada não adicionou nenhuma falha de auditoria.