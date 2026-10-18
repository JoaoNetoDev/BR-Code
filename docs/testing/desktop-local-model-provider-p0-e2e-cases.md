# Casos E2E P0 de Provedor de Modelo Local no Desktop

## Todo144: teste de conexão com 1 Token e sem corpo também tem sucesso

2026-09-15 Verificação Pro: os dois pending specs C91-04 e Todo95 passaram 2/2 em conjunto, run `desktop-e2e-20260915073727784-p67110-e4267aabc5aa16a0`. O fixture de sucesso sem corpo retorna explicitamente completion_tokens=1, evitando confundir com o cenário de retry já existente do Adapter para "sem conteúdo e sem uso"; a política formal de retry não é alterada.

- Estende o pending C91-04 `settings/manual-review/pending/provider-connectivity-prompt.test.ts`: clique na linha do modelo real; o loopback case-local devolve um SSE sem corpo com finish_reason=length, afirmando o feedback de sucesso, o Chat wire com max_completion_tokens=1 e o Prompt fixo original inalterado; na segunda vez devolve 400, afirmando falha e configuração/seleção inalteradas.
- Combinação aceita: o nível mínimo e os limites de orçamento/erro são cobertos por testes unitários do Core, os campos de orçamento dos três protocolos por testes unitários do Adapter. O E2E usa Chat como representante; não expande para todas as marcas, temas, remoto/celular real, nem declara compatibilidade total com o upstream. Continua sendo synthetic/fast-text, isolamento local, pending não promovido.

## Todo95: modelo desconhecido configura apenas o nível de raciocínio

- Pending: `settings/manual-review/pending/provider-reasoning-fallback.test.ts`. Apenas local `desktop-continuous`; não representa prova em celular ou em máquina remota real.
- Setup: serviço loopback Chat Completions SSE sintético isolado, Provider custom com modelo customizado; não grava Map pessoal de raciocínio, não usa conta nem cota real.
- Action: pela página de configurações real, adicionar `E2E_T95_UNKNOWN` desconhecido, alterando apenas o nível default disabled para high, mantendo a configuração inteligente; após salvar, clicar no teste de conexão dentro da linha.
- Assert: Personal salva apenas values, sem fixar o Map recomendado; o request final no formato online carrega os quatro grupos de campos compatíveis de high, o model ID original e o probe Prompt estabelecido; sem orçamento manual de pensamento. Em seguida, o SC90-01 existente verifica configuração fixa/leitura de volta na edição, e C91-04 verifica default disabled e que a falha não muda a seleção.
- Poda: os três Schemas / todos os níveis legais dos Maps dedicados e a ordem de precedência são enumerados por testes unitários de configuração e de request; esta interação escolhe Chat em nível alto como representante, sem repetir três UIs. A linha de trabalho de renomeação C ainda aguarda decisão sobre a fronteira de segurança, e não se pode alegar compatibilidade de renomeação concluída com base neste caso.
- Classificação do fixture: synthetic / fast-text; o Prompt de allowlist fixo não pode inserir marker, sendo reconhecido pelo model ID independente `E2E_T95_UNKNOWN`; o serviço local isolado só devolve um ok fixo e não toca modelos externos.

Este documento registra, no workspace local do desktop, o design item a item, os itens de verificação e as conclusões reais de execução dos E2E P0 relacionados ao provedor de modelo do campo de chat. O escopo inclui apenas desktop local, e não inclui remote workspace, `/remote` no celular, recuperação replayable ou fallback de runtime header remoto.

Cada case deve satisfazer:

- Cobrir apenas uma semântica positiva de produto bem definida, sem misturar na mesma case semânticas adjacentes de queue, stop, remote ou fault.
- Ter setup, action e assert independentes; não basta um caminho de teste passar pelo estado relacionado para contar como cobertura.
- A verificação central deve incluir ao menos um entre: estado visível na UI, request real ao provider ou captura de rede, e estado final de session/store.
- Antes da promoção, deve haver fixture case-local e manifest; cases já no caminho formal precisam reexecutar a fixture check e o replay para provar que o contrato continua válido.

## P0-01: smoke de estreia do DeepSeek no workspace local default

### Definição do Case

| Campo            | Conteúdo                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `I07`                                                                                                                          |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-upstream-workspace-smoke.test.ts`       |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-upstream-workspace-smoke.json`             |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-upstream-workspace-smoke.json`          |
| Estado atual     | Promovido, replay case no caminho formal                                                                                      |

### Cenário de Teste

O usuário inicia o desktop e abre o workspace local default, com o custom provider DeepSeek já escrito pelo helper E2E em app data isolado. O usuário abre a lista de modelos na barra do chat, confirma que existe o modelo alvo sob o provider DeepSeek, seleciona esse modelo e envia a primeira mensagem de texto comum.

Esta case valida apenas o caminho positivo mínimo "workspace local default + DeepSeek configurado + estreia com rascunho vazio". Não cobre queue, stop, troca de modelo, edit/fork, workspace remoto ou falha de provider.

### Passos

1. Limpar e preparar o app data de E2E, iniciar o desktop no workspace local default.
2. Aguardar o workspace default abrir e confirmar que a view principal de chat é interativa.
3. Abrir a lista de modelos do chat.
4. Procurar o modelo alvo sob o grupo do provider DeepSeek.
5. Selecionar o modelo DeepSeek alvo.
6. Enviar um texto comum com o marker `E2E_UPSTREAM_WORKSPACE_SMOKE`.
7. Aguardar a mensagem do usuário, a captura da requisição DeepSeek, a resposta do assistant e o estado final idle.

### Itens de Verificação

| Número  | Item de verificação                                                          | Nota de validade                                                                   | Local atual da asserção                                                                       |
| ------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| P0-01-A | O workspace local default está aberto e a view principal de chat existe      | Prova que a case parte de uma entrada real e interativa do usuário, não de chamada direta à camada de serviço | `assertDefaultWorkspaceOpened()` verifica workspace item, chat view, active workspace path      |
| P0-01-B | O botão de lista de modelos é clicável                                       | Prova que a entrada de seleção de modelo do chat funciona                          | `assertUpstreamModelListShowsTargetModel()` aguarda `TID_CHAT_MODEL_SELECT_TRIGGER` clickable  |
| P0-01-C | O grupo do provider DeepSeek existe ou pode ser expandido                    | Prova que o modelo alvo vem do grupo correto do provider, e não de casamento errado por nome de modelo solto | `provider:${UPSTREAM_PROVIDER_ID}` group test id                                              |
| P0-01-D | O modelo alvo está visível na lista de modelos                               | Prova que a Model Selection View do Environment atual foi projetada no chat         | `TID_CHAT_MODEL_SELECT_ITEM` como test id exato, suportando custom encoded value                |
| P0-01-E | Após a seleção, o modelo atual na barra é o modelo alvo                     | Prova que a ação de escolha do usuário escreve na configuração atual do chat        | `assertSelectedUpstreamModel()` verifica currentValue/text/title                              |
| P0-01-F | Após o envio a caixa de entrada é limpa e a mensagem do usuário está visível | Prova que a estreia comum passa pela interação real do composer, sem perda de entrada | `waitForComposerText("")`、`waitForUserMessageContaining(marker)`                               |
| P0-01-G | É capturado o request principal DeepSeek contendo o marker deste envio       | Prova que a resposta do assistant não é falsificada localmente e que um request real ao provider foi emitido | `waitForUpstreamNetworkCapture(marker)`                                                       |
| P0-01-H | O prompt no body do request é igual à entrada do usuário                     | Prova que o contexto da estreia contém a mensagem correta do usuário                | `assertUpstreamRequestCapture({ expectedText: prompt })`                                      |
| P0-01-I | O body do request usa o modelo DeepSeek alvo                                 | Prova que o modelo selecionado na UI realmente influencia o request ao provider     | `assertUpstreamRequestCapture({ model: UPSTREAM_MODEL })`                                     |
| P0-01-J | Se o provider declara thought level, o request inclui o thought level atual  | Prova que a configuração de profundidade de pensamento é sincronizada ao request     | `assertUpstreamThoughtLevelCapture(captureRecord, UPSTREAM_THOUGHT_LEVEL)`                    |
| P0-01-K | A resposta do assistant contém o token combinado                             | Prova que a resposta de replay foi consumida e renderizada corretamente pela UI     | `waitForAssistantMessageContaining(E2E_REPLY_TOKEN)`                                          |
| P0-01-L | Após a primeira volta a session volta a idle e queue=0                      | Prova que o caminho da estreia fecha por completo, sem busy residual nem enfileiramento indevido | `waitForChatState(snapshot.state === "idle" && snapshot.queueCount === 0)`                    |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- O request principal da estreia é um fixture sintético `main`, cujo matcher deve conter `E2E_UPSTREAM_WORKSPACE_SMOKE` e excluir o prompt de geração de título e de compact summary.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

2026-07-02 reexecutado:

- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-upstream-workspace-smoke.test.ts`
  - Resultado: passou.
  - Observação: `upstream-workspace-smoke-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-upstream-workspace-smoke.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-upstream-workspace-smoke.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-104055-569/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-01-A a P0-01-L são cobertos pelas asserções do spec formal; o log de execução mostra `model_name=e2e-upstream/deepseek-v4-flash`、`model_provider=e2e-upstream`, com `state=idle` e `queueCount=0` finais.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-upstream-workspace-smoke.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-104133-542/summary.md`.
  - Conclusão: no caminho default de replay o mesmo conjunto de verificações de UI, request, resposta e estado final da session continua válido.

P0-01 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, reconfirmação após promoção". Esta case já está no caminho formal e a promoção não foi executada novamente.

## P0-02: adicionar custom provider pela página de configurações e selecionar e enviar pelo chat

### Definição do Case

| Campo            | Conteúdo                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `I08`                                                                                                                    |
| Spec             | `packages/desktop/test/e2e/conversation-session/conversation-session-model-provider-add-send.test.ts`                      |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-provider-add-send.json`         |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-provider-add-send.json`      |
| Estado atual     | Promovido, replay case no caminho formal                                                                                 |

### Cenário de Teste

No workspace local default do desktop, o usuário abre a página de configurações, adiciona um custom provider com nome único desta case e preenche o endpoint de replay do DeepSeek, a API Key e o modelo alvo. O diálogo de adicionar modelo tem todos os campos achatados: janela de contexto default 1.000.000, saída máxima default 128.000; tipo de entrada default e travado em Text, com Image/Video selecionáveis, enquanto Audio/PDF ainda não são exibidos; o tipo de saída é atualmente fixo em Text. Depois de informar o modelo alvo aparece o status de consulta ao catálogo e o preenchimento automático da saída máxima; o usuário escolhe Image, sobrescreve o valor preenchido e salva; depois que o provider é criado, ele reabre o diálogo de edição de modelo, desmarca Image e altera a saída máxima. Após salvar, volta ao chat, seleciona o novo modelo e faz a estreia.

Esta case valida o caminho positivo mais curto de "adicionar provider e configurar metadados de modelo na página de configurações -> persistência da configuração local -> sincronização do registry provider/model no chat -> request real ao provider". Catálogo sem correspondência, não declarado, com falha de consulta e resultado tardio são cobertos por testes unitários de interação; o E2E não trata o provider DeepSeek já pré-instalado no startup como adição, nem cobre remote, queue, stop, fork, falha de provider ou isolamento multi-session.

### Passos

1. Limpar e preparar o app data de E2E, iniciar o desktop no workspace local default.
2. Entrar na seção de provedores de modelo da página de configurações.
3. Clicar no item de navegação "Adicionar fornecedor personalizado".
4. Preencher nome único do provider, Base URL do replay DeepSeek e API Key.
5. Confirmar que todos os campos do diálogo de metadados do novo modelo estão achatados, com Context=1M e Max Output=128K; entrada Text e saída Text travados.
6. Informar o ID do modelo alvo, confirmando o loading durante a consulta, com a saída máxima ainda editável e o salvar desabilitado; aguardar o catálogo real preencher o Token de saída máxima e confirmar que Context continua 1M.
7. Selecionar Image, sobrescrever a saída máxima e enviar o draft do modelo; clicar em "Adicionar fornecedor" e aguardar o modal e os valores serem escritos na configuração local.
8. Reentrar no diálogo de edição de modelo, confirmando que Image e a saída máxima são reexibidos corretamente; desmarcar Image, alterar a saída máxima e enviar, aguardando novamente a persistência da configuração.
9. Voltar ao chat, abrir a lista de modelos e selecionar o modelo alvo sob o novo provider.
10. Enviar um texto comum com o marker `E2E_MODEL_PROVIDER_ADD_SEND`.
11. Aguardar a mensagem do usuário, a captura da requisição DeepSeek, a resposta do assistant e o estado final idle.

### Itens de Verificação

