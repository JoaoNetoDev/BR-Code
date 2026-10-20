# Qualidade dos testes unitários e especificação de redução

## Objetivo e escopo

Manter os testes unitários que conseguem detectar erros de comportamento e remover as
asserções que apenas travam a forma da implementação, sem valor de proteção independente.
Esta limpeza modifica apenas os testes e os documentos de cobertura e validação; não
modifica o código-fonte do produto, as entradas de teste, as políticas de arquitetura nem o
código de E2E.
A decisão de manter ou remover não é tomada com base na proporção de remoção, na cobertura, no
tamanho do arquivo ou na quantidade de mocks.

## Critérios de remoção

Revisar arquivo por arquivo o que os testes executam e o que as asserções realmente
demonstram:

| Tipo                                                                                          | Tratamento                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Ler o código-fonte do componente e verificar strings de class, ordem de atributos, nomes de componente ou de variável local | Remover guardas de texto puro; essas asserções não provam renderização, layout ou interação |
| Apenas verificar se um trecho de implementação usa determinado hook, chamada de função ou forma de branching | Remover quando não houver evidência comportamental independente; não substituir por outra asserção textual |
| O teste cria o próprio substituto e então verifica que o substituto devolve o valor pré-definido, sem chamar a implementação sob teste | Remover                                                                                        |
| A mesma entrada, fronteira e resultado já estão cobertos por um teste mantido                      | Mesclar ou remover, registrando o teste mantido                                               |
| Chama de fato a análise, validação ou função de negócio e verifica regras independentes, fronteiras ou resultados de falha | Manter; um teste curto também pode ter valor independente                                   |
| Apenas copia literalmente tabelas de constantes, mapeamentos de ícones ou de rótulos e valores padrão de exibição, sem regra independente | Remover definições duplicadas; chamar uma função real não significa automaticamente ter valor de proteção |
| Getter ou repasse simples que só compara o mesmo campo da implementação, sem verificar a fiação de fronteiras | Remover quando não houver valor de contrato exclusivo; não criar um teste por método só porque o método existe |
| Permissões, segurança, compatibilidade de protocolo, isolamento de identidade, persistência, condições de corrida ou fiação real de IO | Manter a proteção exclusiva; não remover só por usar mock ou ler arquivo                  |
| Contratos de arquitetura, manifestos de recursos de publicação, artefatos gerados e outras restrições estáticas | Revisar pelo valor da restrição, sem agrupá-los na limpeza de strings de código-fonte      |
| Arquivos que misturam guardas de código-fonte e comportamento real                             | Manter o comportamento real; remover casos de baixo valor só quando for possível separá-los claramente |

Os testes de defeitos históricos também precisam ter a capacidade de asserção verificada.
Apenas afirmar que uma palavra aparece no código-fonte não pode ser considerado como ter
reproduzido o defeito.
Remover esse tipo de asserção não significa que o comportamento correspondente já tenha
cobertura de automação completa, e também não significa adicionar um teste à força para cada
item removido.
Testes de configuração local que repetem asserções sobre o diretório padrão inteiro exigem
primeiro confirmar a titularidade do diretório e a cobertura independente, para depois
restringir as partes não relevantes.
Os testes de fiação local de MCP só podem excluir explicitamente os quatro servidores de
documentação embutidos que já têm verificação independente; ainda se mantêm as asserções de
uma única inicialização, da ordem dos alvos, da rejeição de servidores adicionais desconhecidos,
assim como da identidade da requisição, da sobrescrita do usuário e da exclusão de servidores
aposentados.
Mantêm-se o `contract.test.ts` exigido pela arquitetura e os casos e catálogos de E2E já
existentes; a matriz de cobertura (coverage matrix) apenas corrige as declarações de
cobertura de testes unitários que ficaram inválidas.

## Execução e aceitação

1. Registrar o ponto de partida da tarefa, concluir primeiro a revisão somente leitura e esta
   especificação e só então remover os testes já revisados.
2. A lista de remoções deve explicar o motivo com base nas asserções reais; arquivos mistos não
   podem ser removidos por inteiro por engano.
3. Verificar se os imports entre testes, a configuração de execução e os documentos de cobertura
   atuais referenciam os arquivos removidos, corrigindo as referências agora inválidas.
   Registros históricos de execução mantêm seu sentido histórico; resultados de validação
   antigos não são reescritos como se fossem desta validação.
4. Executar o typecheck da raiz, o lint, a checagem de arquitetura das mudanças, a checagem de
   formatação e os testes unitários affected do ponto de partida da tarefa.
   Se affected não selecionar nada ou o conjunto completo for pulado, reportar isso com
   honestidade; não é possível alegar com base nisso que todos os testes mantidos passaram.
5. Executar de forma direcionada os testes de comportamento mantidos que são relevantes,
   verificando que a limpeza não quebrou a montagem dos testes; não expandir automaticamente
   para o conjunto completo de testes unitários.
6. Verificar se apenas os testes e documentos dentro do escopo combinado foram alterados e,
   após a verificação passar, fazer o commit local.

## Contrato de revisão arquivo por arquivo dos testes unitários restantes

A terceira rodada estabeleceu o inventário atual de testes a partir de `0cd29a0ab4`. O escopo
são os arquivos de teste/spec TS/JS rastreados pelo Git, excluindo E2E, aceitação de navegador,
fixtures, artefatos gerados e cópias de terceiros. Testes não registrados ao lado do código-fonte
também entram na revisão de qualidade; a quantidade efetivamente executada continua sendo
contada separadamente por cada entrada de teste. O inventário atual tem 3578 arquivos, com
1069334 linhas.
A revisão das entradas de linguagem encontrou ainda 7 testes em Go, Python e Kotlin, com 2270
linhas, incluídos em `unit-test-review/extra-languages.jsonl`; o escopo completo de leitura
passa a ser 3585 arquivos e 1071604 linhas.
O instrumentation do Android é aceitação de dispositivo e não entra nesta redução de testes
unitários; o `action-settler.test` vazio não tem código-fonte nem caso registrado e também não
entra na contagem de arquivos revisados. O número original do inventário TS/JS é mantido para
conferir o razão de grupos.

Esta rodada não substitui a revisão pela varredura. Cada arquivo deve ser lido por inteiro,
incluindo o teste, o setup e os helpers locais, lendo a implementação ou o contrato
correspondente conforme a chamada efetivamente testada, e conferindo se os cenários duplicados
realmente apresentam entradas, ordens ou fronteiras diferentes.
Arquivos grandes devem ser lidos em partes contínuas; não é permitido marcar como revisado
usando saída truncada, lista de títulos ou resumo de imports.

O razão de revisão arquivo por arquivo é gravado em `docs/testing/unit-test-review/`:

- Cada registro contém o caminho do arquivo, o hash do conteúdo no momento da revisão, a
  quantidade de linhas realmente lidas, os grupos de comportamento cobertos, a base da
  implementação e a conclusão de manter/remover/simplificar.
- Simplificar ou remover exige listar os casos concretos e o motivo; ao alegar duplicidade,
  é preciso indicar o caso mantido e a evidência da mesma entrada.
- `contract.test.ts` é obrigatório ser mantido, mas ainda precisa ser revisado e registrado;
  proteções únicas de segurança, identidade e temporização não podem ser removidas só porque a
  forma é simples.
- Arquivos mistos lidos parcialmente não podem ser registrados como lidos por inteiro;
  contratos que não é possível julgar continuam sendo verificados, e o razão não pode ser
  preenchido com conclusões genéricas.
- Após cada lote de revisão, primeiro conferir a lista e coletar os casos, e só então remover;
  uma falha de validação não pode virar automaticamente motivo de remoção.
- Só é possível declarar a revisão dos testes unitários restantes concluída quando todo arquivo
  do inventário tiver um registro completo de revisão semântica. No caminho, reporta-se apenas o
  já concluído e o que falta.

## Registro desta limpeza

### Primeira rodada: guardas de texto do código-fonte

2026-10-15: linha de base `f540bccfa6`. Os três grupos de revisão verificaram item a item as
asserções; foram removidos 64 arquivos de teste e simplificados 28 arquivos mistos. O código-fonte
do produto, a configuração, as entradas de teste e os arquivos de E2E não mudaram.

Antes da limpeza o Vitest efetivamente coletou 92 arquivos, com 608 casos; depois restaram 289.
Foram removidos 319 casos ao todo, dos quais 1 já era `skipped`. Não se substitui a quantidade
de casos paramétricos expandidos pela contagem estática de `it`.

