# Plano de Testes de Automação Remota R3 Após o Merge

Fronteira de exportação: `harness/remote/**` é a infraestrutura interna de deploy de testes remotos e não entra na árvore open source; os testes unitários que dependem diretamente dela — `r3RemoteMobileSite`, `r3RemoteProcess`, `r3RemoteProfiles`, `r3RemoteScheduler`, `r3RemoteSource`, `r3RemoteSpecInventory`, `r3RemoteVpn` — são excluídos em sincronia. A implementação remota pública e o E2E independente são mantidos; o contrato de exclusão está em `opensource/README.md`.

Escopo atual e critérios de aceite. O objetivo completo de aceite confirmado em 2026-09-07 continua válido; nomes de branch antigos, o processo de preparação de ambiente e as lacunas de execução pertencem ao registro histórico e não podem servir como resultado de execução atual.
Os comandos de execução, o credenciamento de ambiente e o isolamento de recursos são mantidos pelo [README do harness](../../harness/remote/README.md);
as definições de caso estão na [matriz](r3-remote-automation-case-matrix.md) e os resultados por fase na [regressão do guia de SSH do Desktop](desktop-ssh-guide-regression.md) e nos relatórios de cada data.

A aceitação completa exige 50 ciclos de recuperação e 2 horas de estabilidade longa; o harness atual tem soak-reconnect em 10 rodadas e soak-dual em 10 minutos.
Os dois não podem se substituir. Completar o nível integral e suas evidências de execução continua sendo uma lacuna de cobertura; desta vez não se reduz o requisito, não se altera o escalonamento e não se declara conclusão.

## 1. Decisões Confirmadas

Conclusões das três rodadas de grilling de 2026-09-07 e das confirmações subsequentes de 2026-09-08 (a tabela de perguntas e respostas por rodada está no histórico do git, versão anterior a 2026-09-13):

- Escopo: toda a linha principal remota; construir item a item o mapeamento de mudança, comportamento, caso e evidência, sem se limitar ao happy path de Provider.
- Realismo: Desktop, SSH, instalação, RPC, arquivos e execução do Agent são reais, apenas a resposta do modelo é controlada; replay controlado não pode migrar para live quando não houver correspondência; há também aceitação com modelo real.
- Isolamento: conta dedicada ou contêiner SSH independente suporta as falhas; subdiretórios de workspace não bastam para isolar o Provider global, as credenciais e o Server; não se assume o controle dos dados do aplicativo atual do usuário.
- Plataformas: regressão completa macOS → Linux SSH, Docker como representante, relay real em navegador de celular; WSL é um pacote de execução Windows separado, e ausência de ambiente resulta em BLOCKED; navegador móvel e aparelho físico são registrados separadamente.
- Forma de execução: suíte fixa WDIO + exploração do Agent para completar lacunas; casos novos passam por revisão semântica de primeira vez e gravação de vídeo dos pontos-chave, casos estáveis em execução repetida coletam evidência automaticamente; a aceitação da entrada de desenvolvimento `dev:desktop` é mantida.
- Baseline: três categorias — clean / premerge R3 / supported-old; App antigo, Server antigo e dados antigos são autenticados separadamente, sem substituir o ambiente antigo completo por número de versão ou fixture de runtime vazio.
- Representante de modelo real: conta Coding Plan com BigModel **Team Coding Plan** (projeto Team sob o mesmo login existente, já aprovado por requisição mínima independente em Linux x64; o plano pessoal com 429 é mantido apenas como resultado histórico); API Key com a configuração Anthropic Messages chamada `ZAPI` na máquina local / glm-5.3 (o resultado anterior do Doubao é mantido como histórico). O limite de consumo de requisições reais foi cancelado; executar conforme a necessidade de cobertura e registrar o número de requisições, as falhas, as retentativas e o usage devolvido pelo serviço.
- Estratégia de cobertura: cobertura total de comportamento e transições de estado, cruzamentos de alto risco em especial, o restante em pairwise; sem produto cartesiano global, cada poda tem justificativa e prova representativa.
- Níveis: smoke / full / soak; 50 ciclos + 2 horas de estabilidade longa; a primeira aceitação completa inclui o soak, o tempo é medido por execução de ensaio, e o escalonamento não reduz o escopo da aceitação completa.
- Tratamento de defeitos: infraestrutura de testes pode ser corrigida; defeitos de produto primeiro reproduzidos, localizados e registrados; caminhos de dependência bloqueados, caminhos independentes continuados; correções de produto entram em fase separada, problemas de design vão para decisão do usuário.
- Registro de processo: o contrato obrigatório de registro de execuções, passos, falhas, limpeza e estado antes/depois das correções está na §8.