| Número  | Item de verificação                                                                                       | Nota de validade                                                      | Local atual da asserção                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| P0-02-A | O workspace local default está aberto e a view principal de chat é interativa                             | Prova que começa pela entrada real do desktop local                    | `waitForWorkspaceApp(DEFAULT_WORKSPACE)`                                                                 |
| P0-02-B | A seção de provedores de modelo da página de configurações é acessível                                | Prova que o usuário configura o provider pela UI real                  | `openModelProviderSettings()`                                                                            |
| P0-02-C | O formulário de novo custom provider permite preencher nome, Base URL e API Key                          | Prova que a entrada de adição da página de configurações funciona, sem depender de config pré-instalada | `setInputValueByIdDom(...)`                                                                              |
| P0-02-D | O diálogo de novo modelo não tem dobra "Avançado", todos os campos achatados; Context=1M, Max Output=128K    | Prova que os novos defaults e a arquitetura de informação achatada passam pela UI real | `assertFlatMetadataDefaults()`                                                                           |
| P0-02-E | Entrada Text vem selecionada e não pode ser desmarcada, Image/Video alternáveis, Audio/PDF não exibidos, saída apenas Text travado | Prova a seleção de tipos e a fronteira atual de saída              | `assertFlatMetadataDefaults()`、`setInputModalitySelected(...)`                                          |
| P0-02-F | Após informar o ID alvo fica pending/loading, a saída máxima continua editável mas salvar desabilitado; o catálogo real preenche a saída máxima e Context continua 1M | Prova o timing do catálogo, a prioridade da entrada do usuário e a proteção de submit | `setModelIdAndAssertCatalogPending(...)`、`waitForCatalogMaxOutputTokens(...)`                        |
| P0-02-G | Após o usuário escolher Image e sobrescrever o valor preenchido, o modelo pode ser enviado                | Prova o commit atômico dos metadados do modelo                        | `addModelThroughMetadataDialog(...)`、`clickModelMetadataSave()`                                         |
| P0-02-H | O novo provider persiste apiKey, endpoint, saída máxima, `input=[text,image]`, `output=[text]` e a marcação explícita de origem | Prova que o modal e a origem persistem de forma realmente fechada | `waitForCreatedProvider(...)`                                                                            |
| P0-02-I | O diálogo de edição reexibe achatados Image e a saída máxima; desmarcar Image, alterar a saída máxima e salvar | Prova que o modo Edit lê e atualiza os metadados existentes do modelo | `editModelMetadata(...)`、`clickModelMetadataSave()`                                                    |
| P0-02-J | O Token de saída máxima editado é persistido novamente                                                | Prova que o valor modificado usa o caminho de salvamento de provider existente | `waitForCreatedProvider(...)`                                                                            |
| P0-02-K | A lista de modelos do chat consegue exibir e selecionar o modelo sob o novo provider                      | Prova que o Registry do Environment atual foi atualizado e a Model Selection View funciona | `selectUpstreamProviderModelById(...providerId...)`                                                    |
| P0-02-L | O currentValue da barra mantém o id do novo provider                                                    | Prova que um modelo com o mesmo nome não degrada para casamento por nome de modelo solto | `assertSelectedAddedProviderModel(...)`                                                                  |
| P0-02-M | Após o envio a caixa de entrada é limpa e a mensagem do usuário está visível                               | Prova que a estreia comum passa pela interação real do composer         | `waitForComposerText("")`、`waitForUserMessageContaining(marker)`                                        |
| P0-02-N | É capturado o request principal DeepSeek contendo o marker deste envio                                    | Prova que a resposta do assistant vem de um request real ao provider    | `waitForUpstreamNetworkCapture(marker)`                                                                  |
| P0-02-O | O body do request usa o modelo alvo, a profundidade de pensamento atual e o Token de saída máxima editado | Prova que a configuração avançada do modelo chega ao request real de runtime | `assertUpstreamRequestCapture`、`assertUpstreamThoughtLevelCapture`、`readRequestNumber(..., "max_tokens")` |
| P0-02-P | A resposta do assistant contém o token combinado                                                        | Prova que a resposta de replay foi consumida corretamente pela UI        | `waitForAssistantMessageContaining(E2E_REPLY_TOKEN)`                                                     |
| P0-02-Q | Após a primeira volta a session volta a idle e queue=0                                                  | Prova que o caminho de estreia com novo provider fecha por completo    | `waitForChatState(snapshot.state === "idle" && snapshot.queueCount === 0)`                             |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- O request principal da estreia é um fixture sintético `main`, cujo matcher deve conter `E2E_MODEL_PROVIDER_ADD_SEND` e excluir o prompt de geração de título e de compact summary.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

2026-07-02 concluída a adição, a promoção e a verificação por replay:

- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-add-send.test.ts --reviewed`
  - Resultado: dry run passou.
  - Conclusão: a promoção move apenas o spec desta case, gera o provider fixture e o manifest desta case e reconhece o marker `E2E_MODEL_PROVIDER_ADD_SEND`.
- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-add-send.test.ts --reviewed --apply`
  - Resultado: passou.
  - Conclusão: o spec saiu de pending para o caminho formal `conversation-session/`.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-add-send.test.ts`
  - Resultado: passou.
  - Observação: `model-provider-add-send-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-provider-add-send.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-add-send.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-105033-078/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-02-A a P0-02-L são cobertos pelas asserções do spec formal; o log de execução mostra `modelCurrent=<id do novo provider>/deepseek-v4-flash`, com `state=idle` e `queueCount=0` finais.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-add-send.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-105059-157/summary.md`.
  - Conclusão: no caminho default de replay o mesmo conjunto de verificações de adição de provider na página de configurações, de identidade de provider no currentValue do modelo, de request, resposta e estado final da session continua válido; o log mostra `model_provider=<id do novo provider>`, provando que o request não voltou ao `e2e-upstream` pré-instalado.

P0-02 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

2026-07-25, após estender a capacidade de configuração avançada do modelo e promover novamente, verificação:

- O dry run da promoção e o `--apply` passaram; o spec foi movido para o caminho formal `conversation-session/` e o fixture case-local e o manifest existentes permanecem inalterados.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-model-provider-add-send.test.ts`
  - Resultado: passou; o contrato do common e do fixture case-local I08 está completo.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-provider-add-send.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-model-provider-add-send.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260724-180207-567/summary.md`.
  - Conclusão: P0-02-A a P0-02-Q são cobertos pelas asserções explícitas de replay do spec formal; o request real ao provider contém `max_tokens=64000`, igual ao valor do modelo editado.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-model-provider-add-send.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260724-180255-549/summary.md`.
  - Conclusão: no caminho de síntese de fixture formal default o mesmo conjunto de interações de campos avançados, persistência e contrato de request continua válido.
- A promoção para o caminho formal foi concluída nesta rodada; a admissão Docker não foi executada.

2026-08-21, após estender o modal achatado de configurações, verificação:

- `pnpm --filter @zcode/desktop typecheck:e2e`: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-model-provider-add-send.test.ts`: passou.
- Executando o spec formal com common + fixture case-local I08 carregados explicitamente: 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260821-034404-305/summary.md`.
  - Conclusão: a UI real cobriu o achatamento dos campos, os defaults 1M/128K, o travamento de Text, a seleção e desmarcação de Image, a persistência da origem do modal, a atualização do registry ativo e o request de estreia.
- Depois de ocultar Audio/PDF e ajustar o título para "tipo de entrada/tipo de saída", o replay formal default passou novamente: 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260821-051251-156/summary.md`.
  - Conclusão: o diálogo real de configurações só exibe tipos de entrada Text/Image/Video e tipo de saída fixo Text, e o salvamento, a sincronização do registry e o caminho de request de estreia existentes continuam válidos.
- Depois de remover a dica genérica que já conflitava com o fato da capacidade de anexos em Video, a execução com common + fixture case-local I08 explícitos passou novamente: 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260821-094323-479/summary.md`.
  - Evidência visual: `packages/desktop/.e2e-artifacts/model-settings-modality-help-removed-zh-dark.png`、`packages/desktop/.e2e-artifacts/model-settings-modality-help-removed-en-light.png`.
  - Conclusão: o diálogo real não renderiza mais a linha de dica; em chinês escuro e inglês claro o espaçamento dos grupos de tipo de entrada/saída, a quebra de linha dos botões e a altura do diálogo permanecem normais.

## P0-03: a lista de modelos do chat só exibe providers/models disponíveis

### Definição do Case

| Campo            | Conteúdo                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I09`                                                                                                                                 |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-list-filtering.test.ts`     |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-provider-list-filtering.json`               |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-provider-list-filtering.json`            |
| Estado atual     | pending; em 2026-08-25 foi expandido conforme a semântica da refatoração de Provider, aguardando replay real, review manual e promoção |

### Cenário de Teste

Na inicialização do workspace local default do desktop, a semente E2E fornece simultaneamente um provider disponível, um provider oculto, um provider visível com model oculto, um provider disabled/incomplete, além do `builtin:zai/glm-5.3` real e um Personal Overlay de mesma identidade. Quando o usuário abre a lista de modelos do chat, membros ocultos ou não executáveis não devem aparecer; quando Built-in e Personal têm o mesmo nome, o modelo Built-in deve continuar selecionável, executável e usar o Effective Endpoint após o Overlay para realizar o envio real.

Esta case cobre apenas "filtro de visibilidade da lista de modelos + modelo visível pode enviar". Não cobre adicionar provider na página de configurações, salvamento de provider, remote, queue, stop, edit/fork ou recuperação multi-session.

### Passos

1. Limpar e preparar o app data de E2E, iniciar o desktop no workspace local default.
2. O seed do WDIO injeta para este spec o provider DeepSeek disponível, o provider alt disponível, o provider oculto, o provider visível com model oculto, o provider disabled/incomplete e o Personal Overlay de `builtin:zai/glm-5.3`.
3. Abrir a lista de modelos do chat.
4. Verificar que o grupo do provider disponível e o item do modelo alvo existem.
5. Verificar que o provider oculto, os grupos e itens de provider disabled, sem API Key e sem endpoint não existem.
6. Expandir o provider visível e verificar que o companion model visível existe e o model oculto não existe.
7. Expandir `builtin:zai` e verificar que `glm-5.3` não foi isolado pelo Personal Overlay de mesma identidade.
8. Selecionar exatamente `builtin:zai/glm-5.3` e confirmar que a barra mantém a identidade composta de Provider/Model.
9. Enviar um texto comum com o marker `E2E_MODEL_PROVIDER_LIST_FILTER`.
10. Aguardar a captura do request, a resposta do assistant e o estado final idle, confirmando que o request usa `glm-5.3` e o Endpoint case-local após o Overlay.

### Itens de Verificação

| Número  | Item de verificação                                                          | Nota de validade                                                          | Local atual da asserção                                                        |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P0-03-A | O workspace local default está aberto e a view principal de chat é interativa | Prova que começa pela entrada real do desktop local                       | `prepareConversationE2E()`、`waitForWorkspaceApp(DEFAULT_WORKSPACE)`              |
| P0-03-B | O grupo do provider DeepSeek disponível existe                                | Prova que um provider normal não foi afetado indevidamente pelo filtro     | `assertModelListFiltering()`                                                      |
| P0-03-C | O companion model do provider visível existe e o hidden model não            | Prova que a visibilidade de model participa independentemente da projeção do menu | `assertModelListFiltering()`                                                      |
| P0-03-D | O grupo do provider alt disponível existe                                    | Prova que outro provider disponível do mesmo modelo mantém a identidade de provider | `assertModelListFiltering()`                                                      |
| P0-03-E | O hidden provider não é exibido                                              | Prova que a visibilidade de provider participa independentemente da projeção do menu | `assertModelListFiltering()`                                                      |
| P0-03-F | O provider disabled não é exibido                                            | Prova que `enabled=false` é filtrado pelo menu                            | `assertModelListFiltering()`                                                      |
| P0-03-G | O provider sem API Key não é exibido                                          | Prova que um provider que exige credenciais não entra na seleção do chat quando não está configurado | `assertModelListFiltering()`                              |
| P0-03-H | O provider sem endpoint não é exibido                                         | Prova que um provider sem endpoint enviopável não entra na seleção do chat | `assertModelListFiltering()`                                                      |
| P0-03-I | Com Built-in/Personal de mesma identidade, `builtin:zai/glm-5.3` continua exibido | Prova que o Personal Overlay não isola indevidamente um membro Built-in | `assertModelListFiltering()`                                                      |
| P0-03-J | Após a seleção o currentValue da barra mantém a identidade composta `builtin:zai/glm-5.3` | Prova que a ação de escolha não degrada para um modelId solto       | `assertSelectedProviderModel()`                                                   |
| P0-03-K | O request usa `glm-5.3` e acerta `/builtin-personal-conflict`               | Prova que o modelo Built-in executa conforme o Effective Provider Config  | `assertUpstreamRequestCapture()` e asserção de URL do request                       |
| P0-03-L | A resposta do assistant contém o token combinado e, após a primeira volta, idle com queue=0 | Prova que o caminho de envio do modelo visível após o filtro fecha por completo | `waitForAssistantMessageContaining()`、`waitForChatState()`         |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- O request principal da estreia é um fixture sintético `main`, cujo matcher deve conter `E2E_MODEL_PROVIDER_LIST_FILTER` e `/builtin-personal-conflict`, e excluir o prompt de geração de título e de compact summary.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

2026-08-25 esta case foi expandida conforme a visibilidade e a semântica de Overlay após a refatoração de Provider. A verificação do contrato de fixture e o typecheck do E2E passaram; o ambiente atual não tem Xvfb/Docker utilizáveis, portanto o replay real expandido, o review manual, a promoção e a admissão Docker não foram concluídos e a case deve continuar pending.

2026-07-02 concluída a adição, a promoção e a verificação por replay:

- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-list-filtering.test.ts --reviewed`
  - Resultado: dry run passou.
  - Conclusão: a promoção move apenas o spec desta case, gera o provider fixture e o manifest desta case e reconhece o marker `E2E_MODEL_PROVIDER_LIST_FILTER`.
- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-list-filtering.test.ts --reviewed --apply`
  - Resultado: passou.
  - Conclusão: o spec saiu de pending para o caminho formal `conversation-session/`.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-list-filtering.test.ts`
  - Resultado: passou.
  - Observação: `model-provider-list-filtering-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-provider-list-filtering.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-list-filtering.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-105836-007/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-03-A a P0-03-J são cobertos pelas asserções do spec formal; as amostras negativas de providers indisponíveis não vazaram para o menu, com `state=idle` e `queueCount=0` finais.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-list-filtering.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-110012-665/summary.md`.
  - Conclusão: no caminho default de replay o mesmo conjunto de verificações de filtro da lista de modelos, de identidade de provider, de request, resposta e estado final da session continua válido; o log de execução mostra `model_provider=e2e-upstream`, provando que o caminho de envio do modelo visível não foi quebrado pela lógica de filtro.

Os resultados acima de 2026-07-02 provam apenas a versão antiga da case e não servem como evidência verde das asserções expandidas em 2026-08-25.

## P0-04: trocar de modelo no rascunho vazio e a estreia usa o novo modelo

### Definição do Case

| Campo            | Conteúdo                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I10`                                                                                                                                 |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-draft-model-switch-first-send.test.ts`    |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-draft-model-switch-first-send.json`            |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-draft-model-switch-first-send.json`         |
| Estado atual     | Promovido, replay case no caminho formal                                                                                             |

### Cenário de Teste

Com o workspace local default do desktop aberto, o chat está em rascunho vazio e o provider DeepSeek contém simultaneamente o modelo primary e o secondary. Antes de enviar qualquer mensagem, o usuário troca na lista de modelos do chat do modelo atual para o secondary e seleciona a profundidade de pensamento correspondente ao secondary. Em seguida envia a primeira mensagem de texto comum.

Esta case valida o caminho mínimo de "a escolha de modelo no estado de rascunho é a configuração futura da session". Não cobre troca de modelo após histórico completed, consumo de queue em running, queue retida após stop, edit/fork nem remote.

### Passos

1. Limpar e preparar o app data de E2E, iniciar o desktop no workspace local default.
2. Garantir que o provider DeepSeek já contém o modelo secondary.
3. Criar um rascunho vazio novo e confirmar que não há session/task vinculada.
4. Selecionar o modelo secondary na lista de modelos do chat.
5. Selecionar a profundidade de pensamento do secondary na lista de profundidade de pensamento do chat.
6. Afirmar que o currentValue e o texto exibido da barra já estão na configuração do secondary.
7. Enviar um texto comum com o marker `E2E_DRAFT_MODEL_SWITCH_FIRST_SEND`.
8. Aguardar a mensagem do usuário, a captura da requisição DeepSeek, a resposta do assistant e o estado final idle.

### Itens de Verificação

| Número  | Item de verificação                                                            | Nota de validade                                                     | Local atual da asserção                                                                |
| ------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P0-04-A | O workspace local default está aberto e a view principal de chat é interativa   | Prova que começa pela entrada real do desktop local                  | `prepareConversationE2E()`、`waitForWorkspaceApp(DEFAULT_WORKSPACE)`                   |
| P0-04-B | O modelo secondary do DeepSeek já existe na configuração do provider           | Prova que o teste não seleciona um modelo não configurado            | `ensureUpstreamModelForE2E(UPSTREAM_SECONDARY_MODEL)`                                   |
| P0-04-C | Após criar, o estado é rascunho vazio, sem session/task vinculada              | Prova que a ação ocorre no rascunho antes do envio                   | `waitForChatState(taskId/sessionId === null)`                                           |
| P0-04-D | Após selecionar o secondary, o currentValue da barra mantém a identidade provider + model | Prova que a escolha de modelo escreve na configuração futura do rascunho, e não é apenas exibição de texto | `assertSelectedSecondaryConfig()`                       |
| P0-04-E | Após selecionar a profundidade do secondary, a barra exibe a configuração correspondente | Prova que a escolha de depth usada no request também é atualizada com a configuração do rascunho | `assertSelectedSecondaryConfig()`                       |
| P0-04-F | Após o envio a caixa de entrada é limpa e a mensagem do usuário está visível   | Prova que a estreia passa pela interação real do composer            | `waitForComposerText("")`、`waitForUserMessageContaining(marker)`                       |
| P0-04-G | É capturado o request principal DeepSeek contendo o marker deste envio        | Prova que a resposta do assistant vem de um request real ao provider | `waitForUpstreamNetworkCapture(marker)`                                                 |
| P0-04-H | O body do request usa o modelo secondary e a profundidade do secondary        | Prova que a troca no rascunho realmente influencia o request de runtime da estreia | `assertUpstreamRequestCapture`、`assertUpstreamThoughtLevelCapture` |
| P0-04-I | A resposta do assistant contém o token combinado                              | Prova que a resposta de replay foi consumida corretamente pela UI     | `waitForAssistantMessageContaining(E2E_REPLY_TOKEN)`                                    |
| P0-04-J | Após a primeira volta a session volta a idle e queue=0                        | Prova que o caminho de estreia com troca de modelo fecha por completo | `waitForChatState(snapshot.state === "idle" && snapshot.queueCount === 0)`              |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- O request principal da estreia é um fixture sintético `main`, cujo matcher deve conter `E2E_DRAFT_MODEL_SWITCH_FIRST_SEND` e excluir o prompt de geração de título e de compact summary.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

2026-07-02 concluída a adição, a promoção e a verificação por replay:

- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-draft-model-switch-first-send.test.ts --reviewed`
  - Resultado: dry run passou.
  - Conclusão: a promoção move apenas o spec desta case, gera o provider fixture e o manifest desta case e reconhece o marker `E2E_DRAFT_MODEL_SWITCH_FIRST_SEND`.
- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-draft-model-switch-first-send.test.ts --reviewed --apply`
  - Resultado: passou.
  - Conclusão: o spec saiu de pending para o caminho formal `conversation-session/`.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-draft-model-switch-first-send.test.ts`
  - Resultado: passou.
  - Observação: `draft-model-switch-first-send-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-draft-model-switch-first-send.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-draft-model-switch-first-send.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-110339-709/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-04-A a P0-04-J são cobertos pelas asserções do spec formal; o log de execução mostra `model_name=e2e-upstream/deepseek-v4-pro`、`model_provider=e2e-upstream`, com `state=idle` e `queueCount=0` finais.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-draft-model-switch-first-send.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-110404-195/summary.md`.
  - Conclusão: no caminho default de replay o mesmo conjunto de verificações do estado de rascunho vazio, do currentValue do modelo secondary, da profundidade do secondary, de request, resposta e estado final da session continua válido; o request não voltou ao primary `deepseek-v4-flash`.

P0-04 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

## P0-05: nova sessão herda a escolha de modelo anterior

### Definição do Case

| Campo            | Conteúdo                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I11`                                                                                                                              |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-new-session-inherits-model.test.ts`         |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-new-session-inherits-model.json`               |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-new-session-inherits-model.json`            |
| Estado atual     | Promovido, replay case no caminho formal                                                                                           |

### Cenário de Teste

No workspace local default do desktop, o usuário troca o modelo do chat para o secondary do DeepSeek e conclui uma conversa comum. Depois clica em nova tarefa, entra em rascunho vazio, não troca o modelo manualmente e envia diretamente o próximo texto comum.

Esta case valida que "a nova sessão herda a escolha mais recente de provider/model/thought do chat". Não cobre isolamento de configuração multi-session, queue, stop, edit/fork nem remote.

### Passos

1. Iniciar o desktop no workspace local default e garantir que o modelo secondary do DeepSeek existe.
2. No rascunho vazio, trocar para o modelo secondary e a profundidade do secondary.
3. Enviar um texto comum com o marker `E2E_NEW_SESSION_INHERITS_MODEL_A` e aguardar a conclusão.
4. Clicar em nova tarefa para entrar em rascunho vazio.
5. Sem selecionar o modelo manualmente, afirmar que a barra continua na configuração secondary.
6. Enviar um texto comum com o marker `E2E_NEW_SESSION_INHERITS_MODEL_B` e aguardar a conclusão.
7. Afirmar separadamente que os dois requests ao provider A/B usam o modelo secondary e a profundidade secondary, e que o estado final é idle com queue=0.

### Itens de Verificação

| Número  | Item de verificação                                                       | Nota de validade                                          | Local atual da asserção                                        |
| ------- | ------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| P0-05-A | O modelo secondary existe e pode ser selecionado no primeiro rascunho      | Prova que a configuração de origem da herança existe de fato | `ensureUpstreamModelForE2E`、`selectUpstreamModelById`          |
| P0-05-B | O request do primeiro envio usa a configuração secondary                   | Prova que a origem da herança não é uma ilusão da barra      | `assertSecondaryUpstreamConfig(recordA, promptA)`               |
| P0-05-C | Após criar a tarefa o estado é rascunho vazio e a barra continua secondary  | Prova que o novo rascunho herda a escolha mais recente       | `waitForEmptyDraft()`、`assertSelectedSecondaryConfig()`        |
| P0-05-D | O segundo envio direto usa a configuração secondary                       | Prova que a configuração herdada realmente influencia o request de runtime | `assertSecondaryUpstreamConfig(recordB, promptB)`  |
| P0-05-E | Após os dois envios ambos voltam a idle com queue=0                       | Prova que o caminho de herança fecha por completo          | `waitForIdleQueueEmpty()`                                       |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- Os dois envios comuns compartilham um fixture sintético `main`, cujo matcher deve conter `E2E_NEW_SESSION_INHERITS_MODEL`, com `maxMatches=2`.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

2026-07-02 concluída a adição, a promoção e a verificação por replay:

- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-new-session-inherits-model.test.ts --reviewed`
  - Resultado: dry run passou.
  - Conclusão: a promoção gera o provider fixture e o manifest desta case e reconhece os markers `E2E_NEW_SESSION_INHERITS_MODEL_A/B`.
- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-new-session-inherits-model.test.ts --reviewed --apply`
  - Resultado: passou.
  - Conclusão: o spec saiu de pending para o caminho formal `conversation-session/`.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-new-session-inherits-model.test.ts`
  - Resultado: passou.
  - Observação: `new-session-inherits-model-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-new-session-inherits-model.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-new-session-inherits-model.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-110744-702/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-05-A a P0-05-E são cobertos pelas asserções do spec formal; os dois requests A/B usam `model_name=e2e-upstream/deepseek-v4-pro`, com `state=idle` e `queueCount=0` finais.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-new-session-inherits-model.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-110810-218/summary.md`.
  - Conclusão: no caminho default de replay as asserções de UI e de request da herança de provider/model/thought secondary em um rascunho vazio novo continuam válidas.

P0-05 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

## P0-06: isolamento de configuração de provider/model entre múltiplas sessions

### Definição do Case

| Campo            | Conteúdo                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `I12`                                                                                                                                    |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-session-isolation.test.ts`  |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-provider-session-isolation.json`            |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-provider-session-isolation.json`         |
| Estado atual     | Promovido, replay case no caminho formal                                                                                                 |

### Cenário de Teste

No workspace local default do desktop o usuário cria duas sessions comuns: a Session A conclui uma volta usando o modelo primary do DeepSeek e a profundidade primary; a Session B conclui uma volta usando o modelo secondary e a profundidade secondary. Em seguida o usuário volta a A/B respectivamente e continua enviando texto comum.

Esta case valida que "as configurações de provider/model/thought de sessions diferentes na mesma janela local ficam isoladas entre si". Não cobre concorrência em running, queue, stop, remote nem herança de novo rascunho.

### Passos

1. Iniciar o desktop no workspace local default e garantir que o modelo secondary do DeepSeek existe.
2. No rascunho vazio da Session A, selecionar o modelo primary e a profundidade primary, enviar a primeira volta de A e aguardar a conclusão.
3. Criar a Session B, selecionar o modelo secondary e a profundidade secondary, enviar a primeira volta de B e aguardar a conclusão.
4. Voltar para a Session A, afirmar que a barra restaura a configuração primary e enviar o follow-up de A.
5. Voltar para a Session B, afirmar que a barra restaura a configuração secondary e enviar o follow-up de B.
6. Afirmar separadamente que os quatro requests ao provider usam o modelo e a profundidade da session correspondente, e que o estado final é idle com queue=0.

### Itens de Verificação

| Número  | Item de verificação                                                | Nota de validade                                                 | Local atual da asserção                          |
| ------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------- |
| P0-06-A | O request da primeira volta de A usa a configuração primary       | Prova que a configuração inicial da session A foi realmente escrita no runtime | `assertUpstreamConfig(recordA, primary)`   |
| P0-06-B | O request da primeira volta de B usa a configuração secondary     | Prova que a configuração de B difere de A e foi realmente escrita no runtime | `assertUpstreamConfig(recordB, secondary)` |
| P0-06-C | Ao voltar para A a barra restaura a configuração primary          | Prova que a restauração da UI é por session, e não pela escolha global mais recente | `assertSelectedUpstreamConfig(primary)` |
| P0-06-D | O follow-up de A continua usando a configuração primary            | Prova que a escolha secondary de B não contaminou A             | `assertUpstreamConfig(recordAFollow, primary)`    |
| P0-06-E | Ao voltar para B a barra restaura a configuração secondary        | Prova que a configuração da session B mantém a identidade de provider/model | `assertSelectedUpstreamConfig(secondary)` |
| P0-06-F | O follow-up de B continua usando a configuração secondary          | Prova que a restauração de A e o envio seguinte não contaminaram B | `assertUpstreamConfig(recordBFollow, secondary)` |
| P0-06-G | Após cada volta, idle com queue=0                                 | Prova que o caminho de isolamento não deixou busy residual nem enfileiramento indevido | `waitForIdleQueueEmpty()` |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- Os quatro envios comuns A/B/A-follow/B-follow têm cada um um fixture sintético `main`, cujo matcher contém exatamente o marker `E2E_MODEL_PROVIDER_SESSION_ISOLATION_*` correspondente.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

2026-07-02 concluída a adição, a promoção e a verificação por replay:

- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-session-isolation.test.ts --reviewed`
  - Resultado: dry run passou.
  - Conclusão: a promoção gera o provider fixture e o manifest desta case e reconhece os quatro markers A/B/A-follow/B-follow.
- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-session-isolation.test.ts --reviewed --apply`
  - Resultado: passou.
  - Conclusão: o spec saiu de pending para o caminho formal `conversation-session/`.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-session-isolation.test.ts`
  - Resultado: passou.
  - Observação: `model-provider-session-isolation-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-provider-session-isolation.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-session-isolation.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-111128-713/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-06-A a P0-06-G são cobertos pelas asserções do spec formal; A/A-follow usam primary e B/B-follow usam secondary, com `state=idle` e `queueCount=0` finais.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-provider-session-isolation.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-111200-772/summary.md`.
  - Conclusão: no caminho default de replay o mesmo conjunto de asserções de isolamento de provider/model/thought entre sessions A/B continua válido. Na fase de encerramento apareceu um log de timeout de context id do `electron-service:bridge`, mas o resultado do spec foi passed e não afetou as asserções de produto.

P0-06 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

## P0-07: após trocar entre providers, o request usa o modelo do provider alternativo

### Definição do Case

| Campo            | Conteúdo                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `I13`                                                                                                                                |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-same-model-provider-identity.test.ts`        |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-same-model-provider-identity.json`              |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-same-model-provider-identity.json`           |
| Estado atual     | Já promovido para o caminho formal, com replay strict/default concluído                                                            |

