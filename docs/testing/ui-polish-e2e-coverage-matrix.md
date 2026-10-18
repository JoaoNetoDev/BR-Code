# Matriz de Cobertura E2E de UI Polish

## Todo153: exibição do nível de raciocínio e ordem de configuração

Com base na [spec do controle](../ui/chat-thought-level-control.md) e no [Todo153](../working-memory/provider-refactor/steps/todo-153-thought-level-display-mapping.md), as semânticas a seguir estão confirmadas. O candidato de navegador está em `packages/ui/test/browser/manual-review/pending/thought-level-display.test.mjs`, e a fixture usa o controle compartilhado real, o SubagentReasoningField e o hook de atalhos da toolbar, isolando o serviço de settings e sem enviar requisições ao modelo.

| Caso   | Pré-condições e ação                                                                                                                    | Asserções                                                                                          | Status                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| TL-01 | A mesma configuração inclui desligado, minimal/low, max/ultra, extra-high/extra_high, default; desktop 1200 / celular touch 390, zh/en e temas claro/escuro; abrir o menu e selecionar | O texto segue a spec; aliases com o mesmo nome não são deduplicados; default preserva o nome de origem; o menu respeita a ordem da configuração e envia o value original; sem overflow dentro do viewport | accepted; oito grupos de navegador passaram, aguardando promoção manual |
| TL-02 | Nos mesmos tamanhos e temas, operar em sequência o menu de seleção, o clique de ciclo, Ctrl+T e o campo de Subagent | Ordem de configuração compartilhada e retorno ao fim do ciclo; o atalho não abre o menu; Subagent exibe o mesmo texto e envia o valor original | accepted; oito grupos de navegador passaram, aguardando promoção manual |

O item de desligamento no meio da lista, o nome `off` para valores desconhecidos, valores vazios/inválidos e o modo somente leitura de nível único são cobertos por testes unitários de componente direcionados. As capturas de navegador servem para inspeção visual; este grupo não representa a verificação completa de Electron, reconexão de controle remoto do celular ou da cadeia de requisições ao provider, e não é promovido automaticamente para o E2E formal do desktop.

## Verificação de página inteira atual (2026-09-12)

Esta seção substitui a descrição antiga e já desativada da posição do rodapé do AddProviderCard / da chave inteligente. MP-UI-01 verifica os quatro agrupamentos de templates Zhipu, o retorno à seleção original, os dois membros padrão do DeepSeek, a criação atômica e o acesso direto aos detalhes; MP-UI-04 remove pelo menu “mais” do Provider e confirma a remoção simultânea na navegação e em Personal; MP-UI-06 verifica, pelo layout atual do título de ajuda, da chave inteligente na linha de identidade e do botão de restauração, a edição real, o cancelamento, o salvamento, a ordenação dos níveis e as duas entradas de marcador visual.

Pro final `provider-20260912-pro-settings-polish4`: o WDIO reportou 9 passing / 1 skipped, com UP-00 retornando cedo no macOS, o que **não representa aprovação no Windows**; as 8 executadas de fato passaram e o caso SSH foi pulado por falta de ambiente. A falha inicial não é base para regressão de produto: o teste não cobria o menu / o título de ajuda / o diretório final do DeepSeek; além disso, UP-01 não fechou o menu, fazendo com que a rolagem posterior fosse interceptada pela barreira de ponteiro do modal. Os testes foram corrigidos, mantendo as asserções completas de rolagem, e o produto não foi alterado. MP-UI-01 também passou quando executado isoladamente.

Logs `/tmp/provider-20260912-pro-settings-polish{,2,3,4}.log` e `/tmp/provider-20260912-pro-create-isolated.log`. As capturas de edição de 390px em zh/en, claro/escuro foram inspecionadas: título, agrupamentos e botões de ação estão dentro do viewport, o Map continua em múltiplas linhas e a área de corpo tem rolagem independente; não se trata de um shared-host real em celular.

## Todo98: tipografia da estrutura Map na origem

F98-03 (accepted, pending não promovido): reutiliza `settings/manual-review/pending/provider-model-smart-config.test.ts`, lendo o Map Built-in real de múltiplas linhas na adição/edição, com capturas de desktop e 390px; digitação real de espaços consecutivos não dispara a reordenação por background, cancelar não escreve nada e, após o salvamento normal, o valor é lido de volta idêntico. Pro `desktop-e2e-20260909-125010-082`: SC90-01 / F98-03 **2/2 passaram**. F98-01 varre todos os Map reais do BuiltIn em busca de quebras de estrutura e ternários simples; F98-02 passou na comparação de 65 ASTs e 505 grupos de avaliação, sem formatter em runtime. 390px é apenas simulação de layout e não se apresenta como verificação real de controle remoto do celular. O isolamento de teclado adicional tem 7 categorias de contraexemplos de controles/Portal e um caso positivo de acionamento por teclado na linha do modelo.

