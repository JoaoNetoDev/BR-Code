# Mapa de Capacidades de Produto: Incubação de Office e Computer Use

## Feature Summary

| Campo              | Valor                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Intenção do dev    | Complementar no mapa de capacidades a pré-visualização/edição da suíte Office e o Computer Use, distinguindo a base atual das capacidades futuras de produto |
| Capacidade         | Office Suite & Computer Use Incubation                                                                                                                                                    |
| Camada de mudança  | presentation                                                                                                                                                                              |
| Modo de operação   | planning                                                                                                                                                                                  |
| Seeds principais   | `packages/ui/src/PreviewPane.tsx`、`packages/ui/src/components/ui/pdf-viewer.tsx`、`apps/zcode-cli/packages/document-skills-plugin`、`packages/services/src/cua-permission-broker` |
| Fora de escopo     | Implementar editores nativos DOCX/XLSX/PPTX, alterar o modelo de permissões do CUA ou habilitar o CUA por padrão                                                                          |

## Fato Atual Versus Roadmap

| Domínio         | Já existe hoje (Current)                                                                                                                                                                                                                                                                                                          | Incubando/planejado (Incubating / Planned)                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Preview Office  | Pré-visualização de arquivos do workspace, pré-visualização de PDF com paginação/zoom, preview somente-leitura de DOCX/DOC e XLSX                                                                                                                                         | Preview de PPTX em alta fidelidade, miniaturas e navegação entre páginas; o editor Office nativo ainda está planejado |
| Edição Office   | O Agent pode criar, editar e validar artefatos do workspace via Skills oficiais de DOCX/PDF/PPTX/XLSX                                                                                                                                                                | Edição nativa de documentos/planilhas/apresentações, comentários, revisões, salvamento incremental e exportação |
| Computer Use    | CUA Helper habilitado por padrão em macOS/Windows local, onboarding de permissões, leitura de tela, input nativo; o modelo chama via SDK `agent.computerUse` do `node_repl` de shared-host, e o estado de runtime/Helper do CUA permanece no shared host; o session coordinator de macOS PiP é mantido pelo producer, e o ZCode apenas publica os facts de sessão e turno em foreground; no Windows, a top hint de operação via sideband de runtime `computer-use/operation-event` é exibida durante o turno CUA, com fallback de 30 segundos | Pausa/takeover, confirmação passo a passo e capacidades da plataforma Linux |
| Multiplataforma/Remoto | O Host local do Desktop é o sujeito de permissões do CUA; o serviço de arquivos do workspace suporta local/remote                                                                                                                                                                | Web/Mobile apenas consomem a projeção ou montam um Desktop Host existente; Computer Use remoto exige uma solução independente |

Os nós "planejado" no mapa de capacidades representam fronteiras de manutenção e roadmap, e não interfaces de produto já existentes e invocáveis. O LOC em nível de grupo conta apenas o código já entregue, sem pré-preencher volume de código para capacidades planejadas.

## UI Surface Matrix