### Cenário de Teste

A semente E2E local do desktop fornece simultaneamente o provider DeepSeek primary e o provider DeepSeek alternate. O primary expõe `deepseek-v4-flash` e o alternate expõe `deepseek-v4-pro`. O usuário seleciona no chat `deepseek-v4-pro` sob o alternate provider e envia o primeiro texto comum.

Esta case valida que "escolher entre providers realmente muda o modelo do request ao provider". O `data-model-current-value` do chat afirma exatamente a identidade do alternate provider, e a captura de rede afirma que o `model` no body deve ser `deepseek-v4-pro`, evitando assim uma prova fraca obtida apenas com a mesma URL e o mesmo nome de modelo.

### Passos

1. Iniciar o desktop no workspace local default.
2. Abrir a lista de modelos do chat e selecionar `deepseek-v4-pro` sob o alternate provider.
3. Afirmar que o currentValue da barra é o valor provider-backed do alternate provider + `deepseek-v4-pro`.
4. Enviar um texto comum com o marker `E2E_SAME_MODEL_PROVIDER_IDENTITY`.
5. Afirmar novamente que a barra mantém a identidade do alternate provider.
6. Afirmar que o body do request ao provider usa `deepseek-v4-pro` em vez do `deepseek-v4-flash` do primary provider, que a resposta do assistant é normal e que o estado final é idle com queue=0.

### Itens de Verificação

| Número  | Item de verificação                                                                 | Nota de válida                                                                                          | Local atual da asserção                                          |
| ------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P0-07-A | `deepseek-v4-pro` sob o alternate provider pode ser selecionado                     | Prova que o menu mostra o modelo do alternate provider, e não o `deepseek-v4-flash` do primary provider | `selectUpstreamProviderModelById(...)`                           |
| P0-07-B | Antes do envio o currentValue mantém o id do alternate provider + `deepseek-v4-pro` | Prova que nem a identidade do provider nem o modelo degradaram                                         | `assertSelectedAlternateProviderModel()`                         |
| P0-07-C | Após o envio o currentValue ainda mantém o id do alternate provider + `deepseek-v4-pro` | Prova que a configuração não foi sobrescrita pelo primary depois de criar a session                 | `assertSelectedAlternateProviderModel()`                         |
| P0-07-D | O request de estreia usa `deepseek-v4-pro` e contém a entrada do usuário             | Prova que a escolha entre providers realmente influencia o modelo do request de runtime               | `assertUpstreamRequestCapture`                                   |
| P0-07-E | O assistant responde e volta a idle com queue=0                                    | Prova que o caminho fecha por completo                                                                 | `waitForAssistantMessageContaining`、`waitForChatState`          |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- O request principal da estreia é um fixture sintético `main`, cujo matcher deve conter `E2E_SAME_MODEL_PROVIDER_IDENTITY`; a asserção do request é responsável por validar `model=deepseek-v4-pro`.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-same-model-provider-identity.test.ts --reviewed`
  - Resultado: dry-run passou, o pending spec pode ser promovido.
- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-same-model-provider-identity.test.ts --reviewed --apply`
  - Resultado: passou; spec, manifest de fixture e provider fixture foram movidos para o caminho formal.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-same-model-provider-identity.test.ts`
  - Resultado: passou.
  - Observação: `same-model-provider-identity-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-same-model-provider-identity.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-same-model-provider-identity.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-125933-021/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, o currentValue do alternate provider mantém exatamente `e2e-upstream-alt/deepseek-v4-pro`; o log de execução mostra `model_name=e2e-upstream-alt/deepseek-v4-pro`、`model_provider=e2e-upstream-alt`, e o body do request é afirmarado pelo spec com `model=deepseek-v4-pro`.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-same-model-provider-identity.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-130000-917/summary.md`.
  - Conclusão: no caminho default de replay as asserções de identidade de provider, de request `deepseek-v4-pro`, de resposta do assistant e de fechamento em idle continuam válidas; o log de execução também mostra `model_name=e2e-upstream-alt/deepseek-v4-pro`、`model_provider=e2e-upstream-alt`.

P0-07 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

## P0-08: trocar de modelo antes do consumo da queue em running, o auto drain usa a configuração de provider mais recente

### Definição do Case

| Campo            | Conteúdo                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `N02`、`I03`                                                                                                               |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts`       |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-switch-queue.json`               |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-queue.json`            |
| Estado atual     | Já está no caminho formal, com fixture check e replay strict/default concluídos nesta rodada                             |

### Cenário de Teste

O request da primeira volta de uma sessão local do desktop permanece em streaming, e o usuário continua digitando um segundo texto no estado running, formando uma queue. Antes que o item da queue seja consumido, o usuário troca no chat para o modelo secondary e o thought level secondary. O request in-flight da primeira volta não deve ser reescrito; o novo request iniciado pelo auto drain do item da queue deve usar a configuração de modelo mais recente daquela session.

### Passos

1. Iniciar o desktop no workspace local default.
2. Selecionar o modelo primary e o thought level primary.
3. Enviar um request de fluxo lento com `E2E_MODEL_SWITCH_QUEUE_RUNNING`, entrando de forma estável em streaming.
4. Digitar um segundo texto comum com `E2E_MODEL_SWITCH_QUEUE_AUTO_DRAIN`, confirmando a entrada na queue.
5. Antes do consumo da queue, trocar para o modelo secondary e o thought level secondary.
6. Aguardar o auto drain da queue.
7. Afirmar que o request enfileirado usa o modelo secondary e o thought level secondary, com estado final idle e queue=0.

### Itens de Verificação

| Número  | Item de verificação                                       | Nota de validade                                          | Local atual da asserção                                       |
| ------- | --------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| P0-08-A | A primeira volta em running permanece em streaming        | Cria de forma estável a janela de troca antes do consumo da queue | `waitForChatState(state === "streaming")`            |
| P0-08-B | O segundo texto entra na queue                            | Prova que o request seguinte não é enviado diretamente     | `waitForQueueContaining`、`waitForQueueCount(1)`               |
| P0-08-C | Após trocar para secondary model/thought a queue é consumida | Prova que a troca de modelo não trava a queue local      | `waitForChatState(queueCount === 0)`                            |
| P0-08-D | O request enfileirado usa o modelo secondary             | Prova que o turno enfileirado lê a configuração mais recente da session | `assertUpstreamRequestCapture`                  |
| P0-08-E | O request enfileirado usa o thought level secondary       | Prova que os parâmetros do provider não atualizam apenas o nome do modelo | `assertUpstreamThoughtLevelCapture`          |
| P0-08-F | Estado final idle com queue=0                             | Prova que o caminho fecha por completo                    | `waitForChatState(state === "idle" && queueCount === 0)`       |

### Contrato do Fixture

- `upstream-model-switch-queue-running-slow` é um fixture sintético de controlled-stream, usado para estabilizar a janela de running.
- `upstream-model-switch-queue-auto-drain-secondary` é a resposta fixa do turno enfileirado; as asserções de negócio estão no model/thought da captura do request.
- `upstream-model-switch-slow-marker-contract` é usado apenas para o fixture checker cobrir o marker genérico de fluxo lento.

### Conclusões Reais de Verificação

- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts`
  - Resultado: passou.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-queue.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts'`
  - Resultado: passou, 1 spec / 2 cases passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-111816-458/summary.md`.
  - Conclusão: no replay strict passou `running 中 queued text 消费前切模型，auto drain 应使用 secondary 配置`; o turno enfileirado usa modelo/thought secondary, com idle e queue=0 finais.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts'`
  - Resultado: passou, 1 spec / 2 cases passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-112016-248/summary.md`.
  - Conclusão: no caminho default de replay a asserção de troca de modelo no auto-drain continua válida.

P0-08 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

## P0-09: após stop, trocar o modelo da queue retida e enviar imediatamente usa a configuração de provider mais recente

### Definição do Case

| Campo            | Conteúdo                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `M07h`、`N02`、`I03`                                                                                                       |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts`       |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-switch-queue.json`               |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-queue.json`            |
| Estado atual     | Já está no caminho formal, com fixture check e replay strict/default concluídos nesta rodada                             |

### Cenário de Teste

O request da primeira volta de uma sessão local do desktop permanece em streaming; o usuário digita um segundo texto formando uma queue e clica em stop. Após o stop o item da queue continua retido e não deve disparar requests escondidos. O usuário troca para o modelo secondary e o thought level secondary e então clica em "Enviar agora" no primeiro item da fila. O item clicado deve ser enviado com a configuração secondary mais recente.

### Passos

1. Iniciar o desktop no workspace local default.
2. Selecionar o modelo primary e o thought level primary.
3. Enviar um request de fluxo lento com `E2E_MODEL_SWITCH_HELD_RUNNING`, entrando de forma estável em streaming.
4. Digitar um segundo texto comum com `E2E_MODEL_SWITCH_HELD_SEND_NOW`, confirmando a entrada na queue.
5. Clicar em stop, confirmando a saída de streaming e que a queue foi preservada.
6. Numa janela curta, confirmar que o marker retido não foi enviado antecipadamente.
7. Trocar para o modelo secondary e o thought level secondary.
8. Clicar em "Enviar agora" no primeiro item da fila.
9. Afirmar que o request de envio imediato usa o modelo secondary e o thought level secondary.

### Itens de Verificação

| Número  | Item de verificação                                       | Nota de validade                                              | Local atual da asserção                                   |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| P0-09-A | A primeira volta em running permanece em streaming        | Cria de forma estável a janela de stop + queue retida        | `waitForChatState(state === "streaming")`                   |
| P0-09-B | O segundo texto entra na queue                            | Prova que existe um item retido                              | `waitForQueueContaining`、`waitForQueueCount(1)`            |
| P0-09-C | Após o stop sai de streaming e a queue é preservada        | Prova que o stop não apagou a queue indevidamente           | `waitForChatState(state !== "streaming" && queueCount === 1)` |
| P0-09-D | O marker retido não dispara request antes do stop concluído | Prova que o consumo precisa ser disparado por "Enviar agora" | `expectNoUpstreamRequestForTextWithin`                       |
| P0-09-E | O "Enviar agora" do primeiro item consome o item correto    | Prova que não se consumiu o item errado da fila              | `clickFirstQueueSendNow()` com asserção do conteúdo retornado |
| P0-09-F | O request de envio imediato usa secondary model/thought    | Prova que o envio imediato lê a configuração mais recente da session | `assertSecondaryUpstreamConfig`                     |

### Contrato do Fixture

- `upstream-model-switch-held-running-slow` é um fixture sintético de controlled-stream, usado para estabilizar a queue antes do stop.
- `upstream-model-switch-held-send-now-secondary` é a resposta fixa do turno de envio imediato; as asserções de negócio estão no model/thought da captura do request.
- O mesmo spec cobre simultaneamente P0-08 e P0-09, e o replay strict deve depender apenas de common + `conversation-session-model-switch-queue.json`.

### Conclusões Reais de Verificação

- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts`
  - Resultado: passou.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-queue.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts'`
  - Resultado: passou, 1 spec / 2 cases passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-111816-458/summary.md`.
  - Conclusão: no replay strict passou `stop 后 held queue 切模型再立即发送，应使用 secondary 配置`; o marker retido não disparou request antecipadamente após o stop e, após clicar em "Enviar agora", usou modelo/thought secondary.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-queue.test.ts'`
  - Resultado: passou, 1 spec / 2 cases passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-112016-248/summary.md`.
  - Conclusão: no caminho default de replay a asserção de troca de modelo no envio imediato da queue retida continua válida.

P0-09 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

## P0-10: trocar de modelo após completed, edit/fork e requests seguintes usam a configuração de provider mais recente

### Definição do Case

| Campo            | Conteúdo                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `N03`、`N04`                                                                                                                   |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-edit-fork.test.ts`      |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-model-switch-edit-fork.json`              |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-edit-fork.json`           |
| Estado atual     | Já promovido para o caminho formal, com replay strict/default concluído                                                       |

### Cenário de Teste

Uma sessão local do desktop já está completed e o usuário, na mesma session, troca para o modelo secondary e o thought level secondary. Em seguida executa duas operações frequentes sobre o histórico:

1. Editar uma query antiga do usuário e enviar de novo.
2. Fazer fork de uma mensagem do assistant já concluída e enviar um follow-up na session derivada.

Esta case valida que as operações de histórico concluído usam a "configuração de provider da session no momento da ação", e não a configuração primary original do momento em que a mensagem foi criada.

### Passos

1. Iniciar o desktop no workspace local default.
2. Selecionar o modelo primary e o thought level primary, enviar `E2E_MODEL_SWITCH_EDIT_SOURCE` e aguardar completed.
3. Trocar para o modelo secondary e o thought level secondary.
4. Editar a query antiga do usuário para `E2E_MODEL_SWITCH_EDIT_RERUN`; após enviar, afirmar que o request de reenvio usa a configuração secondary.
5. Criar uma nova tarefa, selecionar a configuração primary, enviar `E2E_MODEL_SWITCH_FORK_SOURCE` e aguardar completed.
6. Trocar para a configuração secondary e clicar no fork da mensagem do assistant.
7. Aguardar a session derivada ficar idle com queue=0 e enviar `E2E_MODEL_SWITCH_FORK_FOLLOWUP`.
8. Afirmar que o request de follow-up após o fork usa a configuração secondary.

### Itens de Verificação