## 2. Feature Summary e Descoberta de Escopo

| Campo                  | Conteúdo                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Operating mode         | implementation-handoff: entrega de plano implementável e casos aceitos, fase de planejamento histórico; a lista atual de implementação é mantida pelo inventário do harness e pela matriz de cobertura |
| Change layers          | presentation, option-source, draft-default, validation, commit-effect, persistence, recovery           |
| Domínios principais   | conexão/deploy/identidade; configuração e execução de Provider; workspace/conversa/configurações; recuperação cross-end |
| Verificações obrigatórias | barreira de primeira conexão, troca de geração na reconexão, RPC de encaminhamento total, rota de escrita de Source, migração de configuração e identidade antigas, identidade real da build |
| Verificações condicionais | capacidade de plataforma SSH, Docker/WSL, relay de navegador, conta de modelo e requisições reais, execução de versão antiga e fallback |
| Verificações de invariante | fluxo local, Window Host único, fila única da CLI, continuous/replayable, isolamento entre Sources distintos, sem secret nos logs |
| Escopo de produto não estendido | automação cron remota, nova entrada de produto Direct URL, limpeza completa de chaves no R4, retomada automática após crash, troca de papéis entre quaisquer múltiplas janelas |

O primeiro gate de implementação precisa gerar `change-map.json`: varrer separadamente as mudanças da linha principal R3, do incremento de merge e das correções posteriores, registrando arquivo/símbolo, relação semântica nomeada, spec autoritativa e IDs de casos relacionados. Mudanças não remotas devem registrar o motivo da exclusão; facades compartilhadas, protocolo, build e owners de estado não podem ser excluídos só porque o caminho não contém remote/ssh. Mudanças relacionadas ao remoto sem explicação são marcadas como `unmapped` e a cobertura completa não pode ser aceita. A alcançabilidade estática só fornece pistas e não inclui mecanicamente todos os arquivos de staging nos casos remotos.

### UI Surface Matrix

| Cenário / entrada de UI                                                | Implementação compartilhada / owner do rascunho de exibição | Padrão/validação                                                            | Ação de commit / destino autoritativo                                | Padrões e isolamento                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Adicionar SSH / assistente de conexão de dispositivo                    | SSHDialog, gestão de conexão de Host                        | target, confirmação de instalação, gate de versão, Provisioning inicial | Connection Manager → Transport → Source daemon → attachment             | credenciais não entram na tab; sem instalação antes da confirmação; download local exige escolha explícita e asserção |
| Página de configurações de dispositivo / sidebar / seletor de dispositivo | projeção do Controller, linha de Source                      | Source online, estado da operação, identidade                            | RemoteWorkspaceController → serviços de management/profile              | três entradas compartilham a intenção; offline não recai para o local         |
| Isolamento de projeto e histórico de uso                               | Root history, open membership, TabStore                     | Source/realpath/purpose, attachment já existente                          | Source backing workspace, logical session, open set persistente         | mesmo path local/remoto, dois Sources, projetos/chat isolados entre si      |
| Página de configurações de modelos                                      | SettingsPage → Local ServiceProvider                        | rascunho de Provider local, Configured Default; cwd de conectividade local | Local ProviderSettings → salvamento bem-sucedido → Provisioning source  | ativar tab remota ainda edita o local; sem entrada de edição remota ou sync manual |
| Seleção de modelo na conversa / banner sem modelo                      | useModelSelectionView, rascunho do pane                     | Host Registry alvo / validação de seleção                                | ModelSelection alvo, criação de Model pela CLI                        | remote-waiting não usa fallback de candidatos local; respostas de generation antiga são descartadas |
| Skills/MCP/Plugins/Hooks/Subagents/Memory/Output/Settings-sync        | hooks/attachment de Source scope e workspace scope          | online, escopo user/project, projeção alvo consistente                   | configuração formal do Source selecionado / arquivos do workspace       | a localização da página de modelos não deve enviesar essas configurações; celular não abre gestão de Source |
| Arquivos/terminal/Git/mídia                                            | RemoteWorkspaceRpcContract de encaminhamento total          | scope, execução por caminho, autorização de mídia                        | serviços remotos / filesystem / PTY / repo                              | IO remoto real; capacidade local do cliente passa pelo platform seam        |
| Área de conversas / lista de tasks / interação pendente                | V4 pane, projeção de índice do Controller                   | endereço de task, owner/lease, admission da CLI                          | CLI remota / Session / índice de tasks                                 | tasks locais/remotos não se misturam; rejeição, ACK, fila com destino único  |
| Celular /remote                                                         | projeção de navegador, attachment confiável                 | Host/session existentes, clientMode confiável                            | CLI existente, mesmo CommandInbox                                       | replayable com assinatura independente; não cria SSH/Host/Agent; não afeta o continuous do desktop |