| Cenário do usuário       | Entrada de UI                                              | Implementação compartilhada                                                | Owner de display/draft                                      | Fonte default/inherit             | Validação/gating                                              | Ação de commit               | Autoridade/persistência                     | Fronteira de modo                                        | Deve permanecer isolado de                       |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- | ---------------------------- | ------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| Visualizar arquivos Office/PDF | Workspace File Tree → Preview Pane                       | Preview Pane, PDF Viewer, futuro renderer Office                        | Estado de preview do renderer                               | Metadata de arquivo do workspace   | MIME/extensão, tamanho, capacidade de conversão                 | Abrir/folhear/zoom somente leitura | Host file/document service; workspace file | UI Desktop/Web/Mobile reutilizável; fontes de serviço local/remote diferem | Geração de documentos pelo Agent e commit de edição nativa |
| Editar arquivos Office    | Futuro Office Editor                                       | Futuro shell de edição de documento/planilha/apresentação               | Draft de edição do renderer                                 | Versão atual do arquivo do workspace | Tipo de arquivo, permissão de escrita, conflito de versão     | save/export/comment/revision | Host Office Document Service em planejamento    | Deve suportar workspaceIdentity; IO de caminho usa workspacePath | Execução direta no workspace pelas Document Skills da CLI |
| Agent cria ou edita documento | Conversation + DOCX/PDF/PPTX/XLSX Skill                    | Runtime de Skill da CLI, ferramentas embutidas e scripts                | Turno do Agent                                              | Plugin oficial document-skills     | Skill habilitada, dependências disponíveis, permissão da tool  | Gravar/modificar artefatos do workspace | Execução de tool da ZCode CLI + workspace files | Executa no workspace da CLI em local/SSH/WSL/Docker | Estado de draft do Office Editor nativo              |
| Usar Computer Use       | Resultado da tool genérica `node_repl`, onboarding de permissão do CUA; top hint de operação no Windows | Runtime node_repl de shared-host, CuaControlPort, Helper, projeção nativa do Desktop Main | Ciclo de vida do runtime CLI; Host CUA turn tracker; projeção genérica node_repl do Renderer | Config MCP + kill switch explícito | macOS/Windows, Host local, Helper/broker token confiável e permissões de plataforma | observe/click/type/open app | CUA Helper local do Desktop + runtime CUA de shared-host | desktop-local em macOS/Windows; mobile via attachment de shared-host | Helper criado em remote host, herança de broker token por outros MCP/subprocessos |
| Pausar ou assumir manualmente | Futuro Computer Use control surface                        | Futuro step projection / takeover protocol                              | Intenção de controle do Renderer                            | Operação CUA ativa                 | Fase da operação, permissão, ações de alto risco               | pause/confirm/take over/resume | Ainda indefinido; o mapa mantém apenas o nó planejado | A semântica de controle entre Desktop e mobile precisa de spec própria | Semântica comum de stop/permission de conversation |

## Shared And Divergent Behavior

| Aspecto                 | Compartilhado entre superfícies                        | Deliberadamente diferente                                                    | Por que importa para esta mudança                        |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| UI/componente          | Reutiliza Preview Pane, Conversation Timeline e o framework de diálogo de permissão | O editor Office e o painel de controle do Computer Use têm draft/estado de controle próprios | Não se pode descrever "ver o tool card" como a UX completa de Computer Use |
| Origem de opções      | Tipo de arquivo e contribuições de Skill/MCP vêm dos registries existentes | Capacidades de formato Office e capacidades de plataforma CUA são julgadas separadamente | Uma capacidade disponível não implica a outra |
| Efeito do commit      | Ambas acabaram afetando o workspace ou o estado do desktop visível ao usuário | O salvamento do Office escreve arquivo; ações CUA alteram aplicações externas | Os modelos de permissão, undo e recuperação são totalmente diferentes |
| Persistência/recuperação | A Conversation apenas projeta o ciclo de vida das tools | Draft/version do Editor e controle CUA ao vivo não compartilham semântica de recuperação de sessão | Os protocolos de recuperação devem ser definidos separadamente antes da implementação futura |

## Feature Relationships

| Rank           | From                                    | Aresta semântica                      | To                                            | Condição                                                                                         | Por que inspecionar                                                | Evidência                                                                          |
| -------------- | --------------------------------------- | ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| must-inspect   | Experiência de preview/edição de Office | lê/escreve através de                | Host Office Document Service                  | Quando a UI Office nativa for entregue                                                          | O Renderer não possui diretamente o file IO de Node/LibreOffice    | Restrições de camada de `IPlatformService` / Host                                 |
| must-inspect   | Document Skills                         | produz artefatos de workspace para   | Office Preview                                | Skills atuais de DOCX/PDF/PPTX/XLSX em execução                                                 | Produção pelo Agent e preview na UI são dois owners distintos      | `docs/document-skills-plugin.md`                                                  |
| must-inspect   | Computer Use SDK via node_repl          | executa através de                    | shared-host CuaControlPort → Helper/Broker    | desktop-local em macOS/Windows                                                                   | Ações de alto privilégio devem passar pelo Helper assinado e falhar de forma fechada | `docs/cua-permission-broker/zcode-cua-permission-broker.md`                       |
| should-inspect | Projeção de ciclo de vida do Computer Use | renderiza em                         | Conversation Timeline + top indicator do Windows | A Conversation usa o ciclo de vida genérico de tool; a top hint do Windows consome `computer-use/operation-event` de forma independente | A top hint só expressa que o Agent está operando, não equivale a uma tela ao vivo nem a uma bancada assumível | `packages/ui/src/v4`、`packages/desktop/src/main/windowsCuaOperationIndicator.ts` |
| invariant-only | Remote/Mobile Host                      | não pode criar                       | Desktop CUA Helper                            | SSH/WSL/Docker/mobile remoto                                                                    | O sujeito de autorização do CUA é o Helper desktop local            | CUA broker fact spec                                                              |
| invariant-only | Credencial do CUA broker                | deve permanecer isolada de           | outros MCP/hooks/Bash                        | Todas as execuções de CUA                                                                       | Prevenir confused-deputy                                         | CUA broker fact spec                                                              |