Validação: typecheck da raiz, lint (210 warnings, 0 erros), checagem de arquitetura das mudanças e
checagem de formatação dos arquivos alterados passaram. O affected do ponto de partida da tarefa
selecionou e executou de fato 28 arquivos, com 289/289 casos passando; outros três arquivos
mantidos de integridade de configuração, mapeamento de parâmetros e fronteiras de dados passaram
com 87/87 casos. Não foram executados os testes unitários completos nem o E2E do produto.

Os caminhos na tabela abaixo registram a localização dos testes removidos e não servem como
links de arquivos atuais nem como entradas de execução.

#### Remoção de arquivo inteiro

| Arquivo                                                                                         | Motivo                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/test/cuaHelperOperationsDocs.test.ts`                                        | Trava o nome antigo do documento, exemplos de comando e o texto original do feature graph; não verifica as operações nem as assinaturas do Helper.               |
| `packages/desktop/test/hostMediaPreviewLogging.test.ts`                                        | Afirma apenas o valor literal do limite e o texto do log; não executa o caminho de limitação nem o de autorização.                                                          |
| `packages/desktop/test/rendererMessageHandler.test.ts`                                         | Os quatro casos só afirmam nomes, chamadas e textos de atributos do código-fonte; os mocks do topo não são consumidos por nenhuma chamada de negócio.             |
| `packages/provider-node/test/zcode-builtin-map-formatting.test.ts`                             | Trava principalmente a formatação e a indentação de expressões CEL; a compilação e a análise reais continuam protegidas pelos testes de integridade do builtin e de comportamento do option-map. |
| `packages/services/test/cuaProducerSurfaceSimplification.test.ts`                              | Faz apenas varredura de palavras proibidas no código-fonte da fachada antiga e dos aliases; não verifica o comportamento de nenhum consumidor.                           |
| `packages/ui/test/appQuickPickCommandStability.test.ts`                                        | Trava o uso de useMemo, o nome das dependências e a montagem de props; não executa re-render nem verifica a estabilidade das referências.                                    |
| `packages/ui/test/appearanceSettingsLayout.test.ts`                                            | Copia classes de layout, chaves de locale e constantes de texto; não verifica o comportamento de configurações nem de troca de idioma.                                     |
| `packages/ui/test/assistantMarkdownTypeScale.test.ts`                                          | Casa literalmente, entre componentes, tamanhos de fonte, classes e declarações de token; não verifica a tipografia real.                                                          |
| `packages/ui/test/automationCardBorderTokens.test.ts`                                          | Casa literalmente várias classes de borda de Card e escritas de sombra.                                                                                                      |
| `packages/ui/test/automationCustomRepeatTestIds.test.ts`                                       | Casa atributos de Input no código-fonte, test id e constantes numéricas; não digita nada nem verifica as regras de agendamento.                                           |
| `packages/ui/test/automationEditSubtitle.test.ts`                                              | Casa classes de título/subtítulo, chaves de i18n e a ordem no código-fonte.                                                                                                   |
| `packages/ui/test/automationFormInputSurface.test.ts`                                          | Casa as classes de altura, raio e cor do campo de entrada.                                                                                                                   |
| `packages/ui/test/automationMenuIconAssets.test.ts`                                            | Casa nomes de Lucide, tamanho, traço e o JSX dos ícones.                                                                                                                     |
| `packages/ui/test/automationNewTaskHistoryInteraction.test.ts`                                 | Casa expressões ternárias, rótulos e strings do código-fonte; não troca o histórico nem dispara carregamento.                                                                  |
| `packages/ui/test/automationScheduleInputHeight.test.ts`                                       | Recorta o código-fonte e trava as classes de altura, overflow, espaçamento e traço.                                                                                            |
| `packages/ui/test/automationShowcaseTemplates.test.ts`                                         | Copia textos traduzidos, nomes de Lucide, componentes do código-fonte e strings de ramificação de renderização.                                                                  |
| `packages/ui/test/automationsMainDragRegion.test.ts`                                           | Trava classes de layout, condições do código-fonte e a contagem de aparição de componentes; não executa arrasto de janela nem mede layout.                                      |
| `packages/ui/test/codeFontStack.test.ts`                                                       | Copia as strings do código-fonte da pilha de fontes CSS e dos tokens do viewer.                                                                                                 |
| `packages/ui/test/desktopTopOverlaySidebarWidth.test.ts`                                       | Trava nomes de variáveis, hooks, APIs e escrita de classes; não dispara resize nem lê as métricas nativas da janela.                                                            |
| `packages/ui/test/dialogRadius.test.ts`                                                        | Varre com regex as classes `rounded` por componente; não renderiza nem mede o raio.                                                                                            |
| `packages/ui/test/dropdownMenuContentWidth.test.ts`                                            | Copia as classes de largura; não renderiza texto longo nem layout de tela estreita.                                                                                             |
| `packages/ui/test/executeToolCallBlockStyle.test.ts`                                           | Afirma apenas a classe de fonte no código-fonte do comando colapsado.                                                                                                          |
| `packages/ui/test/floatingOverlayLayering.test.ts`                                             | Copia classes de z-index e de sombra; não abre nenhuma camada flutuante nem verifica o empilhamento.                                                                            |
| `packages/ui/test/hookCreateButtonSize.test.ts`                                                | Casa o nome do componente compartilhado, a ordem das props e as classes; não verifica o tamanho do botão.                                                                       |
| `packages/ui/test/hookIconStyle.test.ts`                                                       | Apenas copia o nome do ícone Anchor e strings de JSX de várias linhas; não renderiza o componente nem verifica a visibilidade do ícone.                                       |
| `packages/ui/test/hooksHintStyle.test.ts`                                                      | Casa nomes de menu, linha divisória e atributos de contagem; não verifica interação.                                                                                           |
| `packages/ui/test/interactionThemeTokens.test.ts`                                              | Copia literais de token e conta as ocorrências de declarações CSS.                                                                                                             |
| `packages/ui/test/markdownTableLayoutRoot.test.ts`                                             | Casa atributos de dados, inset de CSS e a ordem no código-fonte; não mede o layout da tabela.                                                                                    |
| `packages/ui/test/menuOptionSpacing.test.ts`                                                   | Conta as ocorrências de classes `gap` no código-fonte.                                                                                                                         |
| `packages/ui/test/menuRadius.test.ts`                                                          | Recorta o código-fonte por componente e trava as classes `rounded`; não renderiza o menu.                                                                                       |
| `packages/ui/test/modelProviderSettingsWidth.test.ts`                                          | Afirma apenas as classes de largura de SettingsPage e ModelDialog.                                                                                                             |
| `packages/ui/test/newTaskDraftHelpButtonLayout.test.ts`                                        | Verifica apenas nomes de componente, strings de prop e a montagem do botão; não há renderização nem disparo de comportamento real.                                              |
| `packages/ui/test/occupationOnboardingWindowControls.test.ts`                                   | Casa apenas o JSX dos controles de janela e suas classes/props; não verifica as operações de janela nem a exibição entre plataformas.                                       |
| `packages/ui/test/offPeakFigmaLayout.test.ts`                                                  | Os 30 casos leem o código-fonte e casam classes, nomes de ícone, montagem de componentes e forma de escrita; não há renderização, operação nem medição de layout real.               |
| `packages/ui/test/pluginDetailHeroStyle.test.ts`                                               | Verifica apenas as classes do Hero e o nome do componente; não prova o visual real.                                                                                            |
| `packages/ui/test/pluginDetailResourceIconStyle.test.ts`                                       | Apenas repete as strings do código-fonte do mapeamento de ícones.                                                                                                              |
| `packages/ui/test/rootWebRemoteTaskSyncBoundary.test.ts`                                       | Apenas proíbe uma string completa de seletor Zustand; não verifica o número de awakenings de atualização em streaming, e uma escrita equivalente passaria.                      |
| `packages/ui/test/selectTriggerStyle.test.ts`                                                  | Apenas afirma que o código-fonte não contém uma determinada classe.                                                                                                            |
| `packages/ui/test/settingsBreadcrumbReplacesBackNavigation.test.ts`                            | Verifica apenas o nome do componente e a classe de tamanho do título; não executa a navegação.                                                                                  |
| `packages/ui/test/settingsCommandRowContent.test.ts`                                           | Verifica apenas a inexistência do campo de caminho e strings de avatar/classe.                                                                                                 |
| `packages/ui/test/settingsEditFormDeleteAction.test.ts`                                        | Casa o estilo do JSX do botão de exclusão; não verifica o resultado da exclusão.                                                                                                |
| `packages/ui/test/settingsEmptyStateStyle.test.ts`                                             | Casa apenas as classes de borda tracejada e o nome do componente de estado vazio.                                                                                             |
| `packages/ui/test/settingsFormActions.test.ts`                                                 | Apenas conta as ocorrências do texto de salvar no código-fonte, a ordem, as classes e a expressão canSave; não há renderização real nem chamada de salvamento.                 |
| `packages/ui/test/settingsHelpMenuEntry.test.ts`                                               | Verifica apenas imports, montagem de componente, comentários e strings de classe.                                                                                              |
| `packages/ui/test/settingsHookRowContent.test.ts`                                              | Casa apenas expressões de exibição e classes de tipografia.                                                                                                                    |
| `packages/ui/test/settingsItemSecondaryText.test.ts`                                           | Apenas afirma que várias ocorrências no código-fonte têm a mesma classe de texto.                                                                                             |
| `packages/ui/test/settingsListCardColors.test.ts`                                              | Verifica apenas classes do contêiner e nomes de componentes delegado.                                                                                                         |
| `packages/ui/test/settingsListCreateAction.test.ts`                                            | Apenas quebra o código-fonte para casar o JSX de botão/menu; não clica, não executa criação nem importação.                                                                      |
| `packages/ui/test/settingsListHeaderActionSize.test.ts`                                        | Apenas conta size/variant/class de botões e nomes de componentes compartilhados.                                                                                              |
| `packages/ui/test/settingsListRowActionSize.test.ts`                                           | Casa apenas strings de size/class de botões.                                                                                                                                   |
| `packages/ui/test/settingsResourceFormContainer.test.ts`                                       | Apenas repete classes do formulário, nomes de componentes e atributos JSX do Select.                                                                                          |
| `packages/ui/test/settingsResourceRowNavigation.test.ts`                                       | Casa apenas o tratamento de teclado e classes de cursor no código-fonte; o teste unitário do helper de interação real continua mantido.                                        |
| `packages/ui/test/settingsUsageProviderTabs.test.ts`                                           | Casa por fatia de código-fonte unavailableReason e SegmentPill; não calcula os itens realmente visíveis nem troca de aba.                                                           |
| `packages/ui/test/tabsLayoutSpacing.test.ts`                                                   | Apenas compara uma string de classe de tabs.                                                                                                                                |
| `packages/ui/test/toolCommandTypography.test.ts`                                               | Casa apenas strings de classe do elemento `code`.                                                                                                                            |
| `packages/ui/test/uiFontTokenMigration.test.ts`                                                | Trava apenas frases de documentação e um conjunto de classes no código-fonte; é um teste de forma de migração.                                                                  |
| `packages/ui/test/v4ConversationTimelineScrollbarGutter.test.ts`                                | Verifica apenas condições de class/prop no código-fonte; não verifica o gutter, o bloqueio de rolagem ou o resultado visível da navegação.                                     |
| `packages/ui/test/workspaceFileTreeStickyLayout.test.ts`                                       | Casa apenas o código-fonte de layout e formas específicas de escrever hook/chamada de DOM; não verifica o resultado da rolagem nem a geometria sticky.                           |
| `packages/ui/test/workspaceShellRenderStabilitySource.test.ts`                                 | Afirma apenas o nome de uma variável de useMemo; não mede estabilidade nem a contagem de renders.                                                                              |
| `packages/ui/test/workspaceShellResizeAutoCollapse.test.ts`                                    | Afirma apenas variáveis de timeout/ref e a forma de escrever setTimeout; não executa resize/colapso.                                                                             |
| `packages/ui/test/workspaceShellSidebarResizePerformance.test.ts`                              | Verifica apenas nomes de chamadas de DOM/estado no corpo de useCallback; não há verificação de performance nem de render; ainda contém casos `skip` já desativados.                      |
| `packages/web/test/homeOnlyMediaPreviewService.test.ts`                                        | Verifica apenas os campos do serviço e a forma de montagem genérica, sem executar o serviço `unsupported`.                                                                         |
| `packages/zcode-cua/test/maas-tool-result-completeness.test.ts`                                | Apenas varre as constantes de retry, nomes de campo e textos de log do script de smoke; não executa o probe.                                                                        |
| `packages/zcode-cua/test/native/pip-window-chrome.test.ts`                                     | Trava apenas valores de raio em Objective-C++, atributos de layer e constantes de curvatura, sem renderizar o painel nativo.                                                          |

#### Simplificação de arquivos mistos

| Arquivo                                                                                | Escopo de remoção e fronteira de manutenção                                                                          |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/test/appTaskQueryCacheSubscription.test.ts`                                 | Remove as guardas de nomes de API do código-fonte; mantém a guarda de comportamento de que selecionar uma task não limpa o diretório de workspace slash command |
| `packages/ui/test/appUsageDailyModelTrendChart.test.ts`                                  | Remove as asserções de nome de componente de gráfico no código-fonte e as asserções de classe dentro do caso de tooltip; mantém os testes de view model real, filtro e formatação numérica |
| `packages/ui/test/appUsageModelPieChart.test.ts`                                         | Remove as cópias de tamanho/classe do código-fonte; mantém a mesclagem real de modelos e o cálculo de participação                                                            |
| `packages/ui/test/appUsagePanel.test.ts`                                                 | Remove classes de gráfico e a ordem no código-fonte; mantém os testes de uso e de troca de escopo do componente real                                        |
| `packages/ui/test/automationTypographyTokens.test.ts`                                    | Remove apenas as verificações de classe/ícone/componente; mantém a guarda de comportamento exclusiva de que a configuração de persistência de schedule criada na sessão não sobrescreve |
| `packages/ui/test/browserUseTabIcon.test.ts`                                             | Remove a cópia do CSS de animação; mantém o teste de recuperação do favicon com fake timer dirigindo o componente real                                  |
| `packages/ui/test/confirmDialogClosingContent.test.ts`                                   | Remove as verificações puras de classe de largura/altura; mantém a guarda de temporização de que a animação de fechamento preserva o conteúdo                     |
| `packages/ui/test/conversationSelectionGuard.test.ts`                                    | Remove as cópias de classe e de texto; mantém os testes das funções reais de fronteira de seleção                                                    |
| `packages/ui/test/feedbackCenter.test.ts`                                                | A ausência do import no código-fonte já é coberta por um teste real de mount que não chama o watcher; o restante apenas copia JSX e textos traduzidos              |
| `packages/ui/test/offPeakUiPresentation.test.ts`                                         | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/overlayWindowControls.test.ts`                                         | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/pluginDetailHeaderLayout.test.ts`                                      | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/pluginSettingsSection.test.ts`                                         | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/pluginStoreManageEntry.test.ts`                                        | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/pluginStoreSourcesDialog.test.ts`                                      | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/previewPane.test.ts`                                                  | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/rewardsMenuIcon.test.ts`                                               | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/settingsSearchInput.test.ts`                                           | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/sidePaneTabStripLayout.test.ts`                                        | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/v4ConversationTurnGroup.test.ts`                                       | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/v4SessionPaneLayoutParity.test.ts`                                     | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/v4WorkspaceDraftDragDrop.test.ts`                                      | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/workspaceSidebarFooterWebRemoteControlTooltip.test.ts`                   | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/ui/test/workspaceSidebarTerminologyI18n.test.ts`                               | Remove apenas os casos isolados de string de código-fonte/classe/montagem de componente; mantém os casos de renderização real do componente, de interação e de helper de negócio |
| `packages/web/test/conversationShareRoute.test.ts`                                       | Esses casos só verificam texto de JSX e forma de escrita de instruções; mantém as verificações de resolução de rota, resultado de locale, OAuth e fiação de rota de dev |
| `packages/web/test/shareHeaderLayout.test.ts`                                            | Verifica apenas marcadores de CSS, variáveis e textos de atributo; mantém os 8 testes de comportamento de funções de layout reais |
| `packages/web/test/webRemoteControlAssistantCodeCommentCapability.test.ts`                 | Confere por fatia de código-fonte apenas props booleanas de JSX; mantém o comportamento de projeção do conteúdo de replay e de roteamento do clique no card              |
| `packages/web/test/webRemoteControlBootstrapShell.test.ts`                               | Apenas faz verificação de inclusão de strings de CSS; mantém os casos JSDOM de validação dos bytes reais do recurso HTML e de execução do script de tema embutido     |