### Shared And Divergent Behavior / State Owners And Commit Sinks

```text
Configuração de modelos no Desktop -> commit formal do Local -> trigger
                                          |
Main coordinator [Environment key / generation / registration, apenas metadados]
                                          |
Window Host lê o Local Source agora -> Remote Target.apply
                                          |
Store formal remoto -> refresh de Account/Registry -> novo Model

Primeira conexão: applied / already-applied -> Workspace pronto
      failed / rollback_failed / unsupported -> recusa ready, libera attachment pendente
Reconexão: novo remoteSessionId -> restaura workspace; falha de re-registro na sincronização gera apenas warning

Desktop continuous ------+                 +-> assinatura desktop independente
                         +-> Host/CLI existente +-> um CommandInbox
Mobile replayable -------+                 +-> gap/snapshot mobile independente
```

- `sourceServerId` é a identidade estável do ambiente de dispositivo; `remoteSessionId` é a rota de conexão que pode trocar de geração; `workspaceIdentity?.trim() || workspacePath` é a chave de isolamento, e arquivo/cwd usam path.
- O Host Directory é a fonte de verdade de Source/Profile; open membership e o histórico completo de dispositivos são estados diferentes; o índice de tasks não substitui o corpo da Session nem o runtime da CLI.
- A Environment key do Provisioning é **derivada por target de transport**, não pelo Source ID. Múltiplos workspaces/janelas com a mesma key compartilham a lane; o mesmo Source em linhas diferentes permite sincronização independente. Dois applies com `syncId` diferentes não são a mesma reexecução idempotente.
- O fato estático de configuração é congelado no **objeto Model** já criado. Um próximo turno comum cria um novo Model e, com o refresh do alvo concluído, o próximo turno da mesma Session já deve ler a nova configuração; cabeçalhos dinâmicos de conta seguem o contrato de refresh próprio e não se pode afirmar que toda autenticação fica congelada para sempre.
- A sincronização de Provider substitui apenas Personal Layer, Configured Default, campos estreitos de conta e credenciais da allowlist. O alvo atualiza o Registry por conta própria; Builtin Release, proxy, locale, diretórios e credenciais fora da allowlist são preservados.
- O Personal Provider Config em texto claro é o contrato atual; logs, trace, snapshot e artifact não podem vazar secret. Não se pode confundir o texto claro legítimo no store formal com "vazamento em log".

### Codegraph Evidence / Feature Relationships

Desta vez não há codegraph chamável; foram usados git diff, rg preciso, código-fonte e rastreamento de testes para 1–2 saltos semânticos. Não se pode afirmar que um codegraph foi executado nem que testes foram rodados. As sementes a seguir servem de base para a revisão posterior do índice:

| Rank           | Semente / caminho direto atual                                                                            | Relação e tarefa de prova                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| must-inspect   | desktopRemoteSessions → ProviderProvisioningEnvironmentCoordinator → remoteProviderProvisioningService | ready na primeira conexão, troca de geração na reconexão, single-flight, desregistro do Host antigo |
| must-inspect   | salvamento de ProviderSettings/credentials → trigger de source em node.ts → providerProvisioningSource/Target | snapshot mais recente, transação/rollback, idempotência, remoção por allowlist    |
| must-inspect   | SettingsPage → Local ProviderSettings; useModelSelectionView → remote facade → turn-model            | separação entre autoridade de edição e de execução; configuração do Model atual/seguinte |
| must-inspect   | sourceServerReleaseResolver → sourceServerConnectionManager → transportAdapter → CLI release runtime | mudança de SHA na mesma versão, instalação real consistente com processo ativo   |
| must-inspect   | useRemoteWorkspaceHistory → Controller/Registry → renderer port bridge                              | preservar histórico de falhas, desconexão explícita, respostas antigas, open membership |
| must-inspect   | sourceSettingsServiceCollection → Source hooks como SubagentsSection                                   | user scope sem projeto e a emenda com a seleção de modelo; proxy indisponível é apenas candidato de risco, exige execução real |
| should-inspect | remoteWorkspaceRpcContract → services de encaminhamento total → mediaPreview/file/Git/terminal      | novo conjunto de channels e autoridade do Source; o contrato ainda é v1 e o gate de compatibilidade deve rejeitar cliente antigo antes da distribuição |
| invariant-only | windowHostAttachmentRpcPolicy, Core http.ts, task realtime / CommandInbox                            | celular sem provisioning/terminal/management; o sibling do desktop segue funcionando |
| evidence-only  | SSH P0 formal/pending specs, CLI verify-remote-ssh                                                 | reuso de harness e fixture; existir spec ou artifact antigo não significa aprovação atual |

