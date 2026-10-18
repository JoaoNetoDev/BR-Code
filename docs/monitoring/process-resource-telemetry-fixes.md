# Correções da Revisão de Telemetria de Recursos de Processo: Impacto e Validação

## Resumo da Funcionalidade

2026-09-15, com base em `3e6ac3d643`, foram corrigidos R1–R7, N1/N2. O padrão é planning /
implementation; as camadas alteradas são validation e commit-effect, e o agrupamento e a
deduplicação de memória transitória não pertencem à persistência de task nem à recuperação.
O contrato de comportamento está em
[spec principal](./process-resource-telemetry.md#contrato-de-correcoes-da-revisao2026-09-15).
Fora de escopo: dicas de UI, barreiras rígidas de versão, refatoração do framework RPC, protocolo
de task/fila/recuperação e configuração de ARMS em produção.

## Matriz de Superfície de UI

| Cenário / entrada                       | Implementação compartilhada e owner autoritativo | Validação e efeitos colaterais                | Padrão / isolamento                                    |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Desktop conectando a um Server independente | connectServerRemote → handle de conexão do Host | a capacidade de server-info decide a assinatura derivada | ainda conecta sem a capacidade; não altera rascunhos de workspace nem tasks |
| Desktop local e SSH/WSL/Docker           | Host services → saída de telemetria no main      | processos correspondentes mantêm a assinatura | não altera a UI, o runtime nem as settings correspondentes |
| Vários janelas no mesmo Server via Bash | owner do único comando CLI → main                 | validação do identificador de conclusão, deduplicação limitada, projeção ARMS | o número de eventos não aumenta com o número de conexões |
| Attachment de controle remoto do celular | Agent connection scope                            | os eventos de telemetria permanecem vazios  | a semântica de recuperação continuous/replayable não muda |

## Comportamento Compartilhado e Divergente

Não houve alteração em UI, candidatos, valores padrão ou persistência. O encaminhamento
compartilhado fica no Host e a saída fica no main; o Server só assina quando há suporte explícito
de capacidade, e os caminhos local e de implantações correspondentes mantêm as capacidades
existentes. A agregação é separada por ambiente, com múltiplas instâncias do mesmo ambiente somadas;
campos ausentes do novo formato são compatíveis com produtores antigos.

## Relações da Funcionalidade / State Owners e Commit Sinks

| Nível          | Cadeia / owner                                                   | Motivo e fundamento                                                       |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| must-inspect   | server-info compartilhado → dois tipos de Server → helper/index do Host | a declaração, o parsing e o gate de assinatura da nova capacidade devem ser consistentes |
| must-inspect   | owner de Bash da CLI → protocolo compartilhado → services/Host → main | o completionToken é gerado antes do fan-out e deduplicado na saída única |
| must-inspect   | identidade de ambiente do Host → origem CLI/MCP → agregador de janela | a chave de isolamento percorre a cadeia e a projeção de whitelist não vaza identidade |
| must-inspect   | origem CLI → totais de apps externos                           | o instante de chegada pertence à leitura original; a entrega não estende a validade |
| should-inspect | heap próprio do Host / heap do renderer                         | as regras de valor máximo por tick e de limpeza na entrega são consistentes  |
| invariant-only | attachment de terminal / realtime de task / CommandInbox        | sem novas assinaturas de sessão, filas, snapshots ou estado de replay      |
| evidence-only  | testes de telemetria / guard de CI                              | o contrato é validado por asserções de cenários disparadores; testes aprovados não extrapolam para máquina real |

## Invariantes que Devem Ser Preservados

- CPU/RSS de um ambiente de execução só é somado dentro do próprio grupo; especificação de
  hardware não é identidade.
- A expiração da amostra é baseada no tempo real de recebimento; timers não produzem um novo fato de
  leitura.
- Identificador de conclusão e identidade de ambiente são usados apenas para memória transitória; a
  whitelist de propriedades de evento e o limite de 20 propriedades não mudam.
- O main não tem processo externo de amostragem; não há novos timers periódicos, filas em disco ou
  persistência.
- Anomalias de telemetria não afetam a conclusão de Bash, a conexão remota nem a entrega de tasks de
  desktop/celular.

## Evidência de Codegraph

O conjunto de ferramentas atual não possui codegraph, portanto não foi executado scan de impacto por
codegraph. Em seu lugar foram usados o diff fixado, busca de chamadas diretas e contexto de
arquitetura, com profundidade de cerca de duas camadas: as entradas local/remote de
registerHostServiceResourceTelemetry, o despacho de ingestCliResourceSample /
ingestMcpResourceSamples no Host main, e o produtor de protocolo e a saída com whitelist de
ingestToolExecResource. Não se considerou todo nó estaticamente alcançável como impacto de produto.

## Candidatos de Drift de Grafo / Delta de Grafo

A lista documental de capacidades de telemetria não inclui a spec principal de
process-resource; acrescentar essa entrada e o isolamento de ambiente, além do invariante de que o
identificador de conclusão não sai para a rede. A superfície de UI existente e os state owners de
task permanecem inalterados.

## Questões Não Resolvidas / Registro de Esclarecimentos

Não há questões que atrapalhem esta correção. O usuário autorizou correções item a item; adota-se o
contrato existente de "um evento descreve um ambiente de execução", preservando a conexão quando a
capacidade do Server antigo está ausente por padrão. Dicas de UI ou exigir a atualização do Server
antigo não fazem parte das correções necessárias.

## Handoff de Planejamento / Casos Aceitos

| Caso    | Configuração e ação                                                | Asserção                                                                | Evidência / status                                                          |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| PRT-031 | server-info antigo/novo, estabelecendo assinatura de telemetria no Host | sem capacidade não há assinatura e o servidor continua vivo; com capacidade as quatro assinaturas derivadas funcionam | schema / Host / integração WS localhost aprovados; probe do Core antigo sai com 0 |
| PRT-032 | o mesmo identificador de conclusão chegando por Hosts diferentes; mesmas métricas com identificadores diferentes | o primeiro é reportado uma vez, o segundo separadamente; o conjunto é limitado e o reset limpa | protocolo / CLI / regressão do main aprovados; limite e reset verificados |
| PRT-033 | chat/aux em fases erradas, aux sem atualização, flush periódico e de saída | entrega nova leitura por grupo; a leitura antiga sai do total após dois períodos | regressão com relógio controlado aprovada, incluindo expiração de instância do mesmo grupo e orçamento de CLI/MCP |
| PRT-034 | mesma especificação em ambientes diferentes e múltiplas instâncias do mesmo ambiente, CLI e MCP | não soma entre ambientes; soma no mesmo ambiente; as propriedades finais não têm identidade | regressões de Host / source / janela / saída aprovadas |
| PRT-035 | dois Hosts no mesmo tick com heap alto→baixo e baixo→alto     | o valor máximo é consistente e não é entregue de novo no tick seguinte | regressões de selfHeap / integração aprovadas |
| PRT-036 | caminhos reais de origem, chamadas desabilitadas e isenções      | tudo protegido; a amostragem legítima sob demanda continua isenta | guard / higiene do repo aprovados, 73 arquivos / 2 isenções em vigor |
| PRT-037 | crases dentro de regex, classes de caracteres, divisão, comentários e templates | chamadas reais são atingidas, comentários reais ignorados, sem drift de estado no repo | regressão de 31 itens do guard aprovada, incluindo código-fonte real de estabilidade |

## Dimensões / Poda / Complemento da Matriz

As combinações de alto risco são capacidade do Server × conexão, instância × ambiente, fase da
leitura × expiração e conclusão de Bash × múltiplos Hosts. Tema/idioma/tamanho de tela foram podados
por não haver mudança de UI; stream/snapshot de task apenas validam invariantes porque são isolados
de attachment pelo caminho derivado. A spec principal recebe a compatibilidade dos campos novos, a
privacidade e a aceitação de mistura; os arquivos de teste antigos recebem as condições de disparo
conforme os casos acima. O E2E usa os casos de papel de recurso já existentes como entrada e adiciona
validação de deduplicação derivada e de agrupamento por ambiente; não é necessária gravação com
fornecedor de modelo.

## Registro de Validação

Antes da implementação, a verificação de freshness passou; depois da implementação,
`architecture:check --changed` passou sem novas violações de arquitetura.

- Vitest direcionado do lado da aplicação: 24 arquivos / 268 casos aprovados; depois foram
  acrescentadas regressões de expiração no mesmo grupo e de orçamento de origem, com 3 arquivos /
  39 casos aprovados; outros 10 casos aprovaram para a whitelist de eventos compartilhados e o contrato
  documental. Os testes falharam antes da implementação, e as asserções antigas não foram alteradas
  para codificar comportamento incorreto.
- Telemetria de Bash da CLI e ciclo de vida real: 2 arquivos / 16 casos aprovados; a compatibilidade
  antiga/nova de entrada do identificador de conclusão do protocolo foi verificada.
- `pnpm typecheck`, `pnpm lint` e `typecheck:e2e` do desktop passaram; o lint da raiz ficou com 0 error
  e 43 warnings já existentes.
- Gates e higiene do repo: 73 arquivos realmente rastreados, 0 violações, 2 isenções em vigor; a
  verificação de parsing do YAML do grafo, da unicidade de IDs de nós e da existência das sementes de
  documentação/código desta capability passaram. A ferramenta codegraph não está disponível e não se
  afirma que sua varredura de índice foi concluída.
- A verificação completa adicional do pacote da CLI não passou: 55 itens já apresentavam divergência
  de interface/fixture/migração no HEAD fixado, mais 1 suite que importa um módulo removido; 8
  falhas por concorrência passaram na reverificação serial e a causa raiz de carga não foi confirmada.
  O código relevante foi conferido palavra por palavra contra a baseline, e a lógica de UUID desta
  rodada não entrou nesses caminhos de falha. Os 26 erros de max-lines do lint do pacote estão todos
  em arquivos não alterados, e o lint direcionado aos fontes de Bash desta rodada passou.
- O primeiro smoke do Electron falhou na fase de inicialização do Host porque um typecheck paralelo
  sobrescrevia o bundle out/host; a reprodução isolada com utilityProcess deu
  ERR_MODULE_NOT_FOUND. Após o rebuild completo e serial, o PRT-023 passou: 1 spec / 1 caso, código
  de saída 0, validando o main / renderer / Host reais e os eventos de sistema. O relatório está em
  `packages/desktop/.e2e-artifacts/desktop-e2e-20260915105255962-p18104-75dc094004a00c1b/summary.md`.

Durante a implementação do R3 foi corrigida uma lacuna dos candidatos originais: o total de
dispositivos passou a ser atualizado pelo instante de chegada original de cada instância, evitando que
outra instância ativa do mesmo grupo prolongue a vida de um processo já encerrado. O orçamento do
cache externo foi ajustado de 64 para 128, preservando o espaço original de MCP e comportando 64
instâncias de CLI, ainda sem novos timers. O R2 adotou identificador de conclusão aleatório na CLI
com deduplicação na saída única do main, cobrindo múltiplos window Hosts; não foi adotada a solução
de contagem de referências em um único Host, que ainda deixaria duplicatas entre janelas.

O rollback pode reverter este commit de correção; reverter apenas o main perderia a deduplicação e o
isolamento de ambiente, e o antigo strict consumer descartaria os novos campos da CLI, exigindo
rollback do pacote de aplicativo na mesma versão. Não há formato de persistência nem migração de
banco de dados. Windows/Linux reais, SSH/WSL/Docker e o E2E de Desktop completo com Server antigo
ainda não foram validados, e mocks ou probes de módulo em localhost não substituem conclusões de
máquina real.

## PRT-031: Limite de E2E do Desktop se conectando a um Server antigo

Caso real de Desktop aceito: iniciar, em localhost isolado, um Server independente de versão antiga
fixada e disparar a conexão pelo preload existente `window.zcode.connectRemote`, passando pelo gate
oficial de capacidade de Main → Window Host → `host/index.ts`. Quando o server-info antigo não tem
capacidade de recursos, essa assinatura de telemetria não é enviada; o Server continua vivo, a
conexão retorna um sessionId com sucesso, as RPCs de negócio existentes continuam disponíveis e, ao
final, a sessão é descartada pelo `disposeRemoteSession` oficial. Este caso não envia requisições de
modelo.

O status atual é **aguardando um fixture de Server antigo pronto para uso; nenhum spec pending novo
foi adicionado e este E2E remoto de Desktop não foi executado**.
Os E2Es existentes do repo não têm um fixture reutilizável de Server independente antigo em
localhost. Além do gate de recursos, a conexão oficial ainda precisa concluir o initialSync do
Provider Provisioning e o attachment do renderer; um stub estreito que exponha apenas a superfície
de eventos de telemetria antiga não é suficiente para completar essas etapas. Uma falha posterior
no provisioning não pode ser contada como "conexão bem-sucedida" nem prova o caminho completo de
Desktop. Copiar temporariamente o Core antigo ou os serviços de negócio, ou adicionar backdoors de
teste em produção, excederia o limite necessário deste caso, e por isso não foram introduzidos.

A evidência já aprovada inclui o teste de integração WebSocket localhost real
`serverRemoteConnection.test.ts` (pula a assinatura quando falta capacidade e as RPCs de negócio
continuam disponíveis; encaminha normalmente quando a capacidade é true) e o probe de WebSocket
isolado com o Core antigo de baseline fixada. O primeiro valida a semântica de capacidade pelo
connector/RPC/helper reais, mas os parâmetros do gate são injetados pelo teste e o
`host/index.ts` do Desktop empacotado não é executado; o segundo também não contém um Desktop real.
Nenhum dos dois substitui o E2E acima. O `process-resource-telemetry-roles.test.ts` existente pode
verificar o relatório de recursos de um Electron local real, mas seu escopo também não cobre a
conexão com Server independente antigo.

O pré-requisito mínimo seguinte é fornecer um ativo de Server antigo completo, de versão fixada, que
possa ser iniciado em um HOME/cwd de teste independente e encerrado corretamente, preservando a
implementação real de server-info, da superfície de eventos RPC e do Provider Provisioning daquela
versão. Nesse momento o PRT-031 poderá ser escrito em
`packages/desktop/test/e2e/manual-review/pending/`, reutilizando a inicialização de Desktop existente e
as interfaces oficiais de conexão/liberação, e a promoção será decidida após execução real e revisão
humana.