| Número  | Item de verificação                                                     | Nota de validade                                                 | Local atual da asserção                                       |
| ------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| P0-10-A | O edit source conclui com a configuração primary                        | Estabelece a linha de base do histórico concluído                | source capture + completed state                               |
| P0-10-B | Após completed a barra pode trocar para secondary model/thought          | Prova que a configuração da session foi atualizada antes da ação | `expectToolbarConfig`                                          |
| P0-10-C | O request de reenvio do edit usa o modelo secondary                     | Prova que o edit não reusa o snapshot de modelo do turno antigo  | `assertUpstreamRequestCapture`                                 |
| P0-10-D | O request de reenvio do edit usa o thought level secondary              | Prova que os parâmetros do provider são atualizados com a configuração | `assertUpstreamThoughtLevelCapture`                  |
| P0-10-E | Após o fork a session derivada fica idle com queue=0                    | Prova que o fork não copia a queue do pai nem continua a task original | `waitForChatState`                                    |
| P0-10-F | A barra da session derivada do fork herda a configuração secondary      | Prova que o fork herda a configuração atual da session            | `expectToolbarConfig`                                          |
| P0-10-G | O request de follow-up do fork usa secondary model/thought              | Prova que os requests seguintes da session derivada usam a configuração herdada | `assertUpstreamRequestCapture`、`assertUpstreamThoughtLevelCapture` |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- O ramo de edit contém os dois main fixtures `edit-source` e `edit-rerun-secondary`.
- O ramo de fork contém os dois main fixtures `fork-source` e `fork-followup-secondary`.
- Os matchers de fixture devem distinguir source/rerun/follow-up com markers diferentes, evitando que o fixture de source-take o lugar do rerun ou do follow-up.

### Conclusões Reais de Verificação

- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-edit-fork.test.ts --reviewed`
  - Resultado: dry-run passou, o pending spec pode ser promovido.
- `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-edit-fork.test.ts --reviewed --apply`
  - Resultado: passou; spec, manifest de fixture e provider fixture foram movidos para o caminho formal.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-edit-fork.test.ts`
  - Resultado: passou.
  - Observação: `model-switch-edit-fork-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-model-switch-edit-fork.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-edit-fork.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-112609-771/summary.md`.
  - Conclusão: no replay strict o edit rerun e o fork follow-up usam secondary model/thought; a session derivada do fork fica idle com queue=0.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-model-switch-edit-fork.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-112643-403/summary.md`.
  - Conclusão: no caminho default de replay as asserções de edit/fork com troca de modelo após completed continuam válidas.

P0-10 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real, promoção e reconfirmação após a promoção". A admissão Docker não é executada nesta rodada, conforme combinado.

## P0-11: campos de request do nível de raciocínio do GLM-5.2 OpenAI-compatible

### Definição do Case

| Campo            | Conteúdo                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I14`                                                                                                                                 |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-glm52-reasoning-request-shape.test.ts`    |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-glm52-reasoning-request-shape.json`            |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-glm52-reasoning-request-shape.json`         |
| Estado atual     | Promovido, replay case no caminho formal                                                                                              |

### Cenário de Teste

No workspace local default do desktop o usuário adiciona um custom provider OpenAI-compatible com model ID `GLM-5.2`, Base URL apontando para o servidor de replay local e API Key dummy de E2E. O usuário volta ao chat, seleciona `GLM-5.2` sob esse provider na lista de modelos, primeiro escolhe o nível de raciocínio `max` e envia texto comum; após a primeira volta, o usuário muda o nível para `nothink` e envia um segundo texto comum.

Esta case valida que a intensidade de raciocínio do GLM-5.2 é mapeada diretamente para o `reasoning_effort` de topo, com o nível de UI `nothink` mapeado para o valor de provider `none`. Ela cobre apenas o contrato positivo "escolha na UI -> configuração da session -> agent providerOptions -> request body OpenAI-compatible", sem verificar a disponibilidade real do serviço online BigModel/Z.AI e sem cruzar com queue, stop, edit/fork, remote ou compact.

### Passos

1. Limpar e preparar o app data de E2E, iniciar o desktop no workspace local default.
2. Adicionar um custom provider pela página de configurações, escolhendo o formato de API `openai-chat-completions` e o modelo `GLM-5.2`.
3. Voltar ao chat, abrir a lista de modelos e selecionar `GLM-5.2` sob o novo provider.
4. Selecionar o nível de raciocínio `max`.
5. Enviar um texto comum com o marker `E2E_GLM52_REASONING_MAX` e aguardar a resposta.
6. Selecionar o nível de raciocínio `nothink`.
7. Enviar um texto comum com o marker `E2E_GLM52_REASONING_NOTHINK` e aguardar a resposta.

### Itens de Verificação

| Número  | Item de verificação                                                                                | Nota de validade                                                            | Local atual da asserção                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P0-11-A | O novo provider é salvo no formato OpenAI-compatible / Chat Completions e contém o modelo `GLM-5.2` | Prova que o fato de provider prévio da case está correto, e que não há uso indevido do provider DeepSeek/Anthropic default | `createCustomGlm52Provider()` lendo o provider store e validando `apiFormat`, endpoint, model |
| P0-11-B | A lista de modelos do chat consegue selecionar `GLM-5.2` pela identidade do novo provider         | Prova que a escolha do modelo vem do provider alvo, e não de um nome de modelo solto ou de outro provider | `selectUpstreamProviderModelById(...providerId...)` + `assertSelectedGlm52Model()` |
| P0-11-C | Após escolher `max`, o nível atual na barra/store é `max`                                              | Prova que a configuração da session já foi atualizada para o nível alvo antes do envio | `assertSelectedThoughtLevel("max")`                                                     |
| P0-11-D | O request de estreia com `max` usa o path `/chat/completions`, com `model=GLM-5.2` no body e o marker do usuário | Prova que o request passa pelo transporte OpenAI-compatible Chat Completions e que o prompt não foi perdido | `assertUpstreamRequestCapture`、`assertGlm52MaxRequest`  |
| P0-11-E | O request de estreia com `max` escreve `reasoning_effort=max` de topo                                  | Prova que o nível de profundidade do GLM-5.2 é mapeado para o campo correto visível ao provider | `assertGlm52MaxRequest`                                                                |
| P0-11-F | A resposta do assistant da primeira volta com `max` é visível e conclui com `idle && queue=0`        | Prova que a resposta de replay foi consumida pela UI e que o caminho fecha por completo | `waitForAssistantMessageContaining`、`waitForChatState` |
| P0-11-G | Após mudar para `nothink`, o nível atual na barra/store é `nothink`                                  | Prova que desligar o raciocínio não é só um item de menu visível, mas uma escrita real de configuração | `assertSelectedThoughtLevel("nothink")`   |
| P0-11-H | O request seguinte com `nothink` continua usando o mesmo provider/model e o body contém o segundo marker do usuário | Prova que, após completed na mesma session, trocar o nível só afeta os requests seguintes e não perde a identidade de provider | `assertUpstreamRequestCapture`、`assertGlm52NoThinkRequest` |
| P0-11-I | O request com `nothink` escreve `reasoning_effort=none` de topo e não deixa resíduo `max/high`        | Prova que o nível desligado na UI é mapeado para o `none` canônico do provider | `assertGlm52NoThinkRequest`                                                            |
| P0-11-J | A resposta do assistant da segunda volta é visível e conclui com `idle && queue=0`                   | Prova que o request sem raciocínio também completa por completo, sem busy residual nem queue | `waitForAssistantMessageContaining`、`waitForChatState` |

### Contrato do Fixture

- O request de geração de título usa uma resposta sintética `common` e, ao mesmo tempo, o matcher valida que o title sidecar do GLM-5.2 escreve `reasoning_effort=none` de topo e não contém `extra_body`, `chat_template_kwargs` ou `thinking`.
- Os dois requests principais, `max` e `nothink`, têm cada um um fixture sintético `main`, cujos matchers contêm respectivamente `E2E_GLM52_REASONING_MAX` e `E2E_GLM52_REASONING_NOTHINK`.
- A resposta principal usa o formato SSE de OpenAI Chat Completions, evitando poluir a semântica de transporte com respostas rápidas em SSE de Anthropic Messages.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

#### Registros históricos de verificação (2026-07-02, contrato antigo de wrapper)

Os registros abaixo correspondem à implementação anterior à mudança para campos diretos canônicos e são mantidos apenas como evidência histórica:

- `pnpm --filter @zcode/adapters test -- tests/runner-options.test.ts`
  - Resultado: passou, 40 test files passed, 540 tests passed, 2 skipped.
  - Conclusão: o teste unitário de adapter acrescentado reproduziu primeiro o problema de que `openaiCompatible.extra_body` não entrava no namespace de provider do SDK OpenAI-compatible; após a correção ficou provado que os providerOptions de nível de request do GLM-5.2 preservam `openaiCompatible` e são copiados para o namespace de provider que o SDK realmente lê.
- `pnpm --filter @zcode/adapters build && pnpm --filter @zcode/cli build`
  - Resultado: passou.
  - Conclusão: o E2E do desktop usa `apps/zcode-cli/packages/cli/dist/zcode.cjs`, então é preciso reconstruir o bundle do agent para que o replay formal valide o comportamento mais recente do adapter.
- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-glm52-reasoning-request-shape.test.ts`
  - Resultado: passou.
  - Observação: `glm52-reasoning-request-shape-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-glm52-reasoning-request-shape.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-glm52-reasoning-request-shape.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-142931-535/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-11-A a P0-11-J são cobertos pelas asserções do spec formal; o body da request `max` realmente contém `extra_body.chat_template_kwargs.reasoning_effort=max`, o body `nothink` realmente contém `extra_body.chat_template_kwargs.enable_thinking=false` e não deixa resíduo `reasoning_effort=max/high`, e ambas as voltas voltam a `idle` com `queueCount=0`.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-glm52-reasoning-request-shape.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-142959-372/summary.md`.
  - Conclusão: no caminho default de replay o mesmo conjunto de verificações continua válido: novo provider OpenAI-compatible, identidade de provider do GLM-5.2, campos de request `max`/`nothink`, resposta do assistant e estado final da session.
- `E2E_SPEC=./test/e2e/conversation-session/manual-review/pending/conversation-session-glm52-reasoning-request-shape.test.ts pnpm run test:e2e:container`
  - Resultado: não concluído, o Docker build deu timeout de TLS handshake ao baixar `docker.io/docker/dockerfile:1.7`.
  - Conclusão: é um problema de rede do Docker Hub, ignorado conforme combinado nesta rodada; não foi tratado como falha de comportamento da case.

#### Regressão atual de campos diretos (2026-07-22)

- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-glm52-reasoning-request-shape.test.ts`
  - Resultado: passou.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-glm52-reasoning-request-shape.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-glm52-reasoning-request-shape.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-124706-346/summary.md`.
  - Conclusão: P0-11-A a P0-11-J são cobertos pelas asserções do spec atual; os requests principais `max` / `nothink`
    geram respectivamente `reasoning_effort=max` / `reasoning_effort=none` de topo, e o title sidecar gera
    `reasoning_effort=none`; nenhum dos três contém `extra_body` ou `chat_template_kwargs`, e ambas as voltas
    de requests principais terminam em `idle && queueCount=0`.

P0-11 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real e reconfirmação após a promoção". Esta case já está no caminho formal; a admissão Docker não é executada por enquanto por causa do problema de rede.

## P0-12: campos de request do nível de raciocínio do DeepSeek V4 OpenAI-compatible

### Definição do Case