### Graph Drift Candidates / Graph Delta

Relações obsoletas já confirmadas: o antigo service/journal `provider-sync` e o antigo hook de model-provider nas configurações de Source; eles foram substituídos pelo Provisioning automático, e as arestas atuais do grafo semântico e as entradas de documentação devem ser atualizadas. A descrição antiga de fila dupla e de sincronização autoritativa do Desktop Provider Registry em `zcode-domain-cross-products.md` também passa a descrever o contrato vigente de CLI/Environment.

A afirmação antiga em documentos históricos de que "a remoção local não revoga credenciais remotas" conflita com o replace/delete atual por allowlist; prevalece a [spec atual de Provisioning](../remote/provider-provisioning.md) e a escrita no store formal do Target, corrigindo o drift da documentação. A não-promessa geral de múltiplas janelas do R3 antigo não cancela as lanes cross-window específicas nem o contrato RCONV-16; os demais comportamentos de papéis de janela indefinidos permanecem na área undefined da matriz.

## 3. Ambiente, Materiais e Isolamento

| Ambiente  | Uso nesta rodada                                                                     | Grau de realismo / fronteira de aceite                                                        |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| E-SSH     | SSH Linux x64 do Desktop macOS atual → linux-amd64-dev                             | senha, sshd real, archive, Server/Agent, entrada de desenvolvimento; mediu-se que esse alias aponta para o SSH exposto pelo Docker local, não se pode alegar validação WAN entre máquinas |
| E-ISO-A/B | contêineres SSH novos e isolados, dois Sources independentes, mesmo caminho absoluto de projeto | remoção/corrupção de configuração, troca de versão, kill de Core/Agent, falhas de cota/permissão/rede; reconstruível a cada rodada |
| E-SVC     | alvo independente com user service manager funcional                              | sucesso no systemd, recuperação em ambiente sem bus, falha real de registro; o E-SSH atual só tem capacidade detached |
| E-DKR     | transport Docker do Desktop → contêiner Linux independente                          | representante real de proxy-stdio do Docker, sem substituir por "SSH para contêiner Docker" |
| E-MOB     | navegador com viewport móvel + web local + relay externo com correspondência explícita de ambiente + scope SSH existente | pareamento/attachment/recuperação reais; automação de navegador não é evidência de aparelho real iOS/Android |
| E-WSL     | Desktop Windows + WSL2                                                               | preparação do pacote de execução de plataforma, BLOCKED sem Windows; não se reduz o gate de release cross-transport |
| E-OLD     | fixtures autenticados de Desktop/Server/dados antigos                              | os três registram separadamente versão, origem, SHA, schema e executabilidade                |

Requisitos de isolamento:

1. O adaptador SSH do desktop atual fixa o usuário remoto `~/.zcode/server`. Embora a CLI suporte `--server-root`, essa capacidade não atravessa a entrada do desktop; não se pode tomar o `ZCODE_DATA_BASE_DIR` local nem dois diretórios de projeto como isolamento do ambiente remoto.
2. Perfil E2E local dedicado + usuário/contêiner remoto dedicado; modelos reais só são importados para o perfil isolado pelas entradas de escrita do produto, com as configurações representativas selecionadas, e só então expedidos pelo Provisioning formal. Não se copia cegamente o `.zcode` completo do usuário. Os diretórios de dados do App/Chromium/CLI/Helper devem ser verificados separadamente: o Helper antigo ainda precisa de um `ZCODE_HOME` próprio, e apenas `ZCODE_DATA_BASE_DIR` e `ZCODE_DESKTOP_HOME_DIR` não bastam para isolá-lo.
3. Fixtures de projeto ficam em `.zcode-e2e/<run>/<case>` dentro de cada workspace real; os dois Sources usam o mesmo path POSIX para verificar o isolamento de identidade; ao mesmo tempo se mantém um workspace local como sentinela de contaminação inversa.
4. Ambiente dedicado executa em série com `ZCODE_E2E_MAX_INSTANCES=1`; ambientes independentes podem receber paralelismo limitado de um runner futuro, sem compartilhar a raiz de instalação padrão, o provider store, portas ou a saída de gravação.
5. Um contêiner systemd não pode ser considerado totalmente isolado só por usar namespace privado de cgroup. Antes de iniciar é preciso mascarar `systemd-binfmt.service` de forma persistente, conferir que o registro de binfmt da VM Docker não muda antes e depois e revalidar os alvos x64 existentes. Fixtures privilegiadas sem essas pré-condições verificadas são proibidas de reuso; não se pode contornar a falha reescrevendo manualmente o binfmt compartilhado.
6. As falhas afetam apenas contêineres/usuários registrados, conexões e PIDs. Antes de operar um PID, revalidar start time, caminho de execução, releaseId e titularidade; não se adivinha a titularidade pelo nome `zcode-server.cjs` nem pela diferença entre PIDs novos e antigos. Não se mexe no sshd do host, na rede do sistema nem se enche o disco compartilhado.
7. Falhas de rede e de arquivo preferem proxy TCP externo, sistema de arquivos de teste com limite, controle de permissões e injeção de dependências de serviço já suportada. Se a fase transacional exata não tem ponto de controle, primeiro se cria um seam de teste com teste unitário; não se pode usar sleep para adivinhar a janela de escrita.