## State Owners And Commit Sinks

| Estado/fato                        | Owner de draft/display            | Owner autoritativo                                     | Comando/serviço de commit                                           | Persistência/cache                     | Evidência                       |
| ---------------------------------- | --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- | ------------------------------- |
| Página/zoom do preview              | Renderer                          | Componente de preview do Renderer                     | ação de UI somente leitura                                          | efêmero                               | PDF Viewer                      |
| Bytes/versão do arquivo Office      | Draft do Renderer (planejado)    | Host workspace document service (planejado)          | save/export                                                          | workspace file                        | Restrições de camada            |
| Edição de documento pelo Agent     | Projeção da Conversation          | Runtime de Tool/Skill da CLI                          | Read/Write/Edit/Bash/Skill                                           | workspace file + evento de sessão     | plugin document-skills          |
| Sujeito de permissão do CUA         | Diálogo de permissão              | Computer Use Helper assinado                          | request_access / configurações do sistema                           | macOS TCC                             | Documentos do broker do CUA     |
| Observação/ação do CUA             | Projeção genérica do node_repl    | CuaControlPort + broker do Helper                     | `agent.computerUse.<tool>` via `mcp__node_repl__js`                 | tool result/evento de sessão          | Implementação do broker do CUA   |
| Indicador de operação CUA no Windows | Projeção nativa do Desktop Main   | Ciclo de vida do runtime CLI + turn tracker do Host local | `computer-use/operation-event` → `cua-operation-state` Host→Main | efêmero; não entra em snapshot/replayable | `windowsCuaOperationIndicator.ts` |
| Superfície de sessão PiP do CUA no macOS | apresentação nativa de `@zcode/zcode-cua` | Desktop Main focus router + publisher de facts de turno do Host | cliente de apresentação tipado `pip-session` | Helper process-local; não entra em snapshot/replayable | producer `PipSessionCoordinator` |
| Takeover humano                     | Futuro UI dedicado                | Indefinido                                             | Indefinido                                                           | Indefinido                             | apenas roadmap                  |

## State And Delivery Boundary

```text
Office
Renderer Office Preview / Editor
          |
          | read / convert / save（Editor backend 规划）
          v
Host File Service + Office Document Service
          |
          v
workspacePath files
          ^
          | DOCX/PDF Skill + CLI tools（当前）
ZCode CLI Document Skills

Computer Use（当前 macOS/Windows desktop-local beta）
Renderer Conversation / Permission UI
          ^
          | ProductProjection / tool lifecycle
ZCode CLI MCP Runtime -- node_repl js / CUA SDK call -->
          |
          | shared-host bridge token + request context
          v
Local Host CUA Broker --> signed ZCode Computer Use.app --> AX / Screen / Input

CLI runtime lifecycle
        -> computer-use/operation-event sideband
        -> desktop-local Host turn tracker
        -> strict Host→Main cua-operation-state
        -> capture-excluded Windows BrowserWindow

sideband 在 legacy delivery 过滤前发送；它不是 `session/event`，不要求
`deliveryKind`/subscription 投影，也不进入 snapshot、replayable 恢复、relay 或
Renderer 状态。

Mobile/Web -- shared-host attachment --> existing Local Host
Remote Host --------------------------X--> create/launch local Computer Use Helper
```

## Must-Preserve Invariants

