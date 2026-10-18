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