## Resumo da Funcionalidade

Regressão candidata do Todo103: a comparação de cor de Hover/foco por teclado do MP-UI-06 precisa aguardar a conclusão da animação CSS existente do controle sob teste antes de ler o estilo computado final. Não é permitido tomar quadros de transição como estilo recomendado, nem fazer o teste passar deletando a animação, relaxando as asserções de cor ou estendendo um sleep fixo. Na execução Pro original de 2026-09-09 capturou-se Hover alpha=0.047 e alpha final de foco=0.05, o que é uma corrida de amostragem do teste; o estilo do produto e a decisão original permanecem inalterados.

| Campo               | Valor                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Alteração           | Ordem de preferência do menu de perfil; estados vazio e de adicionar provider do model-provider |
| Camada de alteração | Apresentação + validação de conexão de provider                                                |
| Modo de operação    | implementation-handoff                                                                         |
| Superfícies visíveis ao usuário | Menu de perfil da sidebar do desktop; settings de model-provider no desktop/web |
| Specs existentes    | `docs/desktop/sidebar-zoom-menu.md`, `docs/model-provider-family-merge.md`                     |
| Fora de escopo      | Tráfego de requisições ao modelo, recuperação de replay no celular, runtime de workspace remoto, APIs de cobrança de provider |

## Resumo de Impacto

### Matriz de Superfície de UI

| Cenário                                            | Entrada de UI                                        | Implementação compartilhada          | Owner / origem do estado                    | Validação / gating                                                            | Destino do commit                                     | Limite de modo                                      | Invariante de isolamento                                                |
| -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Inspecionar ordem de preferência                    | Menu de avatar da sidebar                            | `WorkspaceSidebarFooter`               | Props React + estado de zoom da plataforma desktop | Zoom é exclusivo do desktop                                             | Callbacks de tema/locale existentes e comandos de desktop | A ordem é compartilhada; o zoom continua exclusivo do desktop               | Abrir o menu não pode alterar as preferências                                |
| Inspecionar a orientação de adicionar provider     | Settings > Model provider > Add provider             | `AddProviderCard`                      | Draft local de add-provider                  | Ação desabilitada até existirem campos obrigatórios e um modelo            | Ação existente de criação de serviço do model-provider | Layout responsivo desktop/web                            | A dica não pode criar uma segunda regra de validação                         |
| Excluir o último modelo editável de um provider     | Settings > Model provider > Custom provider          | `ProviderModelsSection`                | Registro de model-provider                   | Lista vazia é permitida para um provider existente                         | Ação existente de atualização de provider               | UI compartilhada desktop/web; sem semântica de replay envolvida           | Remover modelos esvazia candidatos de chat preservando o editor do provider |
| Resolver um Coding Plan sem modelos                | Resolver de conexão de família de provider           | `resolveCodingPlanEntitlementState`    | Registro de model-provider                   | A conexão exige credencial + endpoint, e não uma lista de modelos não vazia | Sem mutação de UI                                       | Resolver puro compartilhado                             | Modelos vazios não podem desconectar o entitlement                         |

### Relações Rankeadas

| Rank           | Relação                                                          | Motivo                                                                          | Evidência                                    |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| must-inspect   | Settings de provider -> serviço de model-provider               | Excluir o último modelo persiste pelo caminho existente de atualização de provider | `ModelProviderSection`, `ProviderModelsSection` |
| must-inspect   | Visibilidade do Coding Plan -> resolver de conexão de provider    | A regressão veio de tratar `models.length` como requisito de conexão             | `providerFamilyConnectionVisibility.ts`     |
| should-inspect | Rodapé do add-provider -> validação do draft de add-provider    | A orientação e a ação desabilitada precisam concordar                            | `AddProviderCard.tsx`                       |
| conditional    | Menu de perfil -> comandos de zoom do desktop                   | O zoom aparece apenas no modo Electron desktop                                   | `WorkspaceSidebarFooter.tsx`                |
| invariant-only | Settings de provider -> picker de modelo do chat                | Zero modelos significa nenhum modelo selecionável, sem mudar a identidade do plano | `docs/model-provider-family-merge.md`     |