## 4. Cadeia de Execução de Testes e Lacunas de Implementação

```text
change-map + preflight de materiais
  -> Verificação de autenticidade do build desta rodada e do conteúdo do archive
  -> Perfil limpo / alvo dedicado / replay pronto
  -> Barreira de primeira instalação e primeira conexão
  -> Pacote de testes full independente [desenvolvimento / configuração / identidade / conversa / recuperação / configurações]
  -> Migração de upgrade / Docker / Mobile / live representativo
  -> soak
  -> auditoria de evidências + auditoria de limpeza + conclusão por ambiente

Alguma dependência falha -> aquele ramo é BLOCKED_DEPENDENCY, salva a referência da falha raiz
           -> continua nos ramos de recursos independentes, sem gerar em massa o mesmo timeout
```

### Comandos e Capacidades Existentes

```bash
node scripts/check-workspace-freshness.mjs
pnpm bootstrap:with-remote
pnpm dev:desktop

# Entrada WDIO existente para um único caso pending; credenciais SSH injetadas no ambiente de execução controlado.
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/<case>.test.ts'
```

`bootstrap:with-remote` re-stageia os archives remotos no final, mas não constrói o bundle do Desktop. O próprio WDIO constrói o Desktop de E2E; a aceitação da entrada de desenvolvimento usa `pnpm dev:desktop`. Os dois precisam partir do mesmo estado determinístico de código-fonte, e não se pode escrever um PASS do WDIO como verificação da forma de iniciar em desenvolvimento. Pular a construção só é permitido quando o resumo de código-fonte/configuração/artefatos do build receipt corresponder.

**O runner unificado `preflight/smoke/full/soak` ainda não foi implementado**; esses são subcomandos pendentes de implementação, e este documento não forja scripts pnpm já executáveis. São necessárias no mínimo cinco capacidades:

| Pacote de trabalho          | Reuso                                        | Capacidades a completar / prova de conclusão                                                                                |
| --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| H1 Lista de execução e gestão de recursos | runId do WDIO, helper SSH, verifier da CLI  | resolução padrão de alias, alvo exclusivo, detecção de capacidades, build receipt, categoria de conta e registro de requisições; BLOCKED explícito quando faltam materiais |
| H2 Conexão e ciclo de vida do produto       | diálogo SSH, cold reconnect pending         | escolha explícita de download local, identidade de PID do R3 Supervisor/Core, proxy de desconexão, controle cross-window/projeto; não injetar estado "já conectado" diretamente |
| H3 Oráculo de sincronização e de modelo      | replay case-local, túnel SSH reverso        | resumo do Store remoto/readiness do Registry, provider/model/body reais, syncId/generation; controle de fluxo por barreira e sincronização, fail-closed quando não houver correspondência |
| H4 Orquestração Mobile/live                 | dev:web-remote-control, contrato de attachment existente | pareamento de browser móvel, relay real, desconexão independente; requisições reais de modelo com registro de auxiliares/retentativas, sem limite artificial de consumo, valores de autenticação fora do registro |
| H5 Registro e auditoria                      | reporter, gravador de janela Electron, artefatos de falha | vídeo de representante bem-sucedido/capturas de tela-chave, janela de logs remotos, JSONL por passo, preservação da primeira falha, reconciliação de dados antes/depois, auditoria de limpeza, resumo HTML/Markdown |

