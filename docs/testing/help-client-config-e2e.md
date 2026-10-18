# Verificação da configuração de ajuda e cobertura E2E

> Todo103: este documento preserva o comportamento já estabelecido no staging e o registro histórico de
> aceitação; as contagens de aprovação históricas não contam como aprovação desta rodada.
> A evidência da integração deste ciclo está registrada em
> todo103-staging-integration-ledger.md e não alterou as fronteiras de Provider/Selection.

## Feature Summary

Correção da reverificação do Todo103: `setApplicationLocale` é o estado do menu nativo do Main e não
equivale ao ajuste de idioma do Renderer. O caso formal atual primeiro grava inglês na configuração
isolada e recarrega, e só então executa as asserções de UI em inglês; no final restaura a configuração
original. Sem isso, em um sistema em chinês as entradas Help/feedback existentes seriam julgadas como
ausentes. Não é preciso modificar o mecanismo de idioma do produto.

| Item            | Decisão                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Objetivo/modo   | verificar a migração de client/configs, implementation-handoff                                            |
| Camadas         | option-source, validation, commit-effect, persistence                                                     |
| Semântica estabelecida | segue settings-community-link-config.md e as regras de migração confirmadas pelo usuário desta tarefa |
| Fora de escopo  | envio de ticket, Agent/session, owner, continuous/replayable, alterações no servidor                        |

## UI Surface Matrix

| Cenário / entrada                              | Implementação compartilhada / owner         | Default e validação                                     | Destino da gravação                  | Diferença de modo / isolamento                          |
| ----------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| Comunidade no menu de interrogação              | WorkspaceHelpMenuButton → platform → desktopHelpConfig | idioma atual: remoto→embutido           | shell.openExternal                   | plataformas Desktop / Web abrem separadamente; não altera a sessão |
| Feedback no menu nativo / paleta de comandos    | desktopCommandHandlers → helpAppConfig     | false→popup embutido; true→endereço remoto ou embutido | OpenFeedbackDialog / shell          | a plataforma Web sempre abre o endereço                   |
| Visibilidade de comunidade na caption do Windows / candidatos de comando | canOpenCommunity  | se não há remoto nem default no mesmo idioma, false     | somente leitura                     | não tratar estado visível como link já aberto            |
| Relato de problema no menu de interrogação       | helpMenuActions / feedbackStore            | não lê o switch de feedback                             | Dialog embutido                     | permanece independente do modo de feedback por plataforma |
| Leitura de configuração no navegador            | resolveWebHelpConfig / readHelpConfig      | envelope, default do mesmo idioma                       | fetch + Map em memória              | Web omite platform; sem Host de controle remoto novo    |

## Shared And Divergent Behavior / State Owners

As regras de HTTP e de cache em memória são compartilhadas por helpAppConfig; a entrada de UI de
feedback não compartilha o switch. A API remota é a autoridade de configuração, o JSON embutido é o
default e o Map guarda por 1 hora apenas respostas bem-sucedidas; não existe gravação persistente.

```text
Estado da configuração → Entrada do usuário / ação da plataforma → Requisição ao endpoint atual → Validação code=0
                                      |
                     Cache de sucesso em memória ←---+---→ Fallback por campo / mesmo idioma
                                      |
                    Chamada de link externo / popup embutido / indisponível
```

## Feature Relationships / Must-Preserve Invariants

- must-inspect: reader → Desktop/Web; nenhum pode requisitar a CDN antiga, cachear falhas ou se
  poluir entre endpoints;
- should-inspect: idioma do menu, link externo real e exibição do popup embutido; não se pode usar
  "número temporariamente zero de chamadas de link externo" para fingir sucesso do popup;
- invariant-only: task, attachment remoto e continuous/replayable não estão nesta cadeia de
  requisição;
- evidence-only: o HC-01 original usa mock de net.fetch e só prova as opções de requisição, não o
  transporte HTTP real nem o comportamento de cache em disco.