### Evidência do Codegraph

O repositório declara `surface.provider-settings -> service.model-provider` como uma aresta
`must-inspect` no grafo de funcionalidades. Uma ferramenta de codegraph ao vivo não está disponível neste
checkout, portanto a verificação de profundidade 2 usa imports/callers diretos e helpers de E2E
existentes. O menu de perfil da sidebar é um candidato a drift do grafo porque sua superfície de
preferências ainda não está declarada no grafo de funcionalidades curado; esta tarefa de teste não altera
seu contrato de estado ou de persistência.

## Decisões de Limite

| Decisão                              | Status   | Incluído                                                                                        | Podado / motivo                                                                                                                                                 |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UP-01 ordem do menu de perfil       | accepted | Ordem visível de nível superior no modo desktop                                                 | Mudanças de valor de tema e locale: comportamento existente, inalterado por este branch                                                                         |
| MP-UI-01 rodapé do add-provider     | accepted | Divisor, dica informativa, ordem esquerda-direita no DOM/visual, ação desabilitada                 | Requisição/envio ao provider: já coberto por P0-02                                                                                                              |
| MP-UI-02 provider editável vazio    | accepted | Excluir o último modelo de provider custom; hint vazio e Add Model continuam visíveis              | Modelos de Coding Plan são sincronizados pelo servidor e somente leitura, então a conexão sem modelos continua como cobertura de unidade do resolver; variantes Team/Start/Z.ai têm cobertura de unidade pareada |
| Variantes de locale                 | pruned   | Um locale de runtime mais asserções unitárias exatas de locale zh/en                            | O layout usa o mesmo message id e o mesmo contrato flex responsivo                                                                                            |
| Variantes de tema                   | pruned   | Classes semânticas afirmadas por teste unitário                                                  | Nenhum branch específico de tema nem cor bruta foi adicionado                                                                                                   |
| Runtime mobile/remoto               | pruned   | Contrato de classes responsivas continua coberto por teste unitário                               | Nenhuma mudança de processo, protocolo, replay, owner ou identidade de workspace                                                                               |

## Casos Aceitos

2026-09-08 Todo93 C93-01～12 (implementado/verificado): a perda de identidade do plano apenas avisa uma vez, e só troca ao clicar no alvo específico; cobre refresh repetido, troca de identidade, baseline de inicialização, unknown/pending, corrida do botão antigo e falha de escrita condicional. A expectativa de “trocar automaticamente ao atualizar” do antigo Todo88 R06 / SPMC-08 foi substituída; aprovação histórico não representa aprovação do novo contrato. A cobertura dessa cadeia foi mantida e complementada com clique real e asserções de não-escrever-antes-do-clique / ler-do-disco-depois-do-clique; Pro desktop-e2e-20260908-101239-586 4/4 passou. O cenário completo e a entrega do E2E de isolamento estão em [Todo93](../working-memory/provider-refactor/steps/todo-93-account-plan-loss-manual-switch.md).

2026-09-08 decisão final: revogar os casos de restauração de agrupamento G92 do Todo92 e o caso experimental `provider-model-group-reset.test.ts`. O plano formal passa a ser Todo92 F92-01～08: borda de override pessoal expressa item a item, nível como bloco e Mapping independente, mesmo background em Hover/foco, MFJS sem checkbox prévio e convergência do título do contêiner; validado conjuntamente com Todo90 M90-01～08 para ativar/desativar “configuração inteligente”, todos os obrigatórios, sem correspondência por nome, cancelar e salvar. Implementado conforme o contrato final e aprovado na validação conjunta; o preview antigo do Air não vale como evidência; não se exibe “Personalizado · Restaurar recomendado”, nem se adiciona botão de agrupamento ou restauração global.

2026-09-08 Complemento ao Todo 89 W89-05/W89-08 (accepted): quando o modelo pessoal na configuração isolada está sem contextWindow, a página de settings ainda pode abrir a edição, salvar a correção, ativar/desativar e excluir; a adição duplicada é rejeitada pela entrada de escrita real, e após a falha o modal e a entrada são preservados, sem membros duplicados. A proteção contra remoção de membros herdados é coberta por casos de DOM/serviço. Novo caso pending `settings/manual-review/pending/provider-settings-write-recovery.test.ts`, que não é promovido a gate formal antes da revisão manual. A origem da configuração é o snapshot de parsing da configuração, e não apenas o Registry executável; um modelo não corrigido não pode aparecer nas seleções executáveis. Este item segue o Todo89 e a spec atual de Provider, sem herdar as descrições antigas de Service/modelo de conta somente leitura desta página. O registro das execuções reais está na tabela de aceitação do Todo89.