| Campo            | Conteúdo                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `I15`                                                                                                                                      |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-deepseek-v4-reasoning-request-shape.test.ts` |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.json`         |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.json`          |
| Estado atual     | Promovido, replay case no caminho formal                                                                                                   |

### Cenário de Teste

No workspace local default do desktop o usuário adiciona um custom provider DeepSeek OpenAI-compatible local à case, com modelo alvo `deepseek-v4-flash`, Base URL apontando para o servidor de replay local e API Key dummy de E2E. O registro de modelo salvo pelo formulário não carrega metadados de reasoning; o usuário seleciona o modelo sob esse provider na lista de modelos do chat e faz a estreia com o default `max` do Agent resolver. Depois que a primeira volta conclui e a projeção da sessão é estabelecida, o usuário muda o nível de raciocínio para `high` e envia um segundo texto comum.

Esta case valida que a intensidade de raciocínio do DeepSeek V4 é um parâmetro de provider no request de Chat Completions OpenAI-compatible: o valor de profundidade é escrito em `reasoning_effort` de topo e, ao mesmo tempo, `thinking.type=enabled` de topo mantém o raciocínio ligado. Não cobre o `reasoning_effort=none` do GLM-5.2, nem o `thinking.budget_tokens` do Anthropic-compatible, nem verifica a disponibilidade real do serviço online DeepSeek, nem cruza com queue, stop, edit/fork, remote ou compact.

### Passos

1. Limpar e preparar o app data de E2E, iniciar o desktop no workspace local default.
2. Adicionar um custom provider pela página de configurações, escolhendo o formato de API `openai-chat-completions` e o modelo `deepseek-v4-flash`.
3. Voltar ao chat, abrir a lista de modelos e selecionar `deepseek-v4-flash` sob o novo provider.
4. Enviar diretamente um texto comum com o marker `E2E_UPSTREAM_V4_REASONING_MAX`, validando o default `max` do Agent resolver.
5. Aguardar a conclusão da primeira volta e o estabelecimento da projeção autoritativa da sessão.
6. Selecionar o nível de raciocínio `high`.
7. Enviar um texto comum com o marker `E2E_UPSTREAM_V4_REASONING_HIGH` e aguardar a resposta.

### Itens de Verificação

| Número  | Item de verificação                                                                                                                              | Nota de validade                                                                                     | Local atual da asserção                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P0-12-A | O workspace local default está aberto e a view principal de chat é interativa                                                                     | Prova que começa pela entrada real do desktop, sem chamada direta à camada de serviço                 | `waitForWorkspaceApp(DEFAULT_WORKSPACE)`                                            |
| P0-12-B | O novo provider é salvo no formato OpenAI-compatible / Chat Completions e contém o modelo `deepseek-v4-flash`                                | Prova que o fato de provider prévio da case está correto, e que não há uso indevido do provider DeepSeek Anthropic-compatible default | `createCustomUpstreamV4Provider()` lendo o provider store e validando `apiFormat`, endpoint, model |
| P0-12-C | A lista de modelos do chat consegue selecionar `deepseek-v4-flash` pela identidade do novo provider                                            | Prova que o modelo vem do provider alvo, e não de um nome de modelo solto ou de outro provider          | `selectUpstreamProviderModelById(...providerId...)` + `assertSelectedUpstreamV4Model()` |
| P0-12-D | Sem reasoning metadata injetado pelo formulário, o request de estreia usa o path `/chat/completions`, com `model=deepseek-v4-flash` no body e o marker `MAX` | Prova que o request passa pelo transporte OpenAI-compatible do custom provider alvo e consome o default do Agent resolver | `assertUpstreamRequestCapture`、`assertUpstreamV4Request(..., "max")` |
| P0-12-E | O request de estreia default escreve `reasoning_effort=max` de topo e `thinking.type=enabled`                                                       | Prova que o nível default do DeepSeek V4 é mapeado para o campo correto visível ao provider             | `assertUpstreamV4Request(..., "max")`                                               |
| P0-12-F | O request de estreia default não tem `extra_body` nem `chat_template_kwargs`                                                                       | Prova que esta case cobre o contrato canônico de campos diretos                                           | `assertUpstreamV4Request(..., "max")`                                               |
| P0-12-G | A resposta do assistant da primeira volta com `max` é visível e conclui com `idle && queue=0`                                                       | Prova que a resposta de replay foi consumida pela UI e que o caminho fecha por completo                  | `waitForAssistantMessageContaining`、`waitForChatState`                              |
| P0-12-H | Após estabelecer a projeção da sessão e mudar para `high`, o nível atual na barra/store é `high`                                                   | Prova que a escolha explícita escreve na configuração atual da session                                   | `selectUpstreamThoughtLevelValue("high")` + `assertSelectedThoughtLevel("high")`     |
| P0-12-I | O request seguinte com `high` continua usando o mesmo provider/model e o body contém o marker `HIGH`                                                | Prova que, após completed na mesma session, trocar o nível só afeta os requests seguintes e não perde a identidade de provider | `assertUpstreamRequestCapture`、`assertUpstreamV4Request(..., "high")` |
| P0-12-J | O request com `high` escreve `reasoning_effort=high` de topo e `thinking.type=enabled`                                                             | Prova que a profundidade high explícita realmente sobrescreve o max default                            | `assertUpstreamV4Request(..., "high")`                                              |
| P0-12-K | O request com `high` não deixa resíduo `reasoning_effort=max` nem tem `extra_body` ou `chat_template_kwargs`                                       | Prova que a troca de profundidade não mistura níveis nem regride para o wrapper                          | `assertUpstreamV4Request(..., "high")`                                              |
| P0-12-L | A resposta do assistant da segunda volta é visível e conclui com `idle && queue=0`                                                                 | Prova que o request high também completa por completo, sem busy residual nem queue                     | `waitForAssistantMessageContaining`、`waitForChatState`                              |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- Os dois requests principais, `high` e `max`, têm cada um um fixture sintético `main`, cujos matchers contêm respectivamente `E2E_UPSTREAM_V4_REASONING_HIGH` e `E2E_UPSTREAM_V4_REASONING_MAX`.
- A resposta principal usa o formato SSE de OpenAI Chat Completions, evitando poluir a semântica de transporte com respostas rápidas em SSE de Anthropic Messages.
- O replay formal deve depender apenas de `common.json` e do fixture desta case, sem depender do fallback dedicado do `provider-basic.json` legado.

### Conclusões Reais de Verificação

#### Registros históricos de verificação (2026-07-02, contrato antigo de wrapper)

Os registros abaixo correspondem à implementação anterior à mudança para campos diretos canônicos e são mantidos apenas como evidência histórica:

- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-deepseek-v4-reasoning-request-shape.test.ts`
  - Resultado: passou.
  - Observação: `upstream-v4-reasoning-request-shape-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-deepseek-v4-reasoning-request-shape.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-143724-458/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-12-A a P0-12-M são cobertos pelas asserções do spec formal; o body `high` realmente contém `reasoning_effort=high` e `extra_body.thinking.type=enabled`, o body `max` realmente contém `reasoning_effort=max` e `extra_body.thinking.type=enabled`, e nenhuma das voltas escreveu por engano o `extra_body.chat_template_kwargs` exclusivo do GLM-5.2; ambas terminam em `idle` com `queueCount=0`.
- `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-deepseek-v4-reasoning-request-shape.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-143753-439/summary.md`.
  - Conclusão: no caminho default de replay o mesmo conjunto de verificações continua válido: novo provider DeepSeek V4 OpenAI-compatible, identidade de provider, campos de request `high`/`max`, resposta do assistant e estado final da session.
- `E2E_SPEC=./test/e2e/conversation-session/manual-review/pending/conversation-session-deepseek-v4-reasoning-request-shape.test.ts pnpm run test:e2e:container`
  - Resultado: não concluído, o Docker build deu timeout de TLS handshake ao baixar `docker.io/docker/dockerfile:1.7`.
  - Conclusão: é um problema de rede do Docker Hub, ignorado conforme combinado nesta rodada; não foi tratado como falha de comportamento da case.

#### Regressão atual de campos diretos (2026-07-22)

- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-deepseek-v4-reasoning-request-shape.test.ts`
  - Resultado: passou.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-deepseek-v4-reasoning-request-shape.test.ts'`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-124800-459/summary.md`.
  - Conclusão: P0-12-A a P0-12-L são cobertos pelas asserções do spec atual; o custom provider sem reasoning
    metadata usa o default `max` na estreia e muda para `high` em seguida, e as duas voltas geram
    respectivamente `reasoning_effort=max/high` de topo com `thinking.type=enabled`, sem conter
    `extra_body` ou `chat_template_kwargs`, terminando em `idle && queueCount=0`.

P0-12 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real e reconfirmação após a promoção". Esta case já está no caminho formal; a admissão Docker não é executada por enquanto por causa do problema de rede.

## P0-13: campos de request do nível de raciocínio de budget fixo do Claude Anthropic Messages

### Definição do Case

| Campo            | Conteúdo                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `I16`                                                                                                                                |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-claude-anthropic-reasoning-budget.test.ts` |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-claude-anthropic-reasoning-budget.json`         |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-claude-anthropic-reasoning-budget.json`      |
| Estado atual     | Promovido, replay case no caminho formal                                                                                             |

### Cenário de Teste

No workspace local default do desktop o usuário adiciona um custom provider Anthropic Messages local à case, com modelo alvo `claude-sonnet-4`, Base URL apontando para o servidor de replay local iniciado pela própria case e API Key dummy de E2E. O usuário seleciona o modelo sob esse provider na lista de modelos do chat, primeiro escolhe o nível de raciocínio `low` e envia texto comum; após a primeira volta, muda o nível para `xhigh` e envia um segundo texto comum.

Esta case valida que a intensidade de raciocínio de budget fixo dos modelos da família Claude é um parâmetro de provider no request Anthropic Messages: `thinking.type=enabled`, `thinking.budget_tokens` e `output_config.effort` devem variar conforme o nível. Não cobre o `reasoning_effort` do OpenAI-compatible, nem o `chat_template_kwargs` do GLM-5.2, nem verifica a disponibilidade real do serviço online Anthropic, nem cruza com queue, stop, edit/fork, remote ou compact.

### Passos

1. Iniciar o servidor de replay local desta case e escrever a dummy key, a Base URL e o artifact de captura no ambiente E2E.
2. Limpar e preparar o app data de E2E, iniciar o desktop no workspace local default.
3. Adicionar um custom provider pela página de configurações, escolhendo o formato de API `anthropic-messages` e o modelo `claude-sonnet-4`.
4. Voltar ao chat, abrir a lista de modelos e selecionar `claude-sonnet-4` sob o novo provider.
5. Selecionar o nível de raciocínio `low`.
6. Enviar um texto comum com o marker `E2E_CLAUDE_ANTHROPIC_REASONING_LOW` e aguardar a resposta.
7. Selecionar o nível de raciocínio `xhigh`.
8. Enviar um texto comum com o marker `E2E_CLAUDE_ANTHROPIC_REASONING_XHIGH` e aguardar a resposta.

### Itens de Verificação

| Número  | Item de verificação                                                                                     | Nota de validade                                                                | Local atual da asserção                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| P0-13-A | O novo provider é salvo no formato Anthropic Messages e contém o modelo `claude-sonnet-4`                | Prova que o fato de provider prévio da case está correto, e que não há uso indevido de um provider OpenAI-compatible | `createCustomClaudeAnthropicProvider()`                                          |
| P0-13-B | A lista de modelos do chat consegue selecionar `claude-sonnet-4` pela identidade do novo provider         | Prova que o modelo vem do provider alvo, e não de um nome de modelo solto ou de outro provider | `selectUpstreamProviderModelById(...providerId...)` + `assertSelectedClaudeAnthropicModel()` |
| P0-13-C | O request `low` usa `/messages`, com `model=claude-sonnet-4` no body e o marker do usuário               | Prova que o request passa pelo transporte Anthropic Messages e que o prompt não foi perdido | `assertUpstreamRequestCapture`、`assertClaudeAnthropicRequest`  |
| P0-13-D | O request `low` escreve `thinking.type=enabled`、`thinking.budget_tokens=4000`、`output_config.effort=low`  | Prova que o nível low é mapeado para o campo correto visível ao provider              | `assertClaudeAnthropicRequest("low")`                                                                  |
| P0-13-E | O request `low` não escreve por engano `reasoning_effort`, `extra_body` ou `chat_template_kwargs`         | Prova que o contrato Anthropic não é poluído por campos do OpenAI-compatible         | `assertClaudeAnthropicRequest("low")`                                                                  |
| P0-13-F | O request `xhigh` continua usando o mesmo provider/model e o body contém o segundo marker do usuário       | Prova que, após completed na mesma session, trocar o nível só afeta os requests seguintes e não perde a identidade de provider | `assertUpstreamRequestCapture`、`assertClaudeAnthropicRequest` |
| P0-13-G | O request `xhigh` escreve `thinking.budget_tokens=32000`、`output_config.effort=xhigh`                    | Prova que a profundidade xhigh realmente sobrescreve o low da volta anterior          | `assertClaudeAnthropicRequest("xhigh")`                                                                |
| P0-13-H | As respostas do assistant das duas voltas são visíveis e conclui com `idle && queue=0`                     | Prova que a resposta de replay foi consumida pela UI, sem busy residual nem queue      | `waitForAssistantMessageContaining`、`waitForChatState`                                               |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- Os dois requests principais, `low` e `xhigh`, têm cada um um fixture sintético `main`, cujos matchers contêm respectivamente `E2E_CLAUDE_ANTHROPIC_REASONING_LOW` e `E2E_CLAUDE_ANTHROPIC_REASONING_XHIGH`.
- A resposta principal usa o formato SSE de Anthropic Messages, evitando poluir a semântica de transporte com respostas rápidas em SSE de OpenAI Chat Completions.
- O replay formal é iniciado pelo próprio spec, que sobe o servidor de replay case-local e carrega apenas `common.json` e o fixture desta case.

### Conclusões Reais de Verificação

2026-07-02 concluída a adição e a verificação por replay formal:

- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-claude-anthropic-reasoning-budget.test.ts`
  - Resultado: passou.
  - Observação: `claude-anthropic-reasoning-budget-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=./test/e2e/fixtures/upstream/common.json,./test/e2e/fixtures/upstream/conversation-session/conversation-session-claude-anthropic-reasoning-budget.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-claude-anthropic-reasoning-budget.test.ts`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-150003-655/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-13-A a P0-13-H são cobertos pelas asserções do spec formal; o body `low` realmente contém `thinking.type=enabled`、`thinking.budget_tokens=4000`、`output_config.effort=low`, o body `xhigh` realmente contém `thinking.budget_tokens=32000`、`output_config.effort=xhigh`, e nenhuma das voltas escreveu por engano campos exclusivos do OpenAI-compatible ou do GLM; ambas terminam em `idle` com `queueCount=0`.

P0-13 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real e reconfirmação após a promoção". Esta case já está no caminho formal; a admissão Docker não é executada por enquanto por causa do problema de rede.

## P0-14: campo de request `reasoning_effort` do GPT OpenAI-compatible

### Definição do Case

| Campo            | Conteúdo                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I17`                                                                                                                                 |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-gpt-openai-compatible-reasoning-effort.test.ts` |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-gpt-openai-compatible-reasoning-effort.json`      |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-gpt-openai-compatible-reasoning-effort.json`   |
| Estado atual     | Promovido, replay case no caminho formal                                                                                              |

### Cenário de Teste

No workspace local default do desktop o usuário adiciona um custom provider OpenAI-compatible local à case, com modelo alvo `gpt-5`, Base URL apontando para o servidor de replay local iniciado pela própria case e API Key dummy de E2E. O usuário seleciona o modelo sob esse provider na lista de modelos do chat, primeiro escolhe o nível de raciocínio `low` e envia texto comum; após a primeira volta, muda o nível para `xhigh` e envia um segundo texto comum.

Esta case valida que os modelos da família GPT expressam a intensidade de raciocínio apenas com `reasoning_effort` de topo no transporte OpenAI-compatible Chat Completions. Não cobre o `thinking.type` de topo do DeepSeek V4, o `reasoning_effort=none` do GLM-5.2 ou o `thinking/output_config` do Claude, nem verifica a disponibilidade real dos serviços online da OpenAI ou de suppliers compatíveis.

### Itens de Verificação