## Codegraph Evidence / Graph Drift / Graph Delta

A ferramenta atual não oferece consulta de índice codegraph; as chamadas diretas foram verificadas com
rg a partir dos seeds de arquivo conhecidos, em profundidade 2.
Seeds: helpAppConfig, desktopHelpConfig, desktopCommandHandlers, communityUrl,
WorkspaceHelpMenuButton.
O grafo ainda não tem capacidade de configuração de ajuda; esta rodada adiciona o seed de capacidade
confirmado e não infere outras dependências de negócio.
Candidatos a drift: hoje o menu de interrogação sempre exibe o item de comunidade, e apenas a caption
do Windows e a paleta de comandos têm gate de visibilidade; os testes distinguem explicitamente
disponibilidade por plataforma e menu de interrogação, evitando afirmar que todas as entradas ocultas
foram verificadas.

## Clarification / Boundary Decisions / Dimensions

O usuário já confirmou as regras de migração e autorizou a conclusão da verificação; a semântica
estabelecida não é questionada novamente.
As dimensões são zh-CN/en-US, remoto completo/parcial/com falha, mesmo endpoint/different endpoint,
primeira requisição/requisição repetida e Desktop/Web.
Identidade do workspace, modelo e tema não afetam o resultado de configuração pura, então o produto
cartesiano completo foi podado; no desktop, a verificação do caminho representativo é feita com cliques
na entrada real.
A expiração exata do TTL e a troca de endpoint com requisição em andamento ficam em testes unitários
com relógio controlado, e não se espera 1 hora no E2E como verificação.
Esta rodada faz apenas verificação local; a integração de configuração em tela estreita do navegador
não é a aceitação completa do controle remoto do celular.

## Accepted Cases / Coverage Matrix

| ID    | Preparação                                                              | Ação                                                                 | Asserções obrigatórias                                                                  | Camada de evidência |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------- |
| HC-01 | fixture HTTP local com configuração completa em chinês e inglês       | clique real na comunidade do menu de interrogação; chamada de disponibilidade em zh/en e novo clique | link externo no idioma correto, caminho/parâmetros/número real da requisição, leitura repetida atingindo a memória | UI + rede |
| HC-02 | remoto só com chinês, fixture fornece default embutido em inglês      | ação de comunidade em plataforma inglesa                          | usa o default em inglês e nunca entra no remoto em chinês                              | runtime + sistema de arquivos |
| HC-03 | remoto false, local true; outro endpoint com remoto true              | ação de feedback da plataforma                                    | false exibe o Dialog embutido real e o link externo não é chamado; true abre o endereço remoto | UI + runtime |
| HC-04 | 503 / erro de negócio / JSON inválido                                  | disponibilidade da plataforma e comunidade; restauração de resposta bem-sucedida no mesmo endpoint | default disponível, falha não é cacheada, novo endereço após recuperação; plataforma indisponível quando não há valor | HTTP + runtime |
| HC-05 | Chromium em tela estreita carregando o bundle real do Web resolver, fixture HTTP variável | zh/en, concorrência e recarga da página           | resultado do mesmo idioma, sem platform, requisições combinadas; recarga refaz a requisição sem usar o cache HTTP | browser + HTTP |

## E2E Handoff Notes

- o usuário autorizou explicitamente a promoção após 8/8 aprovações no ambiente local; o caminho formal
  é `packages/desktop/test/e2e/help-client-config.test.ts`, coletado pelo E2E de desktop por padrão;
- o fixture usa JSON case-local; a estratégia de requisição de modelo é none, todas as requisições de
  ajuda são synthetic e isso está indicado em syntheticReason;
- o servidor HTTP local escuta apenas loopback; cada case usa uma origin independente, e as
  configurações e os arquivos temporários de default são restaurados;