2026-09-07 Correções ao Todo 88 / R08, R13: o modal de edição de modelo mantém explicitamente dois grupos sempre visíveis, com “Configurações de raciocínio” contendo níveis e Mapping, e “Configurações avançadas” contendo MFJS; não é a antiga seção avançada colapsável. O interruptor de seguir o recomendado fica na linha de ações salvar/cancelar e, em telas pequenas, usa o mesmo componente de ações do formulário com quebra de linha. Complemento ao MP-UI-06: após desligar seguir o recomendado e cancelar, reabrir continua seguindo; após desligar e salvar, reabrir continua fixo e preserva a edição original; após voltar de fixo para seguir o recomendado e editar o Mapping, salvar e reabrir preserva o novo valor. A verificação cobre a persistência real, e não apenas o draft ou o CSS. Segue cobrindo model IDs longos com prefixo/sufixo, zh/en e temas claro/escuro, layout de edição em 390px; e, após ativar a capacidade de imagem e salvar, tanto a linha de modelo nos settings quanto o menu de seleção comum exibem o marcador visual. Nova verificação aguardando execução Pro, sem herdar a evidência antiga abaixo como aprovação.

| Caso     | Setup                                    | Ação                  | Asserções                                                                                           | Evidência                     | Status    |
| -------- | ---------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------- | --------- |
| UP-01    | Workspace do desktop pronto              | Abrir o menu do avatar | Language, theme, zoom aparecem na ordem de nível superior commitada                               | Electron DOM + unit          | promoted  |
| MP-UI-01 | Settings de provider padrão              | Abrir Add provider     | Quatro templates Zhipu agrupados; criação por template/custom abre os detalhes persistidos; a rolagem da página externa funciona | Electron DOM/geometry + unit | promoted  |
| MP-UI-02 | Custom provider começa com um modelo     | Excluir o modelo final | Hint tracejado vazio e ação Add Model continuam visíveis                                             | Arquivos seed + Electron DOM  | promoted  |

## Meta de Cobertura

- Cada branch alterado em `providerFamilyConnectionVisibility.ts` é coberto por testes unitários.
- Cada branch de renderização e contrato de classe adicionado em `AddProviderCard.tsx` e
  `ProviderCardSections.tsx` é coberto por testes unitários e por um caminho real no Electron.
- A ordem da sidebar é coberta por uma asserção de ordem no DOM do Electron; o comportamento dos callbacks
  e dos comandos de zoom do desktop continua coberto pelos testes existentes.
- A cobertura V8 direcionada é medida para os quatro arquivos de código alterados. `100%` é a meta para
  linhas e branches alterados; código de framework/bootstrap inalcançável é reportado, não escondido.

## Entrega do E2E

- Spec formal: `packages/desktop/test/e2e/settings/settings-ui-polish.test.ts`
- Fixture de provider: nenhuma; o caso cria os arquivos locais de provider/settings e não faz nenhuma requisição ao modelo.
- Temporização: esperas comuns de UI (equivalente a `fast-text`), sem temporização de stream.
- Preset Docker: suíte desktop settings/default após revisão manual e promoção.
- Revisão humana confirmada em 2026-08-19; a promoção do domínio de settings foi concluída sem fixtures de conversa.

## Evidência de Runtime

- Execução formal do Electron após a promoção: `desktop-e2e-20260819044246639-p7031-0eaf856fbfb1eeae`
- Resultado formal: 3/3 passaram sem `ZCODE_E2E_MANUAL_REVIEW`.
- Artefato formal: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819044246639-p7031-0eaf856fbfb1eeae/summary.md`.
- Execução Electron de revisão manual: `desktop-e2e-20260819042607776-p64629-52e741b6f1da02f5`
- Resultado: 3/3 passaram (UP-01, MP-UI-01, MP-UI-02).
- Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819042607776-p64629-52e741b6f1da02f5/summary.md`.
- Nenhuma requisição ao provider é feita, portanto não é necessária fixture de replay nem classe de temporização.
- A execução V8 direcionada cobriu 100% das linhas executáveis adicionadas por este branch nos quatro arquivos alterados;
  percentuais de arquivo inteiro não são intencionalmente apresentados como 100% porque esses componentes contêm caminhos legados sem relação.

## Evidência Final de Execução do Todo90 / Todo92 (2026-09-08)