Depois de remover guardas de texto como `rendererMessageHandler` e
`workspaceShellRenderStabilitySource`, a condição de corrida ou a estabilidade de renderização
correspondente não pode ser declarada coberta com base na antiga correspondência de
identificadores. A cobertura de rótulos de idioma do SL-02 também está explicitamente marcada
como pendente de verificação comportamental na
[matriz de cobertura de idiomas](settings-language-e2e-coverage-matrix.md).

### Segunda rodada: ampliar para constantes, repasses e cobertura duplicada

Linha de base `d027277ea8`. A primeira rodada não revisou item a item todos os testes
unitários do repositório, portanto a revisão de candidatos por texto do código-fonte não pode
ser descrita como uma auditoria de qualidade completa. A segunda rodada primeiro leu a estrutura
de todos os arquivos de teste nomeados rastreados pelo Git e só então fez a revisão semântica dos
candidatos e de suas implementações de referência. O índice tem 3678 arquivos depois de excluir
diretórios de E2E e de fixtures; ele ainda contém E2E nomeados e cópias de build, e não pode
ser tomado como o número de testes unitários ativos. A lista oficial do Vitest na raiz enumera
2587 specifications; CLI, site de documentação, testes nativos do Node e testes não registrados
ao lado do código-fonte foram conferidos entrada por entrada.