- os e2e:fixture:check / e2e:promote existentes só cobrem os domínios conversation/plugins e não
  conseguem tratar settings diretamente. Este caso usa a verificação de contrato de fixture local com
  WDIO e não é migrado para conversation para contornar a restrição de domínio;
- conforme pedido do usuário, a validação em Docker foi interrompida e apenas o resultado local foi
  adotado; hardware real de Windows/Linux e celular não foi verificado.

## Unresolved Questions / Planning Handoff

Não há nova questão pendente de semântica de produto; o problema de exibição do menu de interrogação
sem configuração foi registrado como drift existente e não é alterado nesta verificação de migração
pura. Este arquivo também cumpre o papel de impact brief, catálogo, matriz e registro de poda; as
evidências reais de execução são as seguintes.

## Registro de verificação (2026-09-04)

- primeira rodada no macOS 8/8 passed: `desktop-e2e-20260904061809303-p54917-66703063e8ddebb5`,
  incluindo HTTP real e janela de navegador Chromium 390×844;
- a interface formal fez requisições separadas para darwin-arm64, win32-x64, linux-x64 e Web sem
  platform, todas com HTTP 200 / code 0 e com os três campos de ajuda. Essa evidência não é
  verificação de UI em hardware de Windows/Linux;
- o caminho original settings/manual-review não era coberto pelo exclude padrão do WDIO e foi movido
  para o manual-review/pending de auth/config já existente, evitando que casos candidatos entrem
  por acidente no suite padrão;
- o `e2e:fixture:check` retorna explicitamente unsupported domain para o novo caminho; não foi
  alterada regra de ferramenta nem fabricado provider fixture. A autovalidação confirma que os 8
  cenários synthetic do manifest têm razão, que todos os arquivos existem, que o spec canônico é
  `./test/e2e/help-client-config.test.ts` e que a provider policy é none.

- após migrar para o diretório de candidatos suportado, a reexecução limitada ao provider fixture
  comum deu 8/8 passed: `desktop-e2e-20260904062010268-p58126-9129778db7899df8`. Os records capturados
  pelo provider foram 0.
- os testes unitários de configuração de ajuda passaram 36/36 (shared reader, remote config, Web
  resolver, desktop commands).
- `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck` e `pnpm lint` passaram;
  o lint teve 41 warnings existentes e 0 erros.

### Reexecução do caso formal

```bash
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json \
pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/help-client-config.test.ts
```

O typecheck é concluído antes de construir/executar o Electron, para evitar que ambos escrevam em
out/host ao mesmo tempo.
Conforme pedido do usuário não se usa Docker; a tentativa de container desta rodada foi encerrada e
não foi contada como aprovação.

### Registro de promoção

Em 2026-09-04 o usuário exigiu explicitamente a promoção após a aprovação. O dry run de promoção
recusou o caminho auth/config porque o script só suporta conversation-session; seguindo a prática já
usada neste domínio, migrou-se diretamente para o caminho formal na raiz, corrigiu-se o import do
helper e mantiveram-se o manifest canônico existente e o fixture case-local.
Não foi adicionado provider fixture de conversation nem incluído no preset de Docker.

Verificação local após a promoção:

- replay por padrão no caminho formal: 8/8 passed, artifact `desktop-e2e-20260904063506750-p72944-12b19ddcc35e5a3d`;
- replay do caminho formal apenas com o fixture comum: 8/8 passed, artifact `desktop-e2e-20260904063636183-p75423-66532649b7413591`;
- em nenhuma das duas rodadas foi definido `ZCODE_E2E_MANUAL_REVIEW` e o spec formal foi executado
  normalmente pelo WDIO de desktop;
- `typecheck:e2e`, `pnpm typecheck` e `pnpm lint` passaram (41 warnings existentes, 0 erros); as
  checagens de formatação e de diff passaram;
- a validação do manifest confirma que o caminho formal existe, que os 8 cenários synthetic têm razão
  indicada, que o fixture de arquivo existe e que a provider policy é none.