Pro `desktop-e2e-20260908-110541-867`: 3 specs / 9 casos passaram; o novo caso pending SC90-01 cobre adicionar o modo fixo, rejeitar entrada vazia, cancelar sem escrever, reabrir a edição e preservar o estado desabilitado, enquanto o MP-UI-06 original continua verificando edição, ordenação de níveis, Mapping, consumo em Model Selection, estendendo para 390px com dois temas/zh-en e asserções de Hover/foco e de título sem corte. Os demais UP-01, MP-UI-01～05 e a regressão da entrada de correção do Todo89 W89-05/08 passaram.

M90-01～08 e F92-01～08 foram cobertos conjuntamente por 317 testes unitários relacionados e pela execução代表ativa de Electron acima; a poda completa de casos e os lados ainda não verificados estão em Todo90 §8 / Todo92 §7. Ciclo de vida da origem, identidade e injeção de falha usam Promises controladas / escrita em Runtime real nos testes, sem copiar todas as combinações de marca de conta. Os novos casos mantêm `settings/manual-review/pending/provider-model-smart-config.test.ts`, sem promoção automática. As capturas Pro em `packages/desktop/.e2e-artifacts/todo90-92/model-editor-{dark,light}-390.png` foram inspecionadas; não são o preview histórico do Air nem se passam por verificação real de controle remoto do celular.

## Migração de raio de menu (2026-09-04)

Abaixo estão a spec de origem do staging fixo e a evidência de execuções históricas; o candidato completo do Todo103 ainda precisa de regressão compartilhada e não herda as aprovações históricas como aprovação desta rodada.

- Spec: [DESIGN.md Radius](../../DESIGN.md#radius).
- Escopo: DropdownMenu, ContextMenu e painéis expandidos de Select usam `lg`; itens (incluindo itens de checkbox/radio e gatilhos de submenu) usam `md`; shells de submenu reiniciam em `lg`. Os gatilhos de Select não mudam.
- Aceito: UP-01 também lê os raios computados do menu de perfil aberto (shell de 8px, itens de 6px no tamanho raiz padrão). Testes de contrato do componente compartilhado cobrem as três implementações e as variantes de submenu.
- Desktop e Web do celular compartilham essas primitivas e utilitários de raio independentes de tema. Esta mudança não adiciona comportamento de processo, clientMode, deliveryKind, stream ou recuperação.
- Execuções visuais separadas de celular e entre sistemas operacionais permanecem fora desta verificação direcionada do desktop.

### Verificação da migração

- Red: os novos testes de contrato de raio compartilhado e de override de negócio falharam contra os estilos antigos.
- Green: 22 testes unitários direcionados passaram; `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e` e `pnpm lint` passaram (41 avisos de lint já existentes, sem erros).
- Electron no macOS: `settings-ui-polish.test.ts`, 3/3 passaram, incluindo os raios computados do shell/opções do menu. Execução: `desktop-e2e-20260904075731227-p32863-d53541f289639947`.
- Os overrides de caption do Windows e de menu de automação/off-peak foram removidos para que essas superfícies herdem os raios compartilhados. ContextMenu, Select, itens de checkbox/radio e submenus têm cobertura de contrato; seus caminhos individuais de runtime e as verificações visuais em mobile/Windows/Linux não foram executados nesta mudança.

## Contexto do framework raiz no macOS (2026-09-04)

UP-01 adicionou no macOS uma asserção de background de cálculo transparente do `DesktopWindowFrame`. Este é o registro histórico da verificação da regra de background raiz transparente da época; a regra atual de background raiz segue [DESIGN.md](../../DESIGN.md#color-usage-rules), e o resultado histórico aprovado desta seção não é tratado como comportamento atual. Testes unitários cobrem os branches de background de macOS, Windows, Linux e Web. Apenas o estilo do background raiz foi alterado, não os backgrounds de subáreas nem o comportamento de controle remoto.

- Verificação: antes da modificação o teste unitário no macOS falhava; depois da modificação os testes unitários dos quatro branches de plataforma passaram; o typecheck de todo o repositório, o typecheck de E2E e o lint passaram (41 avisos já existentes, 0 erros).
- Electron no macOS: 3/3 passaram, com o background calculado do framework raiz igual a `rgba(0, 0, 0, 0)`; ID da execução: `desktop-e2e-20260904082702490-p81892-0a8af92f6cb52575`.
- Os branches de background de Windows/Linux/Web têm testes unitários, mas não houve verificação visual independente por plataforma; a página de settings e a página de erro reutilizam o mesmo componente e não foram validadas com capturas página a página.