| Grupo de revisão                        | Arquivos varridos na estrutura | Candidatos lidos a fundo e arquivos de referência | Escopo                                                                                                   |
| --------------------------------------- | ------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| UI                                      | 1193                           | 100                                                 | Exclui o diretório de aceitação de navegador; inclui testes ao lado do código-fonte e mantém o `contract`  |
| Serviços, compartilhado, Provider, Client, RPC | 590                      | 70                                                  | Arquivos de teste nomeados de sete pacotes                                                                 |
| Desktop, CUA, Web, Server, outros pacotes e scripts | 873                | 65                                                  | Exclui E2E, fixtures, cópias de build e o `contract` obrigatório                                         |
| CLI                                     | 917                            | 11                                                  | Varredura de estrutura de todos os arquivos nomeados; coleta separada por pacote e por entrada de teste nativo do Node |

A varredura de estrutura inclui imports, declarações de teste, mocks, leitura de arquivos e
verificação de callbacks idênticos token a token. A lista de leitura a fundo registra apenas o
escopo realmente julgado; em arquivos mistos garante-se que os casos relevantes e suas
referências foram revisados, o que não significa que cada caso do arquivo tenha sido lido por
inteiro. Esta rodada remove dicionários de exibição fixos, eco de repasse simples, testes de
algoritmo auto-inventados, sobras de functionality aposentada e cenários duplicados
confirmadamente. Testes de OAuth, de protocolo de modelo e de keepalive de mídia com callbacks
exatamente iguais no mesmo `describe` mantêm apenas uma cópia, sem remover a cobertura de
fronteiras exclusivas. Arquivos `.test.tsx` não coletados pela configuração da raiz e testes
órfãos apontando para caminhos de CLI já aposentados não contam como casos efetivamente
executados.

A versão original do teste de complexidade do site de documentação também apresentava
`136 != 137`: o teste contava as arestas de nós ausentes como arestas entre grupos, enquanto a
implementação conta apenas nós válidos e agrupamentos válidos. Esta rodada mantém a verificação
dessa regra, trocando por expectativas independentes sobre um grafo fixo pequeno, cobrindo
entre-grupos, dentro do mesmo grupo, nó ausente e grupo ausente; não copia a implementação da
estatística, não modifica o algoritmo do produto e não remove esse teste por causa da falha
original.

#### Lista de remoções e manutenções da segunda rodada

Esta rodada removeu 59 arquivos, simplificou 64 arquivos mistos e também corrigiu referências a
testes unitários inválidas na matriz de cobertura atual. As três guardas de fiação de código-fonte
divulgadas pela origem MCP oficial foram restauradas após revisão cruzada; testes que montam env
manualmente não substituem a restrição de montagem real.

Coletados e executados pelas suas entradas reais, os casos registrados caíram de 1104 para 829,
uma remoção de 275 casos. Também foram limpas 7 declarações estáticas em dois arquivos não
registrados, que não foram contabilizadas na quantidade executada acima. Acumulando as duas
rodadas: 123 arquivos de teste e 594 casos registrados removidos (incluindo o único caso `skipped`
da primeira rodada), com uma redução líquida de 8305 linhas de código de teste.

Os 57 arquivos affected da raiz passaram primeiro com 721 casos; após restaurar as três guardas
de segurança, o arquivo direcionado passou com 21/21, e o conjunto final mantido na raiz ficou
com 724 casos. CLI Vitest 70/70, Office profile 1/1, TUI nativo 33/33 e o grafo fixo do site de
documentação 1/1 passaram. Typecheck da raiz, lint (210 warnings) e checagem de arquitetura
passaram; os 32 tarefas de typecheck do CLI e o lint (68 warnings, 0 erros) passaram. O script de
CLI local não tinha o caminho do executável do Turbo; a mesma tarefa foi executada a partir do
diretório do CLI usando a versão 2.9.14 do Turbo do lockfile. A formatação foi verificada
separadamente pelas entradas da raiz e do CLI; os testes de CUA seguem as regras de exclusão já
existentes do formatter da raiz. Não foram executados os testes unitários completos nem o E2E do
produto; não foi modificado o código-fonte do produto, o protocolo público, as entradas de teste
nem as políticas de arquitetura.

A localização dos arquivos removidos está registrada abaixo e não serve como link de arquivo
atual nem como entrada de execução.