H3 usa um túnel SSH reverso real para levar as requisições de modelo remotas até um serviço de resposta controlado; o controle da conexão SSH e o túnel de replay de modelo são separados. Desconectar o SSH da UI não deve parar por acidente o serviço de resposta do modelo, senão não é possível provar que a task remota continua de forma independente. A sincronização de configuração formal e a execução remota do Agent precisam passar pelo encadeamento do produto; é proibido escrever diretamente a configuração no alvo e depois alegar que a sincronização passou.

Complemento de execução real de 2026-09-08: a fixture genérica de replay de Personal Provider precisa entrar no Registry mesmo com a camada Built-in vazia, sem depender do Built-in de E2E local para completar campos. É preciso declarar explicitamente o grupo de Provider, Model enabled, requiresMfjsToolSchema, properties completas e o option map de reasoningLevel/maxOutputTokens; seeds explicitamente desabilitados continuam desabilitados. Caso contrário, o modelo local padrão, ao ser expedido para um remoto independente, dispara uma rejeição legítima do Registry, e não se pode confundir essa falha de fixture com a falha da sincronização do produto.

## 5. Autenticidade de Artefatos e Compatibilidade Histórica

Registrar e conferir a cada rodada:

```text
Git HEAD + resumo das mudanças da árvore de trabalho + Node/pnpm/configuração de build
  -> descritor do archive [version,target,SHA,size]
  -> eventos de upload/instalação [local-download-upload]
  -> current.json remoto [archiveSha256,releaseId]
  -> Supervisor/Core ativos [PID,startTime,caminho do release]
  -> novo Agent [identidade do processo/entrada de carregamento] -> requisição/execução real marcada pelo case
```

O daemon antigo da mesma versão é uma classe obrigatória de teste e não pode ser avaliado só comparando o número de versão; o reuso sem operação com o mesmo SHA e a atualização com SHA diferente são verificados separadamente. Quando o running-task guard bloquear, é preciso preservar um erro acionável e uma entrada explícita de force, e não se pode continuar produzindo PASS com o processo antigo.

Os materiais antigos se dividem em:

- Extremo antigo especificado pelo usuário nesta rodada: `/Applications/ZCode.app`, versão real `3.11.2`, build commit dentro do pacote `89817f5b`; a instalação original é preservada e só é iniciada com perfil isolado. O código-fonte atual do extremo novo declara `3.11.1`, e a baseline de verificação é `e31f76568f`. Este é o papel de código antigo/código novo, não uma ordenação por número de versão; não se pode alterar metadados de versão para satisfazer a premissa de "mesma versão". A sonda anterior de Downloads 3.10.0 é mantida como histórico e deixa de ser o extremo antigo padrão. O ramo de exatamente mesma versão com SHA diferente ainda exige prova separada, e não se pode contar essa combinação de versões reais diferentes como aprovada.
- R3 pré-merge: fixo em `8009d8cd08`, permite reconstruir o Desktop/Server antigos em checkout isolado; mesma versão não significa mesmo commit.
- Versões antigas suportadas: combinações de App/Server com procedência, SHA, manifest de plataforma/pacote e verificação de início real comprovados. Os pacotes antigos existentes são candidatos em primeiro lugar, e não se pode escrever "o arquivo existe/o checksum confere" como executabilidade ou certificação de release formal.
- Dados antigos: criados pelo programa antigo correspondente em ambiente dedicado — projeto, conversa, modelo selecionado, estado estreito de conta — depois salvos em backup e migrados na versão atual; ramos de exceção do banco de dados podem usar fixtures sintéticas com procedência de schema explícita, e o relatório marca como synthetic.
- Fallback do Desktop antigo, atualização do Server antigo e migração de dados antigos são três provas diferentes. A reconstrução a partir do código-fonte prova o comportamento de um commit fixo e não substitui o pacote de release assinado formalmente, a distribuição de atualização automática ou a experiência de instalação do sistema; quando a conta antiga ou o serviço remoto não está disponível, o BLOCKED correspondente é preservado.

## 6. Níveis de Caso, Enumeração de Status e Poda

O setup/action/assertion completo e as evidências estão na [matriz](r3-remote-automation-case-matrix.md). A relação de cobertura não é a contagem de arquivos de spec: cada comportamento aceito precisa de um case ID, expectativa e evidência próprios, mesmo compartilhando a mesma inicialização cara de ambiente.