| Número  | Item de verificação                                                                                                    | Nota de validade                                                      | Local atual da asserção                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P0-14-A | O novo provider é salvo no formato OpenAI-compatible / Chat Completions e contém o modelo `gpt-5`                      | Prova que o fato de provider prévio da case está correto             | `createCustomGptOpenAiProvider()`                                                 |
| P0-14-B | A lista de modelos do chat consegue selecionar `gpt-5` pela identidade do novo provider                                | Prova que a escolha do modelo não degradou para um nome de modelo solto | `selectUpstreamProviderModelById`、`assertSelectedGptOpenAiModel()` |
| P0-14-C | O request `low` usa o path `/chat/completions`, com `model=gpt-5` no body e o marker do usuário                        | Prova que o request passa pelo transporte OpenAI-compatible e que o prompt não foi perdido | `assertUpstreamRequestCapture`、`assertGptOpenAiRequest("low")` |
| P0-14-D | O request `low` escreve apenas `reasoning_effort=low`, sem `thinking`, `output_config`, `extra_body` ou `chat_template_kwargs` | Prova que o contrato GPT não é poluído por campos de providers vizinhos | `assertGptOpenAiRequest("low")`   |
| P0-14-E | Após mudar para `xhigh`, o request da segunda volta escreve `reasoning_effort=xhigh` e ainda não escreve campos de providers vizinhos | Prova que a troca de nível realmente sobrescreve o low anterior e não mistura semântica de provider | `assertGptOpenAiRequest("xhigh")` |
| P0-14-F | As respostas do assistant das duas voltas são visíveis e conclui com `idle && queue=0`                                 | Prova que a resposta de replay foi consumida pela UI, sem busy residual nem queue | `waitForAssistantMessageContaining`、`waitForChatState`    |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- Os dois requests principais, `low` e `xhigh`, têm cada um um fixture sintético `main`, cujos matchers contêm respectivamente `E2E_GPT_OPENAI_REASONING_LOW` e `E2E_GPT_OPENAI_REASONING_XHIGH`.
- A resposta principal usa o formato SSE de OpenAI Chat Completions, evitando poluir a semântica de transporte com respostas rápidas em SSE de Anthropic Messages.
- O replay formal é iniciado pelo próprio spec, que sobe o servidor de replay case-local e carrega apenas `common.json` e o fixture desta case.

### Conclusões Reais de Verificação

2026-07-02 concluída a adição e a verificação por replay formal:

- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-gpt-openai-compatible-reasoning-effort.test.ts`
  - Resultado: passou.
  - Observação: `gpt-openai-compatible-reasoning-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=./test/e2e/fixtures/upstream/common.json,./test/e2e/fixtures/upstream/conversation-session/conversation-session-gpt-openai-compatible-reasoning-effort.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-gpt-openai-compatible-reasoning-effort.test.ts`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-150414-009/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-14-A a P0-14-F são cobertos pelas asserções do spec formal; o body `low` realmente contém `reasoning_effort=low`, o body `xhigh` realmente contém `reasoning_effort=xhigh`, e nenhuma das voltas escreveu por engano campos exclusivos do DeepSeek, do GLM ou do Claude; ambas terminam em `idle` com `queueCount=0`.

P0-14 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real e reconfirmação após a promoção". Esta case já está no caminho formal; a admissão Docker não é executada por enquanto por causa do problema de rede.

## P0-15: campos de request de adaptive thinking do Opus 4.7 Anthropic Messages

### Definição do Case

| Campo            | Conteúdo                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog          | `I18`                                                                                                                                |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-opus47-anthropic-adaptive-reasoning.test.ts` |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-opus47-anthropic-adaptive-reasoning.json`         |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-opus47-anthropic-adaptive-reasoning.json`      |
| Estado atual     | Promovido, replay case no caminho formal                                                                                             |

### Cenário de Teste

No workspace local default do desktop o usuário adiciona um custom provider Anthropic Messages local à case, com modelo alvo `claude-opus-4-7`, Base URL apontando para o servidor de replay local iniciado pela própria case e API Key dummy de E2E. O usuário seleciona o modelo sob esse provider na lista de modelos do chat, primeiro escolhe o nível de raciocínio `medium` e envia texto comum; após a primeira volta, muda o nível para `max` e envia um segundo texto comum.

Esta case valida que modelos de adaptive thinking como o Opus 4.7 não seguem o contrato de budget fixo do Sonnet. O request Anthropic Messages deve conter apenas `thinking.type=adaptive` e `output_config.effort`, e não deve gerar `thinking.budget_tokens`. Não cobre o `reasoning_effort` do OpenAI-compatible, o `thinking.type` de topo do DeepSeek V4 ou o `reasoning_effort=none` do GLM-5.2, nem verifica a disponibilidade real do serviço online Anthropic.

### Itens de Verificação

| Número  | Item de verificação                                                                                                                     | Nota de validade                                                                    | Local atual da asserção                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P0-15-A | O novo provider é salvo no formato Anthropic Messages e contém o modelo `claude-opus-4-7`                                                | Prova que o fato de provider prévio da case está correto                              | `createCustomOpus47AnthropicProvider()`                                                    |
| P0-15-B | A lista de modelos do chat consegue selecionar `claude-opus-4-7` pela identidade do novo provider                                        | Prova que a escolha do modelo não degradou para um nome de modelo solto              | `selectUpstreamProviderModelById`、`assertSelectedOpus47AnthropicModel()`                  |
| P0-15-C | O request `medium` usa o path `/messages`, com `model=claude-opus-4-7` no body e o marker do usuário                                       | Prova que o request passa pelo transporte Anthropic Messages e que o prompt não foi perdido | `assertUpstreamRequestCapture`、`assertOpus47AnthropicRequest("medium")`  |
| P0-15-D | O request `medium` escreve `thinking.type=adaptive`、`output_config.effort=medium` e não escreve `thinking.budget_tokens`               | Prova que o nível medium usa o contrato de adaptive thinking                            | `assertOpus47AnthropicRequest("medium")`                                                    |
| P0-15-E | Após mudar para `max`, o request da segunda volta escreve `thinking.type=adaptive`、`output_config.effort=max` e ainda não escreve `thinking.budget_tokens` | Prova que a troca de nível realmente sobrescreve o medium anterior e não se mistura ao contrato de budget fixo | `assertOpus47AnthropicRequest("max")`  |
| P0-15-F | Nenhuma das duas voltas escreve `reasoning_effort`, `extra_body` ou `chat_template_kwargs`                                                | Prova que o contrato Anthropic adaptive não é poluído por campos de providers vizinhos | `assertOpus47AnthropicRequest(...)`      |
| P0-15-G | As respostas do assistant das duas voltas são visíveis e conclui com `idle && queue=0`                                                      | Prova que a resposta de replay foi consumida pela UI, sem busy residual nem queue      | `waitForAssistantMessageContaining`、`waitForChatState`                                     |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título, e não pertence à semântica de produto desta case.
- Os dois requests principais, `medium` e `max`, têm cada um um fixture sintético `main`, cujos matchers contêm respectivamente `E2E_OPUS47_ANTHROPIC_REASONING_MEDIUM` e `E2E_OPUS47_ANTHROPIC_REASONING_MAX`.
- A resposta principal usa o formato SSE de Anthropic Messages, evitando poluir a semântica de transporte com respostas rápidas em SSE de OpenAI Chat Completions.
- O replay formal é iniciado pelo próprio spec, que sobe o servidor de replay case-local e carrega apenas `common.json` e o fixture desta case.

### Conclusões Reais de Verificação

2026-07-02 concluída a adição e a verificação por replay formal:

- `pnpm --filter @zcode/desktop typecheck:e2e`
  - Resultado: passou.
- `pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-opus47-anthropic-adaptive-reasoning.test.ts`
  - Resultado: passou.
  - Observação: `opus47-anthropic-adaptive-reasoning-title` não tem marker E2E, o que corresponde à semântica não de negócio do fixture common de geração de título.
- `E2E_PROVIDER_REPLAY_FIXTURE_PATH=./test/e2e/fixtures/upstream/common.json,./test/e2e/fixtures/upstream/conversation-session/conversation-session-opus47-anthropic-adaptive-reasoning.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-opus47-anthropic-adaptive-reasoning.test.ts`
  - Resultado: passou, 1 spec / 1 case passed.
  - Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260702-150714-538/summary.md`.
  - Conclusão: carregando estritamente apenas common + fixture case-local, P0-15-A a P0-15-G são cobertos pelas asserções do spec formal; o body `medium` realmente contém `thinking.type=adaptive`、`output_config.effort=medium`, o body `max` realmente contém `thinking.type=adaptive`、`output_config.effort=max`, nenhuma das voltas escreveu `thinking.budget_tokens` e também não escreveu por engano campos exclusivos do OpenAI-compatible, do DeepSeek ou do GLM; ambas terminam em `idle` com `queueCount=0`.

P0-15 já atende ao requisito do objetivo atual de "descrição detalhada, verificação real e reconfirmação após a promoção". Esta case já está no caminho formal; a admissão Docker não é executada por enquanto por causa do problema de rede.

## P0-16: modelo default de rascunho com o mesmo nome não regride a identidade entre providers

### Definição do Case

| Campo            | Conteúdo                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I22`                                                                                                                                  |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-same-model-draft-provider-identity.test.ts` |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-same-model-draft-provider-identity.json`          |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-same-model-draft-provider-identity.json`       |
| Estado atual     | Case candidata pending em manual-review                                                                                                  |

### Cenário de Teste

No workspace local default do desktop o usuário constrói, para `glm-5.2` e `deepseek-v4-flash` separadamente, dois custom providers primary/alternate, com Base URLs diferentes para os dois providers do mesmo modelo. Cada família de modelo primeiro conclui uma sessão com o primary provider; depois clica em nova tarefa para entrar em rascunho vazio, seleciona na lista de modelos do chat o modelo de mesmo nome sob o alternate provider e envia um texto comum.

Esta case fixa a fronteira de resposta do default do workspace e o roteamento real do request: depois que o modelo default do rascunho é escrito, o `currentValue` da barra, o estado selecionado do modelo ao reabrir o menu e o draft config do workspace devem manter o id do alternate provider + o modelo atual; a URL do request ao provider após o envio também deve acertar a Base URL do alternate provider, sem regride para o provider anterior só porque ainda existe uma session ativa no mesmo workspace. Não cobre queue, stop, edit/fork, workspace remoto nem a disponibilidade real dos serviços BigModel/Z.AI/DeepSeek.

### Itens de Verificação

| Número  | Item de verificação                                                                                                                         | Nota de validade                                                                                  | Local atual da asserção                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| P0-16-A | `glm-5.2` e `deepseek-v4-flash` têm cada um dois providers case-local primary/alternate, com Base URLs diferentes para o mesmo modelo | Reproduz a condição de gatilho do mesmo modelId entre providers e permite que a URL do request distinga o supplier | `createScenarioProviders()`      |
| P0-16-B | Cada família de modelo conclui primeiro uma volta com o primary provider e deixa uma session ativa                                             | Reproduz o estado em que o construtor de estado do workspace enxerga uma session ativa               | `runSameModelProviderIdentityScenario()` |
| P0-16-C | Após criar um rascunho vazio, seleciona o modelo de mesmo nome sob o alternate provider                                                       | Cobre o caminho real de seleção no menu de modelos do chat                                        | `selectUpstreamProviderModelById()`      |
| P0-16-D | O `data-model-current-value` da barra mantém a codificação alternate provider/model                                                           | Prova que a UI não reexibe pelo modelId solto para o provider antigo                              | `assertSelectedProviderModel()`          |
| P0-16-E | Ao reabrir o menu de modelos do chat, o grupo do alternate provider e o item do modelo de mesmo nome continuam selecionados                     | Cobre diretamente o problema da captura de tela do usuário, em que "a lista de modelos mostra o provider do modelo anterior" | `assertModelMenuSelectedProvider()` |
| P0-16-F | O model currentValue das configOptions do draft do workspace mantém a codificação alternate provider/model                                   | Prova que a resposta de protocolo não reescreveu o estado default do workspace para o modelo em execução da session ativa | `assertDraftConfigModelValue()` |
| P0-16-G | Após selecionar o alternate provider e enviar texto comum, a URL real do request acerta a Base URL do alternate provider                      | Prova que não é apenas exibição correta na UI, e que o request de runtime também mudou para o supplier alvo | `assertProviderRequestUrl()`   |

### Contrato do Fixture

- O request de geração de título é um fixture sintético `common`, usado apenas para estabilizar o título da sessão, e não pertence à semântica de produto desta case.
- `glm-5.2` e `deepseek-v4-flash` têm cada um um seed primary e um send alternate de fixtures sintéticos `main`, cujos matchers contêm respectivamente markers estáveis `E2E_*_PRIMARY` / `E2E_*_ALTERNATE`.
- A troca de rascunho para o alternate, por si só, não deve produzir request ao provider; o request de envio após a troca é a entrada da asserção de roteamento real, e precisa validar que `record.url` acerta a Base URL do alternate provider.
- O spec atual fica em `manual-review/pending` e só é promovido pelo fluxo de promoção após o review manual.

## Confirmação de planejamento I62 / I64 de 2026-07-22

O usuário confirmou preencher os E2E de bugfix pela prioridade da auditoria, mantendo as semânicas de produto aceitas no catalog e as podas existentes. Este lote trata apenas I62 e I64; as duas cases compartilham o helper custom OpenAI-compatible/replay, mas não são fundidas em um único cenário: a primeira é um invariante de codificação de modelId e a segunda é um invariante de timing de cold start do provider registry.

```text
I62: 选择 OpenRouter modelId(:free)
       -> toolbar currentValue
       -> V4 draft intent
       -> provider request.model(:free)

I64: Personal Config(custom GLM)
       -> Host Process Registry ready
       -> Worker Process Registry ready
       -> V4 createSession(custom GLM)
       -> first prewarm projection / toolbar / request = custom GLM
                                      X no DeepSeek fallback preference write