| Arquivo                                                                            | Motivo da remoção                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/dev-docs/test/capabilityMapCurrentFeatures.test.ts`                             | Copia item a item as descrições de nós, as arestas de grafo e as palavras-chave do mapa de capacidades do site de documentação, sem comparação com a implementação de produção; não prova que os fatos escritos sobre as funcionalidades atuais são verdadeiros. Mantém os testes de cálculo de grafo, geometria e análise de YAML. |
| `apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts`                           | Copia os agrupamentos de dados mantidos à mão do mapa de capacidades, a estimativa de 1200 linhas, os nós/arestas e os textos originais das descrições; não verifica as funcionalidades de Office nem de CUA.                                            |
| `apps/zcode-cli/packages/adapters/tests/runner-debug-storage-rollback.test.ts`        | Trava apenas a forma antiga de concatenar diretórios no código-fonte, sem executar a resolução do caminho de debug storage.                                                                                                                     |
| `apps/zcode-cli/packages/bootstrap/tests/official-plugin-categories.test.ts`          | Pega plugins fixos da tabela de definição e copia as constantes de category/defaultEnabled, sem comportamento de montagem independente.                                                                                                          |
| `apps/zcode-cli/packages/contracts/tests/model-options.test.ts`                       | Apenas atribui valores a um objeto de tipo local e afirma o próprio objeto; não há implementação em runtime sob teste; a origem comum dos tipos é mantida por model-schema-contract.                                                            |
| `apps/zcode-cli/packages/debug/tests/gantt-style.test.ts`                             | Copia diretamente a constante de largura mínima e suas strings de CSS; não há verificação real das dimensões da linha do tempo.                                                                                                               |
| `apps/zcode-cli/tests/core.unit.test.ts`                                              | O diretório raiz src/core antigo foi removido; o teste ainda aponta para um módulo inexistente e não pertence à entrada de testes atual dos pacotes Turbo; limpeza de sobras de testes aposentados.                                                        |
| `packages/client/test/conversationShareRemoteServiceAccess.test.ts`                   | Depois de construir o accessor, verifica apenas que um descriptor foi solicitado e que o getter é truthy; não chama os métodos do proxy nem verifica o envio/recepção real no canal.                                                                |
| `packages/desktop/test/app-launch-telemetry.test.ts`                                  | Apenas faz o mock de createRendererContext devolver um DTO pré-definido e afirma que outro mock recebe os mesmos campos; a função de produção tem só uma linha bridge.syncTelemetryContext(createRendererContext()). Os testes de temporização real de inicialização e de isolamento do renderer continuam mantidos. |
| `packages/desktop/test/armsRumShared.test.ts`                                         | O runtime de development e o ambiente de produto production recebem a mesma entrada e a mesma saída local, o que já é verificado de fato pelo teste de montagem armsBrowserInit, que valida o env passado ao SDK; este último é mantido.                                |
| `packages/desktop/test/cuaPermissionPanelMessages.test.ts`                            | Os dois casos copiam campo a campo o dicionário de textos em chinês e inglês; o resolver só tem locale/índice de permissão e expansão de campos; não executa a autorização de permissão, a janela nativa nem a interação. Os testes do fluxo de permissão não são tocados. |
| `packages/desktop/test/desktopTelemetryFetch.test.ts`                                 | Apenas repete o repasse de uma camada de createDesktopTelemetryFetch: a mock de Response pré-definida é devolvida como está e o mesmo conjunto de URL/init é conferido; não verifica Electron, rede ou ramo de falha.                                               |
| `packages/services/test/clientScenesService.test.ts`                                  | O wrapper fino apenas chama readApiJson e devolve a resposta fabricada tal como está; o teste copia em boa parte pseudo-respostas e não verifica nem a transformação de negócio nem o erro nem HTTP real.                                                     |
| `packages/services/test/nodeCuaInstallerExports.test.ts`                              | Os 5 casos leem o código-fonte e casam exports de tipo, nomes de função, forma de configuração e comentários; não há evidência de instalação, saída ou execução de timer.                                                                     |
| `packages/services/test/providerM2LegacyBoundary.test.ts`                             | Afirma ENOENT para 5 caminhos fixos de arquivos antigos já removidos; não verifica a implementação atual, a migração de dados ou o caminho de importação; é resíduo de uma limpeza pontual.                                                       |
| `packages/shared/test/cuaPermissionDragChannels.test.ts`                              | Copia os valores literais de duas constantes de canal IPC compartilhado e verifica que as quatro constantes não se repetem; os dois lados consumidores importam a mesma constante e o teste não chama a cadeia real de arrastar.                                        |
| `packages/shared/test/modelConfigBuildClosure.test.ts`                                | Verifica apenas o texto de COPY do Dockerfile e a ordem relativa das linhas; sem build, instalação ou importação de artefato, não prova o closure de build reduzido.                                                                              |
| `packages/shared/test/modelProviderTypes.test.ts`                                     | Afirma apenas que uma string aposentada não está na enumeração de constantes nem no helper de comparação direta de enumerações; não executa a análise de Provider nem a admissão de validade.                                                            |
| `packages/shared/test/offPeakTaskIdentity.test.ts`                                    | Os 3 casos repetem item a item o getter de uma única linha Boolean(task.offPeakTaskId); não há criação de tarefa, restauração, persistência nem comportamento de identidade na UI.                                                          |
| `packages/shared/test/pluginMarketplaces.test.ts`                                     | Copia o objeto estático de mercado padrão e o resultado de classificação de um array de um elemento; sem carregamento de mercado, instalação, exceção ou verificação de interação.                                                              |
| `packages/shared/test/zcodeAgentRuntime.test.ts`                                      | Copia diretamente a constante estática spawnArgs e o mapeamento de sufixos do binário Windows; não analisa recursos de runtime nem inicia o Agent.                                                                                                |
| `packages/ui/test/automationAddScheduleIcon.test.ts`                                  | Depois de renderizar de verdade, copia apenas o viewBox, a classe e as constantes de traço do ícone Plus; não há seleção de ícone, evento ou resultado de layout.                                                                            |
| `packages/ui/test/automationDesignPrimitives.test.tsx`                                | Os três casos apenas copiam o tamanho padrão, o traço e a classe de contêiner do SVG de terceiros Lucide; não verificam comportamento de negócio.                                                                                           |
| `packages/ui/test/automationTemplateSkeletonGrid.test.ts`                             | Trava apenas quatro skeletons estáticos, a exibição do label passado tal como está e as classes; não há estado de carregamento assíncrono nem medição de layout.                                                                            |
| `packages/ui/test/button.test.ts`                                                     | Asserções de string não vazia e repetição literal de transition-colors/transition-all da configuração cva; não executa interação de botão nem mede performance de animação.                                                                 |
| `packages/ui/test/codingPlanEnterpriseTiers.test.ts`                                  | Apenas repete os textos da conversão direta de maiúsculas/minúsculas/label do nível técnico; os testes de benefícios, de compra e de agrupamento combinado são mantidos.                                                                          |
| `packages/ui/test/collapsible.test.ts`                                                | Apenas trava, para o HTML servido do defaultOpen/forceMount fixo, as marcações do Radix e as classes de animação; não há ação de abrir/fechar nem ciclo de vida da animação.                                                                 |
| `packages/ui/test/commandsSettings.test.ts`                                           | Os dois casos copiam tal como estão COMMAND_AGENT_SOURCES e as constantes de metadados; não verificam descoberta de comandos, isolamento de origem, carregamento nem execução.                                                                      |
| `packages/ui/test/contextTrigger.test.ts`                                             | Apenas afirma que o aria-label passado é repassado tal como está, o tamanho do ícone e a ausência de texto de resumo; não dispara Context nem verifica o uso.                                                                                  |
| `packages/ui/test/desktopWindowFrame.test.ts`                                         | A tabela de parâmetros de plataforma apenas repete classes de fundo/clip/radius; não opera a janela, não mede transparência nem verifica os controles nativos.                                                                               |
| `packages/ui/test/enabledStatusFilter.test.ts`                                        | Os dois casos repetem por completo a comparação booleana dos três ramos all/enable/disable; sem combinação de filtro de lista, entrada real ou isolamento de origem.                                                                          |
| `packages/ui/test/modelConfigHelpCopy.test.ts`                                        | Copia o trecho inteiro de texto de ajuda para um segundo dicionário de expected; qualquer alteração no texto obriga a alterar o teste, e o comportamento de configuração de modelo não é verificado.                                                  |
| `packages/ui/test/modelProviderPresetVisibility.test.ts`                              | Apenas afirma que o array de constantes pré-definidas não contém um ID desativado; não executa a seleção de provider nem o gate de execução.                                                                                               |
| `packages/ui/test/modelTrajectoryPane.test.ts`                                        | Depois de mockar a trajetória vazia e todos os hooks, verifica apenas a classe de overflow; não carrega a trajetória nem executa a rolagem.                                                                                                   |
| `packages/ui/test/offPeakHistoryStatus.test.ts`                                       | A tabela de parâmetros copia literalmente o mapeamento puro de completed/failed/cancelled para a chave de exibição; não verifica membros do histórico, persistência nem estado de execução.                                                            |
| `packages/ui/test/offPeakTemplateIcons.test.ts`                                       | A tabela de parâmetros copia item a item o mapeamento de template para nome de ícone Lucide e as constantes de SVG; o carregamento dinâmico de ícones e o fallback de ícone desconhecido são mantidos por automationTemplateRemoteIcons.           |
| `packages/ui/test/onboardingWelcomeI18n.test.ts`                                      | A tabela de parâmetros copia os textos de botões e títulos; não executa o onboarding nem verifica a interpolação de mensagens.                                                          |
| `packages/ui/test/pluginDetailHeaderLayout.test.ts`                                   | Apenas repete a regex simples de classificação de ícones por palavra-chave PDF/CSV, sem verificar análise, tipo de arquivo ou abertura de documento.                                                                                       |
| `packages/ui/test/pluginStoreManageEntry.test.ts`                                     | O render estático com fixture de plugin fixo trava apenas o DOM de busca/cartão/divisória e as classes; não há comportamento de entrada de gerenciamento.                                                                                  |
| `packages/ui/test/previewPaneI18n.test.ts`                                            | Copia literalmente os textos de botões/erros de pré-visualização e as descrições de tamanho; os casos reais de limite de tamanho, de caminho e de erro de formato são mantidos.                                                                   |
| `packages/ui/test/providerKeyLinks.test.ts`                                           | Apenas conta as ocorrências dos botões estáticos de obter Key e das chaves de locale; o conteúdo de Key passado não participa de nenhuma verificação de autenticação ou de visibilidade.                                                           |
| `packages/ui/test/providerStatusIndicator.test.ts`                                    | Reescreve o mapeamento direto de enabled/executable como expectativa de atributo de dados; a executabilidade real do provider, a hidratação e o comportamento de Registry vazio permanecem em modelProviderAvailability.                                        |
| `packages/ui/test/readToolCallBlock.test.ts`                                          | As duas entradas clicáveis acabaram verificando apenas a classe de cor do nome do arquivo; o comportamento real de localizar/abrir arquivo não é tocado.                                                                                     |
| `packages/ui/test/remoteConnectionEntryBehavior.test.ts`                              | A função de origem ignora os argumentos e retorna sempre open-workspace; as duas entradas booleanas apenas repetem a constante do getter e não testam o processo de conexão.                                                                   |
| `packages/ui/test/remoteConnectionTags.test.ts`                                       | Apenas copia a tabela de exibição de transport para cor/chave de label; a temporização completa da apresentação remota, a recuperação e os testes do componente de detalhe são mantidos.                                                           |
| `packages/ui/test/remoteDeviceTerminologyI18n.test.ts`                                | Apenas verifica as chaves de dicionário removidas e os termos de produto; identidade remota, estado de conexão, migração e verificação de integridade das chaves são mantidos.                                                                    |
| `packages/ui/test/selectItemLayout.test.ts`                                           | Faz mock do DOM do Radix e depois verifica as classes px/pr do SelectItem; não verifica nenhum comportamento do Select.                                                                |
| `packages/ui/test/settingsCloseToTrayI18n.test.ts`                                    | Apenas trava as palavras presentes no texto explicativo; os testes de capacidade de bandeja entre plataformas e de comportamento de fechamento são mantidos.                                                                            |
| `packages/ui/test/settingsFormTextarea.test.ts`                                       | Depois de renderizar de verdade o wrapper sem lógica do Textarea, apenas repete o shell de DOM e as classes de cor/raio.                                                                                                                       |
| `packages/ui/test/settingsHttpProxyI18n.test.ts`                                      | Apenas casa as palavras fixas do texto de ajuda do proxy; não define proxy nem verifica o acompanhamento do proxy do sistema.                                                       |
| `packages/ui/test/settingsSkillScopeBadge.test.ts`                                    | Apenas casa no código-fonte os nomes de ícone, Badge e helper de agrupamento e o texto JSX; os casos reais de roteamento de scope e de identidade de marketplace são mantidos.                                                               |
| `packages/ui/test/sourceServerManagementPresentation.test.ts`                         | Apenas repete a mesma chave de locale para dois getters de tabela direta; não envolve estado de migração nem validação de wire schema.                                                 |
| `packages/ui/test/statusDot.test.ts`                                                  | Apenas renderiza com tone=subtle e repete o mapeamento de classes de cor; não há mudança de entrada de estado nem atribuição de estado de negócio.                                   |
| `packages/ui/test/toolCallPresentationVocabulary.test.ts`                             | Copia por completo o texto em chinês e inglês de 29 chaves de tradução estáticas; não analisa ferramentas, não julga estado nem executa renderização.                                    |
| `packages/ui/test/v4ConversationDraftEmptyStateLogo.test.ts`                          | Verifica apenas o material fixo do Logo claro/escuro e as classes CSS; não troca o tema nem verifica a assinatura do tema.                                                             |
| `packages/ui/test/workspaceSidebarTerminologyI18n.test.ts`                            | Copia literalmente o mesmo dicionário de locale em chinês e inglês; não verifica que a interface obtém o valor segundo o locale.                                                            |
| `packages/ui/test/zcodeProviders.test.ts`                                             | A função de origem ignora o provider e sempre retorna true, e a outra apenas nega; as dez expectativas são repetição de constantes, e o estado real da fork task e o guard alvo não são tocados.                       |
| `packages/web/test/webRemoteControlFailures.test.ts`                                 | Apenas copia a construção do DTO com reason fixo mais message; a regressão de uso de connection-recovery-timeout depois de esgotar a recuperação da conexão continua verificada pelo teste real de agendamento de recuperação externalRelayFrameGapRecovery. |
| `packages/zcode-cua/test/broker/host-surface-simplification.test.ts`                    | Apenas varre nomes de type/alias aposentados e textos de montagem fixos; a launch policy imutável real de ghost/PiP já tem teste de spec de host real + broker + launcher, e esse teste e todas as proteções de assinatura/permissão/ciclo de vida são mantidos.     |

| Arquivo de simplificação                                                                | Escopo de remoção e fronteira de manutenção                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/dev-docs/test/capabilityMapComplexity.test.ts`                                     | Remove o snapshot fixo de graus do grafo da documentação; mantém as regras de estatística, trocando por expectativas independentes sobre um grafo fixo pequeno cobrindo entre-grupos, dentro do mesmo grupo, nó ausente e grupo ausente. |
| `apps/zcode-cli/packages/adapters/tests/mcp.test.ts`                                     | No mesmo describe e com os mesmos hooks há três grupos de títulos e callbacks exatamente iguais; de cada um se remove o último, mantendo a primeira cópia completa do teste de comportamento de OAuth.          |
| `apps/zcode-cli/packages/adapters/tests/model-transform.test.ts`                         | Idêntico token a token ao caso mantido de projeção de bloco de inferência sem assinatura; mantém o último, que é a regressão completa.                                                  |
| `apps/zcode-cli/packages/i18n/tests/i18n.test.ts`                                        | Remove a cópia de textos fixos em chinês; mantém a dedução de locale, os valores inválidos e a regra de compatibilidade do formato de diretório.                                          |
| `apps/zcode-cli/packages/office-runtime/ui/profile.test.ts`                              | Apenas copia os textos e exemplos de cada profile; mantém os casos reais de endereçamento de recursos e de isolamento por tipo de arquivo.                                             |
| `apps/zcode-cli/packages/tui/tests/tui-theme.test.ts`                                    | Remove a cópia direta dos quatro campos de cor; mantém a prioridade do tema, a inferência do fundo do terminal e a verificação de que o componente real muda com o tema.                          |
| `apps/zcode-cli/packages/tui/tests/tui.unit.test.ts`                                     | Apenas verifica rótulos fixos, estilos flex e valores literais de cor; mantém os testes reais de exibição de conteúdo, renderização, interação e recuperação.                              |
| `packages/client/test/remoteServiceAccess.test.ts`                                       | Testa apenas o nome do canal na construção e a existência do getter; a configuração real de chamadas RPC do mesmo arquivo, o isolamento de canais opcionais e a seleção de diretório de janela são mantidos.            |
| `packages/rpc/test/buffer.test.ts`                                                     | Apenas reteste o comprimento e a inicialização zero de new Uint8Array; mantém os testes de wrap sem cópia, UTF8, concatenação, offset e operações de bytes BE.                                 |
| `packages/rpc/test/foundation.test.ts`                                                 | Os cenários de dispose comum, destinatário único e primeira entrega do relay são cobertos por testes mais fortes de dispose idempotente, múltiplos listeners com Event.map e isolamento da origem antiga após a troca; mantém as fronteiras de limpeza e cancelamento. |
| `packages/rpc/test/protocol.test.ts`                                                   | A entrega unidirecional de fila está contida no teste de entrega bidirecional vizinho; mantém o bidirecional, fragmentação/ACK/congestionamento/timeout e as fronteiras de liberação.                  |
| `packages/rpc/test/serialization.test.ts`                                              | Repete um a um o happy path do cursor do reader e da concatenação do writer, já coberto pela serialize/deserialize de múltiplos quadros consecutivos do mesmo arquivo e pelo roundtrip de tipos; mantém todos os testes reais do protocolo de serialização. |
| `packages/services/test/accountRequestAuthService.test.ts`                             | Apenas afirma de novo o valor devolvido pelo resolver fabricado, sendo a implementação um return direto de resolver.resolveCurrent(input); mantém a ausência de fallback no erro e os testes reais de segurança da resolução de autenticação. |
| `packages/services/test/agentProxyEnv.test.ts`                                         | Remove apenas os 3 casos de fatia de código-fonte e de nome de ramo da suíte lazy de CUA; mantém as 3 guardas de montagem da origem MCP oficial confiável sensíveis a settings, bem como todos os testes reais de normalização de env e de consistência das regras de confiança entre Host e Agent. |
| `packages/services/test/highspeedCardService.test.ts`                                  | Apenas verifica se o código-fonte contém a string createServiceLogger; não verifica a importação do navegador, a inicialização do log nem o comportamento de execução.                              |
| `packages/services/test/pluginManagementService.test.ts`                               | Os três métodos são delegações diretas; o teste apenas repete os parâmetros e afirma o resultado de um mock fabricado, e não pode validar confiança, isolamento de alvo ou cancelamento; mantém os testes reais de regras de transformação de telemetria de ciclo de vida, de classificação de cancelamento e de duração concorrente. |
| `packages/services/test/subagentSelectionAuthority.test.ts`                            | Repete o roundtrip de codificação/decodificação do mesmo helper de shared/subagentMarkdownSelection; mantém a validação de integração real deste arquivo, de análise de Markdown e de descarte de campos intermediários. |
| `packages/services/test/zcodeAgentPresentationSurface.test.ts`                         | O true explícito apenas repete o caminho normal de !=false; permanecem a ativação por padrão com a mesma autoridade remota, o desligamento explícito por false e a recusa em não-Desktop.                              |
| `packages/shared/test/dynamicWorkflowFeature.test.ts`                                  | A comparação direta com mode!=disabled já é coberta de forma completa pelas asserções de enabled dos três modos remotos válidos do mesmo arquivo; mantém os testes de fail-closed da escala, de sobrescrita do usuário e de compatibilidade com Host antigo. |
| `packages/shared/test/launchMarks.test.ts`                                             | Apenas reescreve a string LAUNCH_MARKS_QUERY_KEY; mantém o roundtrip de serialização, o JSON inválido e as fronteiras de tipo de campo.                                                       |
| `packages/shared/test/remoteResourcePackages.test.ts`                                  | A implementação de normalize ignora completamente a entrada e devolve a lista active; os dois cenários de valores históricos repetem os casos existentes de ignores historical selections e de lista padrão; mantém o conjunto de ferramentas por plataforma, a validade do schema e a recusa de pacotes desconhecidos. |
| `packages/shared/test/shortcutCommands.test.ts`                                        | O teste de getter copia literalmente duas defaultBindings da tabela de comandos; mantém a unicidade de IDs dentro da tabela, a legalidade das bindings, as fronteiras de parsing, o escopo do composer e as regras de classificação de canal. |
| `packages/ui/test/animatedSidePanePanelLayout.test.ts`                                 | Idêntico ao callback do caso mantido "keeps active media mounted..."; a única entrada é isMediaPreview=true, sem parâmetro de tipo de áudio, e não cobre cenário exclusivo.                                   |
| `packages/ui/test/automationInstructionsComposer.test.ts`                              | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/automationsPageTabs.test.ts`                                         | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/changesGroupToolCallBlock.test.ts`                                   | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/codingPlanQuotaResetAction.test.ts`                                  | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/codingPlanQuotaResetOpportunity.test.ts`                             | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/commandCenterTypography.test.ts`                                     | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/contextAttachmentPill.test.ts`                                       | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/controlHintTooltip.test.ts`                                          | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/conversationShareImportNotice.test.ts`                               | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/desktopLogoStyle.test.ts`                                            | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/editToolCallBlock.test.ts`                                           | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/featureRequestDialog.test.ts`                                        | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/feedbackStatusMeta.test.ts`                                          | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/feedbackSubmitForm.test.ts`                                          | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/mentionPanel.test.ts`                                                | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/modelProviderCodingPlanI18n.test.ts`                                 | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/modelProviderModelRowEditor.test.ts`                                 | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/modelProviderSectionLayoutLoading.test.ts`                           | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/modelTrajectoryPaneParts.test.ts`                                    | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/pluginStoreAvatar.test.ts`                                           | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/previewPaneImageContent.test.ts`                                     | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/providerLogo.test.ts`                                                | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/rollingToolbarLabel.test.ts`                                         | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/settingsSearchInput.test.ts`                                         | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/sidePaneTabTrigger.test.ts`                                          | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/usageStatsHeatmap.test.ts`                                           | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/useWorkspaceServices.test.ts`                                        | Idêntico ao anterior "não registeredBaseServices...", que também passa null, com o callback exatamente igual; mantém o primeiro caso e os testes reais de ciclo de vida de serviços.                       |
| `packages/ui/test/v4ConversationStatusPanel.test.ts`                                   | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/v4ConversationTurnGroup.test.ts`                                     | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/v4ModelTriggerDisplay.test.ts`                                       | Callback exatamente igual ao caso mantido de nome de provider customizado; nenhum dos três casos tem entrada de plataforma ou de viewport, e a variação de título não aumenta a cobertura.                |
| `packages/ui/test/windowsCaptionMenuButton.test.ts`                                    | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/workspaceHeader.test.ts`                                             | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/workspacePurposeSection.test.ts`                                      | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/ui/test/workspaceSidebarFooterWebRemoteControlTooltip.test.ts`                 | Remove apenas os casos que repetem CSS fixo, mapeamento de ícone/label ou exibição de props sem cálculo; os casos reais de interação, de fronteira e de transição de estado deste arquivo são mantidos.                       |
| `packages/zcode-cua/test/annotations.test.ts`                                          | As asserções isoladas de request_access/stop repetem a verificação completa do conjunto de ferramentas feita antes e o sweep real do TOOL_REGISTRY; mantém o comportamento real de escrita em lote de applyToolAnnotations, o tier de segurança completo e o caminho de recusa de ferramenta desconhecida. |
| `packages/zcode-cua/test/argv-shape.test.ts`                                           | O caso dito de ordem arbitrária é exatamente igual à entrada canônica; o roundtrip apenas reconstrói os mesmos argumentos de socket repetindo o parser determinístico; mantém o canônico, o sinal de igual, o terminador, as tags de compatibilidade e todos os caminhos de fail-closed. |
| `packages/zcode-cua/test/manifest.test.ts`                                             | Remove as asserções duplicadas de comprimento, unicidade, texto de join, itens aposentados e comprimento de tier da lista exata de 14 itens, além de três casos que inventam um algoritmo de diferença de Set dentro do teste; mantém a lista exata de ferramentas, o registry/schema/map reais, a consistência de tiers e o contrato de associação. |
| `packages/zcode-cua/test/server-security.parity.test.ts`                               | O título afirma token-only, mas o callback chama de fato buildServer({}), exatamente igual ao primeiro caso de ausência de credenciais; mantém o primeiro fail-closed sem credenciais e todas as verificações de entradas de socket distintas, de recusa de placeholders e de registro real de ferramentas. |
| `packages/zcode-cua/test/tier-table.test.ts`                                           | O caso de soma 4+1+9 repete as listas exatas e as contagens por grupo já apresentadas antes no mesmo arquivo; mantém todos os tiers de segurança, os congelados e a classificação conservadora de nomes desconhecidos.                    |
| `packages/zcode-cua/test/tool-manifest-json-drift.test.ts`                             | A segunda verificação de comprimento 14 é coberta por completo pela lista exata do manifest e pela igualdade de ordem com o espelho da primeira; mantém a consistência real entre os artefatos de src e eval.                                 |
| `packages/zcode-cua/test/tool-surface-14.test.ts`                                      | Os itens aposentados são cobertos pela verificação de lista exata do manifest e pelos membros reais do MAP; o caso de aritmética 30-17+1 e a verificação isolada de existência de chave não trazem entrada nova nem fronteira; mantém o tamanho exato do MAP e toda a capacidade real de schema de dobra de clique/tecla. |

### Terceira rodada: leitura semântica de todo o inventário

Linha de base `0cd29a0ab4`. Esta rodada concluiu a revisão semântica arquivo por arquivo de todos
os 3585 arquivos do inventário, totalizando 1071604 linhas de teste. A revisão inclui o setup
completo, os helpers locais, as fixtures e a implementação correspondente às chamadas
efetivamente testadas; arquivos grandes foram lidos em partes contínuas. Após a colaboração em
quatro frentes, os candidatos à remoção foram revisados por outro revisor e só então os casos
foram coletados, implementados e executados de forma direcionada.

| Escopo                                             | Arquivos | Linhas de teste originais | Razão de revisão                                                                                                            |
| -------------------------------------------------- | -------: | ------------------------: | -------------------------------------------------------------------------------------------------------------------------- |
| CLI                                                |      905 |                 376692 | [cli](unit-test-review/cli.jsonl), [cli-tail](unit-test-review/cli-tail.jsonl)                                              |
| UI                                                 |     1157 |                 296243 | [ui](unit-test-review/ui.jsonl), [ui-middle](unit-test-review/ui-middle.jsonl), [ui-tail](unit-test-review/ui-tail.jsonl), [ui-extra](unit-test-review/ui-extra.jsonl), [ui-root-extra](unit-test-review/ui-root-extra.jsonl), [ui-runtime-extra](unit-test-review/ui-runtime-extra.jsonl) |
| Desktop, CUA, Web e outros pacotes de runtime       |     1141 |                 308364 | [runtime](unit-test-review/runtime.jsonl), [runtime-tail](unit-test-review/runtime-tail.jsonl), [runtime-extra](unit-test-review/runtime-extra.jsonl) |
| Serviços, protocolo, Provider, RPC e scripts básicos |      375 |                  88035 | [foundation](unit-test-review/foundation.jsonl)                                                                              |
| Go, Python, Kotlin                                 |        7 |                   2270 | [extra-languages](unit-test-review/extra-languages.jsonl)                                                                    |

Conferência entre inventário e razão: 3585 registros, sem caminhos duplicados nem ausentes; os
hashes originais e a contagem de linhas de cada arquivo conferem item a item, e todos os
caminhos de base da implementação existem. Há outros 619 arquivos de teste nomeados de E2E e de
aceitação de navegador, excluídos pelo escopo; a implementação nativa e as fixtures de
dispositivo não apresentaram entradas adicionais de testes unitários. Revisar tudo não significa
remover tudo: os motivos de manutenção também são registrados arquivo por arquivo.

A limpeza inclui CSS estático, ícones e cópias de texto comum, parâmetros de cenário não
consumidos, ecos que só verificam o substituto, repetições com a mesma entrada e asserções
excessivamente amplas sobre o diretório padrão. Mantêm-se as proteções exclusivas de permissão,
identidade de origem, temporização, fiação de IO, schema de protocolo, montagem de estado do
lado chamador e consistência de diretório entre linguagens. O mesmo atributo de dados não
substitui a fiação de estilo dinâmico efetivamente consumido.

Alguns casos parametrizados foram registrados de forma combinada; mesmo assim, todas as entradas
e os pontos de observação foram preservados. A redução de 537 registros da 067ª lote do CLI é
desse tipo de combinação e não é contada como remoção de 537 cenários independentes. A base de
cada redução está na razão de revisão, e a taxa de queda de registros não é usada como critério
de avaliação.

Esta rodada removeu 60 arquivos de teste, simplificou 859 arquivos mistos e reduziu
netamente 25410 linhas de teste; o código-fonte do produto, a configuração, as entradas de teste
e o E2E não foram modificados. Somando as duas rodadas anteriores, o total é de 183 arquivos de
teste removidos.

Nos 921 arquivos de referência efetivamente coletados pelo Vitest, o número de registros ativos
caiu de 18542 para 16665, uma redução de 1877. Essa contagem inclui a combinação de registros
parametrizados e não representa a remoção de 1877 entradas independentes; não inclui as entradas
nativas do Node, os itens pulados por plataforma, as declarações estáticas do Android nem os
arquivos não registrados. As entradas nativas são verificadas à parte, sem que suas declarações
estáticas sejam apresentadas como casos executados.

Validação: typecheck da raiz e do CLI, lint, checagem de arquitetura das mudanças e checagem de
formatação dos arquivos alterados da raiz e do CLI passaram. O CLI foi verificado de forma
direcionada nos 257 arquivos modificados ainda existentes, com o diretório correto de pacote:
7105 casos passaram, 24 foram pulados e houve 0 falhas; 3 arquivos removidos foram excluídos. As
13 falhas iniciais dos testes de navegador vinham de executar no diretório errado e, depois de
rodar a partir do pacote core, 48 casos passaram; as 2 falhas do SEA por dependências de build
ausentes passaram depois de reconstruir model-option-map, com 42 casos aprovados. O MCP manteve
todas as 11 verificações reais de fiação, excluindo com precisão, em quatro asserções, a lista de
plugins de documentação padrão que já tem outra verificação, e mantendo a ordem dos alvos, uma
única inicialização, a recusa de servidores adicionais desconhecidos e a verificação completa de
confiança; a validação final do pacote passou.

O affected da raiz usou o ponto de partida da tarefa `f540bccfa694da2435227d252bf5c39ab512a34b`;
a pré-visualização oficial selecionou 621 de 2481 specs; ao final, 620 arquivos passaram e 1 foi
pulado, com 9938 casos passando e 10 pulados, em 229,19 segundos. Não foram executados os testes
unitários completos nem o E2E. No Android só foi removido o teste de aritmética de template,
porque o ambiente não tem Java Runtime e a coleta e a execução pelo Gradle não foram concluídas;
essa única declaração é contada apenas como remoção estática. Os arquivos Go/Python mantidos não
foram modificados, e não se afirma que eles foram executados nesta rodada.

A matriz de cobertura atual não ganhou novas referências inválidas a arquivos removidos; planos
antigos, relatórios históricos de execução e o histórico desta especificação mantêm os caminhos
históricos. Remover asserções que não conseguem provar layout, comportamento aposentado ou um
cenário assíncrono específico não significa que esses comportamentos passem a ter cobertura de
automação.

### Encadeamento da cobertura após a fusão do staging

Na fusão do staging `65f956a8fc`, os conflitos de testes unitários foram mesclados conforme o
comportamento dos dois lados: manteve-se a divisão dos testes de inicialização do MCP do
upstream, migrando para o novo arquivo as quatro casos de fiação mantidos na terceira rodada e o
filtro preciso dos servidores de documentação; mantiveram-se o novo contrato de parâmetros da
memória persistente, a identidade do objeto quando desabilitado ou sem configuração, a
idempotência e as asserções de que a entrada original não muda; mantiveram-se a verificação do
primeiro quadro do novo rascunho e a regressão de isolamento do resultado de envio antigo. Os
limites numéricos de overflow da barra lateral foram mantidos, e as antigas asserções de CSS e
de grafia do código-fonte continuam removidas; o upstream moveu uma delas, sem alterações, para
`sidePaneTabStripAddMenu.test.ts`, e essa cópia migrada e sua exclusão de export inválida foram
removidas juntas. A modificação do upstream em `pluginStoreManageEntry.test.ts` continua ajustando
apenas a localização no código-fonte e as verificações de classe fixas, e segue a remoção de
arquivo inteiro já concluída, sem reintroduzir asserções de baixo valor só porque a expressão de
localização foi corrigida. Os testes de navegador mantêm as regressões do upstream de zoom do
desktop, de reconexão após desconexão por inatividade do CDP e de sincronização de viewport,
continuando a remover as antigas asserções duplicadas de repasse de parâmetros de construção e de
contagem inicial de memória.

O inventário, as estatísticas e os hashes da razão da terceira rodada são mantidos como o
snapshot de revisão de `7c90e96411` e não representam o inventário dos arquivos novos após a
fusão.

A validação da fusão reproduziu ao mesmo tempo a falha de estabilidade de referência já
existente no staging: `ProjectTaskRows` cria uma nova referência de JSX para
`TaskList.organizationActions` a cada render, invalidando a comparação de memo do
subcomponente. Após confirmação, foi usado um `useMemo` que depende de `task` para manter a
referência estável; quando o objeto da tarefa muda, o menu continua sendo atualizado, e o próprio
menu continua assinando o diretório e o contexto de internacionalização. O caso de falha
original passou depois da correção, sem afrouxar as asserções.

A validação final da fusão partiu de `7c90e96411`: o affected da raiz selecionou 702 de 2483
specs, com 702 arquivos e 7534 casos passando e 1 pulado; os quatro arquivos direcionados do CLI
passaram com 36 casos no total. Typecheck da raiz e do CLI, lint, checagem de arquitetura, checagem
da estrutura do banco e checagem de formatação dos arquivos em conflito passaram. As quatro
falhas de carregamento de arquivo causadas pela falta dos artefatos de instalação do Electron na
nova árvore de trabalho passaram na repetição depois de completar os artefatos; não foram
executados os testes unitários completos, o E2E do desktop nem a aceitação de exportação open
source.

Na fusão subsequente do staging `840d040f57`, foram mantidas a migração da entrada
`@zcode/shared/test-ids`, a instalação concorrente de plugins, a prontidão da conexão MCP, a
liberação do lease de sessão e as novas regressões de autorização por Esc no desktop e no
celular. As antigas classes, as constantes de dicionário e as asserções duplicadas de montagem
nos conflitos continuam removidas; `pluginStoreManageEntry.test.ts` apenas atualiza a fixture
vazia e segue com a remoção de arquivo inteiro.

Nesta rodada, o typecheck da raiz e do CLI, o lint, a checagem de arquitetura e a checagem de
formatação dos arquivos em conflito passaram; a verificação direcionada da UI passou com 131
casos e a do CLI com 79 casos. O affected da raiz selecionou 1360 de 2484 specs e a execução foi
interrompida conforme solicitado, sem a conclusão da rodada completa de validação; a entrega
pulou o push hook, e uma execução interrompida não é registrada como aprovada.