| Nível  | Conteúdo                                                                                | Uso                                                             |
| ------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| smoke | gate de materiais/artefatos, instalação/primeira conexão, uma operação remota de arquivo e terminal, sincronização/primeiro envio, isolamento de múltiplos workspaces, uma recuperação | localização rápida de bloqueios na cadeia principal; o tempo é publicado após medição real, sem prometer minutos antes |
| full  | todas as funcionalidades/falhas/migrações aceitas, unit/contract afetados, Docker/Mobile/live representativos, caminho de início em desenvolvimento | execução por pacote, com agendamento retomável; não se pode tomar o smoke de um pacote como full |
| soak  | 50 desconexões e recuperações + 2 horas de Desktop/Mobile concorrentes, tendência de processos/conexões/assinaturas/fd/memória, volume de logs de produção | primeira aceitação completa e mudanças relevantes de ciclo de vida; uso de modelo por replay |

Dimensões de alto risco: primeira conexão/reconexão, novo salvamento com sincronização em curso, configuração vazia/inválida/antiga, Model antigo/novo, Environment key igual/diferente, mesmo path com Source diferente, conversa com/sem projeto, desconexão voluntária/involuntária, running/blocking/idle, respostas de generation antiga, desktop/mobile, versão antiga/dados antigos. Tema/idioma/viewport em combinações pareadas; ramos puramente transacionais de serviço usam integração com o store real e os representantes-chave passam pela GUI, sem replicar todas as combinações de banco de dados no Electron.

## 7. Aceitação e Tratamento de Falhas

- Os status são registrados separadamente como `planned / running / PASS / FAIL / BLOCKED_ENVIRONMENT / BLOCKED_ACCOUNT / BLOCKED_DEPENDENCY / NOT_RUN / PRUNED / UNDEFINED`; cobertura de produto e resultado de execução são dois campos. Não implementado, ambiente ausente ou skip não contam como PASS.
- P0: cadeia principal indisponível, perda de dados/mistura de Source, vazamento de secret, celular criando outro runtime. P1: recuperação pendurada, falso online, erro de rota de atualização/escrita, falha de ação central do usuário. Os dois bloqueiam a aceitação completa correspondente; P2 é listado separadamente para decisão humana e não pode ser dispensado silenciosamente.
- Cada caso de GUI precisa de UI + pelo menos um entre runtime/protocolo/rede/persistência; permissões, sincronização, isolamento e upgrade devem ser verificados em combinação com as requisições e os dados reais, e não apenas olhando toast/records.length.
- Espera assíncrona baseada em eventos, marcadores de requisição, status autoritativo e guard; o deadline é o limite superior de falha, e sleep não pode servir como prova de chegada ao estado desejado.
- Depois da correção de um problema de timing, são necessárias três passagens consecutivas, preservando a primeira falha e o commit de correção; não se fecha um caso flaky com "deu certo na retentativa". Cada migração parte de uma fixture de dados antigos nova.
- Defeitos de produto registram reprodução, esperado/real, código-fonte/build/ambiente, passos mínimos de falha e evidência de atribuição, entrando em fase separada de correção. A própria infraestrutura de teste pode ser corrigida, mas o resultado anterior à correção e o motivo da mudança precisam ser preservados.
- A contagem de recursos precisa ser comparada no mesmo estado de repouso, com o trabalho concluído e todos os attachments próprios liberados; conexão/sessão/listener/fd não devem se acumular rodada a rodada. A memória é amostrada em série após o warm-up e a tendência de retenção é analisada; flutuação de GC não pode ser tomada diretamente como vazamento; sem evidência não se pode afrouxar limiares arbitrariamente.
- Primeira aceitação completa = conclusão das funcionalidades aceitas nos ambientes disponíveis + reverificação de timing + soak + auditoria de evidências/limpeza. A aprovação do SSH e a aprovação de release cross-plataforma são separadas; quando uma plataforma obrigatória como WSL está BLOCKED, não se pode alegar conclusão da aceitação de release em todas as plataformas.

## 8. Contrato de Registro do Processo de Testes

Artefato padrão: `packages/desktop/.e2e-artifacts/r3-<UTC>-<runId>/`, e os artefatos não são commitados no Git. A documentação guarda apenas resumos dessensibilizados dos resultados e o índice de artefatos. Cada ação real de teste registra o start antes da operação e observation/asserção/fim depois da operação; mesmo em caso de crash é possível achar o último passo incompleto.