| Invariante                                        | Superfícies/modos                  | Prova necessária                                                          | Evidência                    |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- | ---------------------------- |
| Nós planejados não se passam por funcionalidade entregue | mapa de capacidades               | O scope do nó declara "atual/planejado", e o LOC do grupo conta só o código atual | map data + detail panel     |
| O Renderer não possui diretamente o IO de plataforma Office | Desktop/Web/Mobile                | Futura resolução/conversão/salvamento passa por Host service injetável    | architecture spec            |
| Document Skills é isolado do draft do Editor nativo | Agent + UI                         | A Skill funciona de forma independente; cancelar no Editor não desfaz arquivo já commitado pelo Agent | document skill boundary     |
| CUA habilitado por padrão e com fail closed       | macOS/Windows Desktop              | Não executa `zcode-cua` em aberto quando desativado explicitamente ou quando broker/runtime confiável falha | CUA broker spec/tests        |
| Remote/Mobile não inicia outro CUA Helper         | remote/mobile                      | Só é permitido reutilizar o Host local via attachment de shared-host        | web remote + CUA spec        |
| A top hint do Windows não entra em screenshot nem em replayable | Windows Desktop/Mobile attachment  | `setContentProtection(true)`; o estado só trafega como mensagem efêmera Host→Main | operation indicator spec/tests |

## Codegraph Evidence

O worktree atual do mapa de capacidades não estabeleceu um índice de codegraph, portanto desta vez usamos `rg`/listagem de arquivos precisos para conferir a implementação atual, sem afirmar um grafo de chamadas completo para código não indexado.

| Seed                             | Query                  | Direct callers / key path                                                                                        | Profundidade | Interpretação                                                       |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `PdfViewer` / Office Preview     | varredura de arquivo/símbolo | Preview Pane → conteúdo lazy de PDF/Office → file service                                                  | 2           | Já existem previews somente-leitura de PDF, DOCX/DOC e XLSX; PPTX/editor nativo ainda estão planejados |
| `document-skills-plugin`         | varredura de pacote/assets | seed do plugin oficial → descoberta de Skill → scripts/references                                        | 2           | Já existem capacidades de produção do Agent para DOCX/PDF/PPTX/XLSX, não um editor nativo |
| `createDefaultCuaProductHelper`  | varredura de chamada focada | local services → shared-host CUA control port → Helper Host → broker                                    | 2           | O CUA é habilitado por padrão, mas segue limitado a desktop-local e desligado por kill switch explícito |
| `WindowsCuaOperationIndicator`   | varredura de chamada focada | CLI runtime lifecycle → `computer-use/operation-event` → tracker do Host desktop-local → Host→Main → overlay nativo | 4           | No Windows a top hint somente-leitura é exibida com base na célula Computer Use, com fallback de 30 segundos; tela ao vivo e takeover ainda não implementados |

## Graph Drift Candidates

| Candidato              | Evidência no código vivo                       | Relação de grafo ausente/obsoleta                    | Seguimento proposto                                              |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| Produção de documentos | Plugin oficial DOCX/PDF já habilitado por padrão | O Extension Runtime só tem um nó genérico de Skills | Adicionar um nó dedicado a Document Skills                        |
| Fundação do Computer Use | Já há muita implementação em broker/Helper/AX/Input do CUA | O único nó atual "assistente de permissões do CUA" comprime demais | Dividir em nós de ciclo de vida do Helper, broker confiável, observação e execução de input |
| UX nativa do Office   | Hoje só há preview de PDF                       | O grafo não tem fronteira de roadmap                | Adicionar o grupo de incubação e declarar a UX nativa DOCX/XLSX/PPTX como planejada |

## Graph Delta

| Status    | Nó/aresta                                      | Razão semântica                                            | Evidência     | Ação         |
| --------- | ---------------------------------------------- | ---------------------------------------------------------- | ------------- | ------------ |
| confirmed | `capability.office-computer-use-incubation`    | O usuário pediu para complementar as capacidades futuras de Office e Computer Use | user decision | Atualizar o grafo |
| confirmed | Nós de roadmap de preview/edição de Office     | O PDF/Skills atual e a UX Office nativa futura precisam ficar separados | code + user   | Atualizar o grafo |
| confirmed | Nós de suporte de Computer Use no Host/CLI    | A implementação atual do CUA atravessa o broker do Host e o MCP da CLI | code/docs     | Atualizar o grafo |
| confirmed | Arestas de isolamento remote/mobile             | Hoje o Helper é somente desktop-local                     | CUA fact spec | Atualizar o grafo |