```

As podas se mantêm assim: I62 roda apenas com desktop local, rascunho vazio, um único custom provider OpenRouter e um único envio inicial, sem cruzar com thought, queue, fork, restart, remote, tema ou locale; I64 roda apenas o prewarm de rascunho com cold restart de `desktop-continuous` no desktop local, sem repetir a remoção/desativação pela página de configurações (I61), a recuperação de session existente (I40) nem a combinação de shared-host remoto. O portão de prontidão de chamada de protocolo do I64 é provado por testes focados de Process Registry; o E2E do Desktop complementa a primeira projeção observável, a barra, o localStorage e o request real ao Provider, sem falsificar o timing de Host/Worker com mocks de Renderer.

## P0-17: modelId com dois pontos do OpenRouter permanece íntegro de ponta a ponta

### Definição do Case

| Campo            | Conteúdo                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I62`                                                                                                                             |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-openrouter-model-id-colon.test.ts`        |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-openrouter-model-id-colon.json`               |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-openrouter-model-id-colon.json`            |
| Estado atual     | Case candidata pending em manual-review                                                                                           |

### Cenário de Teste

No workspace local default do desktop o usuário adiciona um custom provider OpenRouter local à case, com model ID fixo `nvidia/nemotron-3-ultra-550b-a55b:free`, e depois seleciona esse modelo pela identidade do provider na barra do chat e faz o primeiro envio de texto comum. `:` faz parte do model ID; apenas `$` pode expressar a semântica de separação de variantes de configOptions do ZCode.

### Itens de Verificação

| Número  | Item de verificação                                                                              | Nota de validade                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| P0-17-A | O provider/model salvo pela página de configurações mantém o `:free` completo                       | Prova que o catálogo prévio não truncou o modelId                                                    |
| P0-17-B | O `data-model-current-value` da barra é igual à codificação compartilhada de provider + modelId completo | Prova que a escolha do usuário e o intent do renderer não foram divididos por `:`                   |
| P0-17-C | O provider/model do V4 draft intent é o provider alvo + o modelId completo                         | Prova que o intent do renderer não perdeu o sufixo antes do comando de configuração; a barreira da estreia e o request provam novamente a convergência autoritativa do Agent |
| P0-17-D | O `model` no body do request de estreia `/chat/completions` é exatamente igual ao modelId completo   | Prova que o runtime/transport do provider finalmente recebe a mesma identidade de modelo              |
| P0-17-E | A resposta do assistant é visível e o pane volta ao estado não-parável                            | Prova que a resposta de replay foi consumida por completo pela UI                                    |

### Contrato do Fixture

- O request de título reaproveita `common.json` e não pertence à semântica de produto desta case.
- O único fixture sintético `main` faz match estrito com o marker `E2E_OPENROUTER_MODEL_ID_COLON`, e o body do request deve conter o modelId completo; a resposta serve apenas para devolver `upstream-e2e-ok` de forma estável.
- O spec permanece em `manual-review/pending`, e o campo `spec` do manifest de fixture continua apontando para o alvo formal canônico.

### Verificação por Replay Pending

2026-07-22 concluídos a fixture check, a checagem TypeScript do E2E e o replay real no Electron. O resultado final da execução foi 1 spec / 1 case passed; o artifact está em `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-133804-806/summary.md`. O nome de modelo tanto no request real quanto na telemetria do Agent foi `nvidia/nemotron-3-ultra-550b-a55b:free`. Atualmente aguardando review manual, ainda sem promoção.

## P0-18: o prewarm do rascunho espera o process provider registry ficar pronto

### Definição do Case

| Campo            | Conteúdo                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `I64`                                                                                                                             |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-provider-registry-prewarm.test.ts`       |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-provider-registry-prewarm.json`               |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-provider-registry-prewarm.json`            |
| Estado atual     | Case candidata pending em manual-review                                                                                           |

### Cenário de Teste

Primeiro deixa-se que a Personal Config versionada e o last-selected global do Renderer mantenham um custom GLM-5.2 local à case, e então faz-se um cold restart completo de Desktop/Host/Worker. Host e Worker inicializam cada um o seu Process Registry a partir da mesma Environment Config; o `createSession` do V4 usado pelo prewarm automático do rascunho precisa esperar o Registry ficar pronto e não pode depender de um Provider Snapshot antigo enviado pelo Host.

### Itens de Verificação

| Número  | Item de verificação                                                                                        | Nota de validade                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| P0-18-A | Antes do cold restart a Personal Config versionada contém o custom GLM                                    | Host e Worker inicializam o Registry de forma independente a partir do mesmo fato do Environment |
| P0-18-B | Após o cold restart o primeiro draft config V4 observável é `source=prewarm-projection` e provider/model são exatamente o custom GLM | Prova que o prewarm não criou a session com o DeepSeek default ausente do runtime |
| P0-18-C | O currentValue da barra mantém o custom provider + GLM-5.2                                                 | Prova que não houve regride por fallback na escolha autoritativa da UI          |
| P0-18-D | A tupla atômica last-selected do renderer continua sendo o custom GLM                                     | Prova que o DeepSeek transiente não sobrescreveu a preferência global do usuário |
| P0-18-E | O request de estreia acerta o provider local à case, com `model=GLM-5.2` no body                           | Prova que o provider/model real de runtime da session de prewarm está correto   |
| P0-18-F | A resposta do assistant é visível e o pane volta ao estado não-parável                                     | Prova que o caminho da sessão após o cold start fecha por completo              |

### Contrato do Fixture

- O request de título reaproveita `common.json` e não pertence à semântica de produto desta case.
- O único fixture sintético `main` faz match estrito com o marker `E2E_PROVIDER_REGISTRY_PREWARM` e exige que o body do request contenha `GLM-5.2`; a resposta serve apenas para devolver `upstream-e2e-ok` de forma estável.
- Os testes focados de Process Registry mantêm a prova da barreira de inicialização; este spec não substitui essa camada de evidência por mock de UI.
- O spec permanece em `manual-review/pending` e só é promovido após a confirmação manual do comportamento real de cold start e do artifact.

### Verificação por Replay Pending

2026-07-22 concluídos a fixture check, a checagem TypeScript do E2E e o replay real de cold restart no Electron. O resultado final da execução foi 1 spec / 1 case passed; o artifact está em `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-133902-332/summary.md`. A identidade real de modelo no log de execução foi `e2e-provider-registry-prewarm/GLM-5.2`, e tanto o request de estreia quanto as asserções de fechamento da UI passaram. Atualmente aguardando review manual, ainda sem promoção.

## P0-19: trocar de modelo em resposta de streaming comum não muda a atribuição de uso da request atual

### Definição do Case

| Campo            | Conteúdo                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog          | `N16`                                                                                                                               |
| Spec             | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-running-model-switch-usage.test.ts`     |
| Fixture manifest | `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-running-model-switch-usage.json`             |
| Provider fixture | `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-running-model-switch-usage.json`          |
| Estado atual     | Case de regressão pending em manual-review                                                                                          |

### Cenário de Teste

Uma conversa comum no desktop local inicia um request com o modelo primary. O controlled stream case-local mantém uma janela determinística depois que o provider já recebeu o request; o usuário troca a session atual para o modelo secondary enquanto a resposta ainda não terminou, sem enviar uma segunda mensagem. A request antiga depois devolve um uso fixo, e o E2E consulta diretamente o `model_usage` do SQLite do Agent pela session atual.

Contrato de estado e timing:

```text
primary request started ── SSE running ─────────────── primary response + usage
                              │                                      │
                              └── session default -> secondary       └── usage.model = primary
```

### Itens de Verificação

| Número  | Item de verificação                                                                                    | Nota de validade                                                                |
| ------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P0-19-A | Antes da troca a captura já mostra a request principal primary e a session ainda está em streaming      | Prova que a troca acertou uma janela real de request in-flight no provider, e não uma animação final da UI |
| P0-19-B | Durante o streaming a escolha de modelo muda com sucesso para secondary                                | Prova que a configuração default mutável da session é de fato atualizada antes de a request antiga terminar |
| P0-19-C | A captura do provider após a conclusão continua usando primary                                          | Prova que a identidade de modelo de um request in-flight é imutável                 |
| P0-19-D | Os tokens de usage do `main_turn` da session atual são iguais ao valor fixo do fixture, com provider/model ambos primary | Prova que o fato de uso está ligado ao modelo realmente executado, e não ao modelo default da session no fim do request |

### Poda e Contrato do Fixture

- O único fixture sintético `main` usa `controlled-stream` porque a velocidade dos modelos online não é suficiente para criar de forma estável a janela de troca de modelo.
- Nenhum prompt é enfileirado; a semântica de os requests seguintes lerem o secondary já é coberta por `N02/MQ`.
- Compact e tarefas ociosas têm seus próprios snapshots de execution model e não cruzam com esta case representativa de conversa comum principal.
- Os cenários de stop/cancel/error sem usage positivo são cobertos por testes focados do core; remote/mobile só muda delivery/recovery e não muda o invariante `usage.model === request.executionModel`.
- O spec permanece em `manual-review/pending`; o campo `spec` do manifest de fixture aponta para o alvo formal canônico.

### Reprodução e Verificação da Correção

2026-08-05, antes da correção, foi executado um replay strict em que a captura do provider provou que o request usava de fato `e2e-upstream/deepseek-v4-flash`, mas o usage de `main_turn` da mesma session foi registrado no SQLite como o `e2e-upstream/deepseek-v4-pro` posterior à troca, reproduzindo de forma estável o erro de atribuição; o artifact está em `packages/desktop/.e2e-artifacts/desktop-e2e-20260804-165513-717/summary.md`.

Após a correção, a execução foi repetida com o mesmo fixture: 1 spec / 1 case passed, o uso voltou a ser atribuído a `e2e-upstream/deepseek-v4-flash` e o total fixo de tokens foi `132`; o artifact está em `packages/desktop/.e2e-artifacts/desktop-e2e-20260804-170040-645/summary.md`. Atualmente continua em manual-review pending, aguardando review manual antes da promoção.

## P0-20: estado sem modelos no provedor de modelo e dica de adição

MP-UI-01 verifica simultaneamente o layout adaptativo de conteúdo em duas colunas: sondas temporárias de altura do DOM simulam separadamente conteúdos mais altos de navegação e de detalhe e, em janelas larga e estreita, afirmam o mínimo de 36rem, a igual altura das duas colunas, a ausência de scroll interno e a roda do mouse movendo o main externo. As sondas verificam apenas geometria CSS e não representam validação de dados da API do provider; depois de removê-las o fluxo original continua.

MR !2618 CR-01: MP-UI-06 usa o feedback real de sucesso do salvamento de modelo, injeta separadamente sondas de navegação e de detalhe longas e, em janelas de 1280×600 e 600×500, nas posições superior/médio/inferior, afirma que o feedback cabe por completo na área visível do main e na coluna de detalhe. O estado e o timeout de feedback não mudam; sucesso e falha compartilham o mesmo container de posicionamento.

### Definição do Case

| Campo            | Conteúdo                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| Catalog          | `MP-UI-01`、`MP-UI-02`                                                 |
| Spec             | `packages/desktop/test/e2e/settings/settings-ui-polish.test.ts`        |
| Provider fixture | Nenhum; apenas faz seed de configurações locais e do arquivo de providers, sem enviar request de modelo |
| Estado atual     | Já revisado manualmente e promovido                                    |

### Cenário de Teste

O primeiro segmento verifica o footer a partir da entrada de adição de fornecedor personalizado: a dica e o ícone Info ficam à esquerda, o botão de adicionar à direita e há uma linha divisória semântica acima dos dois; quando nenhum modelo foi adicionado o botão permanece desabilitado. O segundo segmento faz seed de um fornecedor personalizado com apenas um modelo e, pela página real de configurações, exclui o último modelo, verificando que o editor mantém o estado vazio tracejado e a ação Add Model. Os modelos do Coding Plan são sincronizados automaticamente pelo estado de login e não podem ser excluídos manualmente pela página de configurações; sua condição de conexão sem modelo é coberta por teste unitário do resolver, sem forjar uma operação E2E inexistente.

### Itens de Verificação

| Número  | Item de verificação                                              | Nota de validade                                  |
| ------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| P0-20-A | O footer de adição de provider tem `border-t`, ícone Info e texto de lembrete | Prova que a dica de adição passa pela página real de configurações |
| P0-20-B | A dica fica à esquerda do botão e, sem modelo, o botão fica desabilitado | Prova que o layout é consistente com o estado de validação já existente |
| P0-20-C | Um fornecedor personalizado pode excluir o último modelo pelo botão real de exclusão | Prova que o estado vazio vem da cadeia real de edição |
| P0-20-D | A dica de estado vazio tracejada e Add Model ficam visíveis ao mesmo tempo | Prova que o usuário ainda tem uma entrada real para recuperar a configuração |

### Poda

- Request a provider, estreia no chat e persistência são cobertos por P0-02; esta case não repete o envio de requests.
- Os ramos de resolver equivalentes de Z.ai/BigModel e Start/Coding têm cobertura pairwise em testes unitários; a lista do Coding Plan é sincronizada pelo servidor e somente leitura, e não se aplica indevidamente a operação de exclusão de fornecedor personalizado à página de planos.
- Tema, locale e mobile não mudam a condição de conexão; tokens semânticos, textos bilíngues e classes responsivas são cobertos por testes unitários.

### Verificação Real

- ID da execução formal após a promoção: `desktop-e2e-20260819044246639-p7031-0eaf856fbfb1eeae`
- Resultado no caminho formal: sem ativar a flag de manual-review, os 3 cases passaram.
- Artifact formal: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819044246639-p7031-0eaf856fbfb1eeae/summary.md`.
- ID da execução: `desktop-e2e-20260819042607776-p64629-52e741b6f1da02f5`
- Resultado: os 3 cases passaram.
- Artifact: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819042607776-p64629-52e741b6f1da02f5/summary.md`.