```text
run/
  run.json                 código, build, ambiente, comandos, resumo de configuração, verificação de materiais, registro de requisições e usage
  change-map.json          mudança -> spec -> case ID -> artifact
  events.jsonl             tempo, case/step, ação, esperado, observado, status, duração
  cases/<id>/
    result.json            setup/action/assertions, caminhos das evidências, classificação da falha
    screenshots/           estados-chave de interação
    recording.webm         vídeo da janela Electron do primeiro caminho representativo/da falha
    protocol.jsonl         identidade dessensibilizada, generation, syncId, seq/ACK e reasonCode
    requests.jsonl         marcadores/provider/model/parâmetros estáticos da requisição; apenas presença da autenticação
    process-before.json    titularidade, PID/startTime/releaseId, contagem de conexões
    process-after.json
    persistence.json       marcadores de fixture, resumo de configuração, categoria e contagem de chaves, resultado da reconciliação
    logs/                  logs do Desktop/Host/Core/Agent remoto na janela de tempo do case
    cleanup.json           recursos criados, recolha real, resíduos e resultado da recuperação
  issues.json              primeira falha, reprodução mínima, classificação da causa raiz, vínculo com correções posteriores
  summary.md               estatísticas por ambiente/pacote de teste e motivos de não execução
```

- Cada requisição de modelo de um case é marcada com `E2E_R3_<ID>_<run>`; as referências de artifact apontam para a falha original, e não apenas para a última retentativa.
- A coleta de logs usa offset/janela de tempo; logs remotos antigos não podem ser contados como erros desta rodada. Configurações e credenciais não são despejadas por completo; guarda-se apenas os campos permitidos, fingerprint de configuração não sensível e categoria/presença de chaves. Secret de baixa entropia não é usado como SHA puro como evidência externa.
- Antes do commit, faz-se uma auditoria canário de redação; as capturas de tela ocultam credenciais e identidade pessoal, e o corpo completo de replay da requisição também deve remover headers/token. O resultado da autenticação real da conta não inclui token, e-mail ou dados do usuário.
- Falha de cleanup torna o case não-PASS e impede o reuso do ambiente contaminado; as asserções de negócio concluídas e a falha de cleanup são preservadas separadamente. Não se destrói o ambiente para mascarar corrupção de dados; primeiro se concluem as evidências e a reconciliação, depois se destrói.
- A exploração do Agent usa o mesmo registro de eventos e os mesmos artefatos; problemas encontrados precisam ser devolvidos como case ID estável. Observações do tipo "parece normal" sem asserção fixa são registradas como observação exploratória e não contam como cobertura automatizada.

## 9. Handoff de E2E e Ordem de Entrega

1. Concluir primeiro a certificação de materiais e o `change-map`; escrever os cases aceitos pacote a pacote em `manual-review/pending` conforme a matriz, verificando antes da implementação o drift do grafo/spec atual.
2. Priorizar a correção das lacunas de harness H1/H2/H3, para que instalação, primeira conexão, expedição de configuração, arquivos/terminal e conversa em dois workspaces obtenham evidência do build atual.
3. Complementar os pacotes de configuração/identidade/recuperação e depois os de migração de upgrade, Docker/Mobile/live; continuar os demais pacotes de teste quando os recursos forem independentes.
4. Fixture de provider/file local do case; fluxo determinístico usa controlled-stream e falha de protocolo usa fault-stream; um caso real de SSH não ganha automaticamente transporte Docker ou prova de plataforma por rodar em contêiner.
5. Após a primeira revisão de GUI/comportamento, seguir a promotion dry run → fixture check → apply → default replay do `e2e-case-lifecycle`. Casos que precisam entrar no preset de Docker passam primeiro por admission independente e depois o preset estável é executado em lote.
6. Checagens mecânicas: `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck`, `pnpm lint` e auditoria de fixture/coverage relevante. Com os testes afetados já suficientes, não se acrescenta uma bateria completa de UT sem relação.
7. Os commits de implementação seguem Conventional Commits e as [diretrizes de commit do repositório](../git/ai-agent-commit-message-guidelines.md). O relatório de conclusão lista separadamente o status do plano, o status do harness e o status da execução de testes, sem misturá-los em um único "concluído".

### Planning Handoff / Itens em Aberto

| Artefato/questão                                        | Destino / tratamento                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Spec e estratégia de testes                             | este documento; o consenso semântico está confirmado                              |
| accepted/undefined/pruned e status de implementação     | matriz dedicada; índices adicionados ao catalog/coverage matrix principal         |
| Contas disponíveis, cota, ambientes, pacotes antigos    | registro de prontidão; existência de metadados não equivale a disponibilidade online |
| Baseline histórica de versão original exata             | certificar os pacotes antigos existentes ou reconstruir o commit especificado; não se pode adivinhar o commit de uma versão |
| Papel geral de reconexão automática com múltiplas janelas, TTL de idle com workspace totalmente vazio | manter UNDEFINED; as lanes e o contrato RCONV-16 específicos são aceitos normalmente |
| Implementação de testes                                 | H1–H5 e implementação pacote a pacote conforme a matriz; nada foi implementado/executado do zero até agora |