## Unresolved Questions

| Pergunta                                        | Respostas candidatas                       | Diferença de escopo                                      | Owner                       |
| ----------------------------------------------- | ------------------------------------------ | -------------------------------------------------------- | --------------------------- |
| Kernel de parsing/renderização do editor nativo Office | Web/WASM; conversão no Host; híbrido | Afeta a capacidade offline da Web, a latência remota e a consistência de arquivos | Future Office owner         |
| Protocolo de takeover manual do Computer Use    | lease de owner único; confirmação passo a passo; somente pausa antes do takeover | Afeta o controle multiplataforma, a recuperação e a auditoria | Future Computer Use owner   |
| Computer Use no Linux                           | backend nativo por plataforma; não suportado por enquanto | Afeta o modelo de permissões, o empacotamento e a matriz E2E | Platform owner              |

## Boundary Decisions

| Fronteira      | Decisão                                                                                                    | Inclui                                                                                        | Exclui / poda                                                  | Fonte                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| Atribuição no grafo | O Renderer ganha um novo grupo de experiências incubadas, e Host/CLI recebem nós de suporte nos grupos existentes | Entrada de produto, base de plataforma, runtime do Agent                                   | Criar uma quarta camada de execução de produto                  | user + architecture                          |
| Atual/futuro  | Scope marcado explicitamente, LOC contando só o atual                                                   | Preview de PDF, DOCX/DOC/XLSX, Skills de DOCX/PDF/PPTX/XLSX, CUA beta em macOS/Windows      | Escrever preview de PPTX ou editor nativo Office como concluído | user + code                                  |
| Plataforma CUA | O Helper macOS/Windows local é o sujeito de permissões de produto atual; o modelo chama via SDK do `node_repl` de shared-host; o Main do Windows projeta adicionalmente uma top hint disparada pela célula Computer Use e com corte de fallback de 30 segundos | Attachment de shared-host                                                                 | Criar Helper em Host remoto, gravar o estado da hint em replayable/snapshot | CUA fact spec + operation indicator spec |
| Office IO      | A fronteira de serviço futura pertence primeiro a Host Workbench Services                               | Arquivo local/remote, conversão, salvamento                                               | IO direto de Node/LibreOffice pelo Renderer                    | architecture                                 |

## Accepted Cases

| Case ID        | Setup                            | Ação           | Asserções                                                                                     | Camadas de evidência | Status E2E |
| -------------- | -------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- | ------------------- | ---------- |
| DOC-CUA-MAP-01 | Carregar o mapa de capacidades   | Buscar Office  | Encontrar o grupo de incubação independente e os nós de documento/planilha/apresentação/edição | data + DOM          | automated  |
| DOC-CUA-MAP-02 | Selecionar um nó de Office       | Ver relações de primeira ordem | Rastrear até o Host document service e as Document Skills da CLI                          | data + DOM          | automated  |
| DOC-CUA-MAP-03 | Buscar Computer Use              | Selecionar nó   | Rastrear a UX do Renderer, o CUA do Host e o MCP da CLI, com scope exibindo current/planned | data + DOM          | automated  |
| DOC-CUA-MAP-04 | Desktop/Mobile, tema claro/escuro | Ajustar à visão global | O novo grupo não oculta nada e não gera overflow horizontal da página                | screenshot          | manual     |

## Planning Handoff

| Item             | Destino                                         | Status   |
| ---------------- | ----------------------------------------------- | -------- |
| Atualização de spec | `docs/product-capability-map.md`              | complete |
| Catálogo de cases | Accepted Cases deste documento                 | complete |
| Matriz de cobertura | Accepted Cases deste documento               | complete |
| Backlog de decisões | Unresolved Questions deste documento           | complete |
| Handoff de E2E    | dev-docs data/layout tests + browser smoke     | ready    |