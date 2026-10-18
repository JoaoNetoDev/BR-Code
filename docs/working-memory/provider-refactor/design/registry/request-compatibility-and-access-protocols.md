# Compatibilidade de Requisições de Modelo e Protocolos de Provider Access

> Status: design vigente; o Compatibility Config foi removido
>
> Última atualização: 2026-10-07 (detalhes da verificação de segurança da versão oficial foram movidos para fora; este documento passa a uma descrição neutra)

Este documento delimita a atribuição da reprodução do histórico do modelo, das diferenças de codificação de requisições de API e do Provider Access/protocolos de produto. O Model Config não oferece mais um contêiner Compatibility genérico; diferenças de protocolo devem ser atribuídas a contratos de domínio reais já existentes, caso contrário não entram na configuração.

## 1. Princípio geral

Depois que a resposta do modelo entra no ZCode, por padrão vale o princípio de reprodução sem perdas:

```text
O conteúdo / reasoning / metadata real retornado pelo Provider
                        |
                        v
              Canonical Message salva
                        |
                        v
              mensagens de histórico e persistência
                        |
                        v
              serialização da requisição pelo Adapter
                        |
                        v
     ao continuar no mesmo modelo, gravado de volta por completo e como veio
```

“Como veio” significa semântica e valores inalterados; não exige o mesmo wire JSON em cada camada intermediária. Campos não padronizados do Provider que seriam descartados pelos tipos padrão do AI SDK podem ser projetados sem perdas na fronteira de entrada/saída pelo Adapter; a projeção só pode transportar dados realmente retornados, nunca adivinhar, fabricar ou corrigir valores inexistentes.

Uma nova projeção de protocolo no Adapter deve satisfazer simultaneamente:

1. a codificação padrão do AI SDK atual ou do Adapter de destino não consegue expressar o protocolo real do serviço;
2. o comportamento pode ser provado pelo contrato oficial atual, pelo contrato de serviço de produto do ZCode ou por requisições reais reproduzíveis;
3. a atribuição é a um contrato de Model/Provider já existente, e o Adapter não precisa fazer hardcode de IDs específicos;
4. o comportamento de falha é explícito, e a projeção de compatibilidade não pode descartar dados silenciosamente;
5. não é o Access de outro domínio, nem verificação de segurança, fila ou máquina de estados de autorização.

Não é permitido recriar campos genéricos Compatibility nem Personal Model Rule por causa de casos especiais de protocolo.

## 2. Adjudicação de atribuição de campos

| Campo/comportamento existente                          | Atribuição final                                  | Adjudicação                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Reprodução de reasoning OpenAI-compatible             | Sem configuração adicional                       | Preserva o reasoning real; o SDK OpenAI-compatible atual codifica `reasoning_content`                 |
| tool-call sem thinking em Anthropic-compatible         | Canonical replay                                 | Não fabricar synthetic thinking para tool-call vazio; reproduzir apenas o que o servidor retornou  |
| signature de thinking Anthropic                       | Canonical reasoning metadata + projeção do Adapter | Salvar signature/redacted data reais e reproduzir como veio; nunca fabricar assinatura real          |
| Patch candidato de signature de bloco text/tool da Z.ai | Não adotado                                       | Não está no HEAD/staging atual; não trazer candidatos de branch externo para este refactor          |
| `omitMaxOutputTokens`                                  | Removido                                         | O caso especial antigo do GitHub Copilot não é mantido para uma integração não suportada oficialmente |
| `maxOutputTokensRequestField`                          | Removido                                         | Não há suporte a Snowflake Cortex agora; o campo, a Rule e a reescrita do body são removidos        |
| Campo de verificação de segurança da versão oficial    | `zhipu-account/start-plan`                       | Removido do Model Config; o material dinâmico continua vindo da cadeia de produto da versão oficial  |
| `failureProtocol`                                      | `zhipu-account/off-peak`                         | Marcador de string, erros entre processos e máquina de estados da UI permanecem iguais               |
|Admissão da verificação de segurança de requisição da versão oficial | Protocolo de requisição do Provider | Definido por Access explícito e domínio oficial; as regras concretas só são mantidas na versão oficial |
| `requiresMfjsToolSchema`                               | Model Config                                     | Mantém o fato de codificação de requisição do modelo/API; habilitado só por Model Config com correspondência explícita; erro em falha; na página de configurações fica por último |

## 3. Reprodução do histórico de reasoning

### 3.1 OpenAI-compatible

O ZCode deve salvar o bloco de reasoning realmente retornado pelo servidor e devolver o mesmo trecho de histórico canônico ao Adapter. O `@ai-sdk/openai-compatible` atual já consegue codificar o assistant reasoning content como `reasoning_content`, portanto não é mais necessário `withOpenAiCompatibleReasoningContent()` para reextrair, remover reasoning parts ou fabricar `reasoning_content: ""` para tool-call vazio.

O encadeamento alvo é:

```text
reasoning_content real
        |
        v
reasoning part do AI SDK + metadata do provider
        |
        v
bloco de reasoning canônico do ZCode
        |
        v
assistant reasoning part do AI SDK
        |
        v
SDK OpenAI-compatible codifica reasoning_content
```

Se uma versão futura do SDK regredir, isso deve ser detectado por testes de contrato do body da requisição e corrigido na fronteira do SDK; não se deve restaurar uma segunda fonte de verdade baseada em nome de modelo.

### 3.2 Comportamento padrão do Anthropic

O bloco de thinking real do Anthropic, o thinking vazio, a signature e o redacted thinking devem ser salvos por completo e reproduzidos como veio no turno seguinte de tool-use. Os dois tipos de “vazio” precisam ser distinguidos:

```text
servidor retorna empty thinking + real signature
└─ fato real da resposta, deve ser salvo e reproduzido como veio

servidor não retornou nenhum thinking
└─ por padrão não se pode fabricar empty thinking / empty signature
```

Alguns fluxos Anthropic-compatible colocam a signature real de thinking em `content_block_start`, enquanto o AI SDK só lê `signature_delta`. O `anthropic-stream-compat` pode projetar esse valor real já recebido como o evento padrão que o SDK reconhece; isso é transporte sem perdas, não geração de assinatura.

### 3.3 Não sintetizar empty thinking

Qualquer Provider Anthropic-compatible executa uniformemente o canonical replay: quando o servidor retorna thinking/signature reais, salva e reproduz como veio; quando não retorna, não fabrica block nem signature. Esse comportamento não aceita desvio por Model ID, Provider ID ou chave de configuração.

Complemento de 2026-09-10: o julgamento de compatibilidade de assinatura de histórico é separado das regras de codificação de bloco acima. IDs antigos de Coding Plan e IDs Individual/Team do mesmo serviço podem ser julgados compatíveis para replay por uma função pura, centralizada e enumerada com precisão dentro do Adapter; o ID do modelo ainda precisa ser o mesmo. Z.ai e BigModel têm isolamento de grupos; outros Providers mantêm o julgamento por ID exato, sem nova configuração ou campo de persistência, sem reescrever a identidade do histórico e sem usar essa função para seleção de modelo ou autorização.
Fronteira completa e verificação em [Reasoning History Replay](../../../../../apps/zcode-cli/docs/design/v2/model/anthropic-reasoning-history-replay.md#coding-plan-provider-identity-compatibility).

### 3.4 Signature de bloco text/tool da Z.ai: implementação candidata não adotada

O HEAD atual e o `origin/staging` não têm replay de signature de bloco text/tool; a implementação correspondente só existe em branches candidatos não mesclados. Este refactor não adota nem porta essa implementação candidata. É possível fazer um teste de wire separado contra o serviço real da Z.ai para confirmar se existe signature não padronizada; mas o resultado do teste só forma nova evidência, não faz o branch candidato entrar automaticamente no design.

Se no futuro o tema for reaberto com base em evidência real, o princípio continua sendo apenas “o que foi recebido é o que é devolvido”:

```text
block.signature real e não padronizada
        |
        v
Adapter captura e guarda no metadata do bloco correspondente
        |
        v
persistência sem perda
        |
        v
fronteira do serializer do SDK grava o bloco original de volta
```

O SDK padrão do Anthropic hoje só permite que blocos de thinking carreguem signature, então, se esse comportamento de wire existir de fato no futuro, só será possível redesenhar a fronteira do SDK; não se pode gerar signature ausente nem fabricar empty thinking.

## 4. Compatibilidade do limite de tokens de saída

### 4.1 Remover a regra especial de omit do GitHub Copilot

`omitMaxOutputTokens=true` é usado atualmente para o match antigo GitHub Copilot + GPT. O GitHub Copilot não é um Built-in Provider oficialmente suportado nesta rodada; essa regra histórica não tem suporte de contrato de produto atual, portanto o campo, a Built-in Rule, o branch do Runner e os testes de construção relacionados são removidos. Quando o Copilot for integrado oficialmente no futuro, ele será redesenhado conforme a interface da época, sem restaurar a regra antiga como padrão.

### 4.2 Snowflake Cortex ainda sem suporte

`maxOutputTokensRequestField="max_completion_tokens"` existe hoje apenas para renomear o `max_tokens` gerado pelo SDK para o Snowflake Cortex. A decisão desta rodada é não suportar Snowflake por enquanto, portanto o campo, a Built-in Rule, a reescrita do body e os testes específicos são removidos, sem manter leitura de compatibilidade. Se o Snowflake passar a ser suportado oficialmente no futuro, será redesenhado conforme a interface da época, sem restaurar essa regra antiga como fato padrão.

## 5. Protocolos de produto do Provider Access

### 5.1 Verificação de segurança de acesso da versão oficial

O Start Plan na versão oficial exige uma verificação de segurança de acesso adicional. É um protocolo de produto, não uma capacidade estática de um modelo nem uma preferência de codificação de API. `access.type=zhipu-account + mode=start-plan` é o único fato estático de despacho; o material dinâmico é gerado e injetado pela cadeia em tempo de requisição e não é persistido no Model Config. A implementação concreta é mantida apenas na versão oficial.

### 5.2 Verificação de segurança de requisição da versão oficial

Coding Plan Individual/Team, Access de plano manual explícito e requisições ao domínio oficial passam por uma verificação de segurança de requisição adicional na versão oficial; as regras concretas de admissão e a implementação são mantidas apenas na versão oficial. O design open source mantém somente as seguintes fronteiras:

- o type das duas Access manuais é preservado como vem ao sobrescrever, serializar, editar a Key e vincular Model; não pode voltar a `api-key` comum ao salvar;
- o julgamento de admissão usa o snapshot de configuração vinculado ao Model desta execução, não lê o Registry em tempo real, não modifica Access, Template ou Model Selection salvos e não adiciona migração;
- não faz parte do Model Config e não infere admissão por ID de modelo, ID de Template ou conteúdo da Key;
- teste de conexão, requisições comuns, subtarefas e execução local e remota continuam pelo Adapter compartilhado; não muda desktop continuous, mobile replayable nem a posse de estado Host/Worker;
- a obtenção da Key usa apenas `apiKeyManagementUrl` como metadado de exibição, um ponto de entrada único para template pessoal/equipe, sem novos campos de link por identidade e sem inferir autorização a partir do link (Todo116).

### 5.3 Protocolo de execução Off-Peak passa a pertencer ao Access

A fila, o Ticket e a retentativa por invalidação do Off-Peak pertencem ao protocolo de execução de acesso a esse serviço de produto, e não a um fato do modelo. `access.type=zhipu-account + mode=off-peak` é o único fato estático de despacho.

Atualmente o Adapter lança um erro de string contendo `off-peak-ticket-expired`, e o Desktop/Renderer o identifica por string ou regex. Esta máquina de estados de execução é mantida equivalente nesta rodada, sem mudar por oportunidade para erro estruturado por causa da migração de atribuição da configuração.

Mantido nesta rodada:

- remoção do `failureProtocol` do Model Config; o mesmo comportamento é habilitado pelo `mode="off-peak"` do Provider Access completo;
- a string de marcador de ticket existente;
- a propagação entre processos e o reconhecimento pela UI existentes;
- a semântica de fila, Ticket, recuperação e agendamento do Off-Peak.

Não é permitido mudar opportunisticamente para erro estruturado nesta rodada, nem disfarçar uma simples “organização de campos” como migração de máquina de estados de produto. Fica como dívida técnica explícita, com design independente no futuro.

### 5.4 Header de atribuição de origem da requisição do Coding Plan

Todas as requisições de modelo enviam `x-zcode-session-type` na camada por requisição do Adapter, com domínio de valores `main`, `subagent`, `side_chat`, `other`. Ele representa o tipo da sessão hospedeira; títulos, Memory e requisições internas de ferramentas herdam o hospedeiro, e o propósito da chamada é expressado separadamente por `x-zcode-query-source`. Requisições independentes de workspace, como o teste de conexão, são classificadas como `other`.

Esse Header é atribuição de origem em nível de requisição, não uma capacidade estática de Provider/Model nem material de autorização:

- não entra em Provider Config, Model Config, Registry ou Active Model;
- não é inferido por Provider ID, Model ID, Endpoint ou Access Mode;
- é produzido pelo contexto de chamada desta execução e sobrescreve valores falsificados de mesmo nome nos Headers estáticos do Provider;
- streaming, não streaming e retry do Adapter usam a mesma lógica de construção, e o retry não muda a classificação de origem.

Tabela de classificação completa e regras de compatibilidade em
[`Header de atribuição de requisição de modelo do Agent`](../../../../superpowers/specs/2026-06-09-agent-model-request-session-header-design.md).

## 6. Fronteiras de Settings

A primeira versão da página de edição de Model não exibe:

- `family` e `mode` do Provider Access da Zhipu;
- os já removidos `openai-reasoning-content`, `omitMaxOutputTokens`, `maxOutputTokensRequestField` e `failureProtocol` do Model Config.

`requiresMfjsToolSchema` continua pertencendo ao Model Config editável, mas fica no último lugar da área avançada. A conversão só é executada quando o campo está explicitamente como true; a falha da conversão deve gerar erro, e não se pode enviar silenciosamente outro Tool Schema.

## 7. Limiares de implementação e verificação

1. Primeiro provar, testando o HTTP request body final, que o SDK OpenAI-compatible atual reproduz nativamente reasoning não vazio; só então remover o helper do ZCode;
2. Remover o campo e a regra de omit do GitHub Copilot, sem manter leitura de compatibilidade;
3. A verificação de segurança da versão oficial é despachada por `zhipu-account.mode` e pela Access explícita, mantendo material dinâmico e estado de execução fora do Config;
4. O fato que habilita o Off-Peak é `mode=off-peak`; o marcador de string e a máquina de estados de execução existente permanecem equivalentes;
5. O DeepSeek executa uniformemente canonical replay, sem synthetic empty-thinking nem Compatibility Config;
6. A implementação candidata de signature text/tool da Z.ai não é adotada; testes de wire reais são uma tarefa de evidência independente;
7. Remover o campo do Snowflake e a reescrita de requisição específica; o Snowflake não é suportado no momento;
8. O Adapter não restaura Compatibility Config genérico, consulta ao Registry nem hardcode de ID.

## 8. Registro de evidências atuais

Esta seção guarda apenas os pontos verificáveis em que se apoiam as decisões desta rodada, sem estabelecer uma auditoria histórica pesada, commit a commit ou folha a folha.

- Anthropic Extended Thinking oficial: <https://platform.claude.com/docs/en/build-with-claude/thinking>. Exige explicitamente que o turno seguinte de tool-use devolva os thinking blocks e signatures reais, completos e como vieram, e permite que um empty thinking real carregue signature válida;
- Thinking Mode oficial do DeepSeek: <https://api-docs.deepseek.com/guides/thinking_mode>. O turno seguinte de ferramenta em formato OpenAI exige devolver o `reasoning_content` real do servidor;
- API Anthropic oficial do DeepSeek: <https://api-docs.deepseek.com/guides/anthropic_api>. Hoje declara suporte apenas a formatos como `thinking`, `tool_use`, `tool_result`, sem exigência de synthetic empty thinking ou signature;
- o `@ai-sdk/openai-compatible@2.0.60` atual, em `convert-to-openai-compatible-chat-messages.ts`, codifica assistant reasoning parts como `reasoning_content`; o changelog do SDK inclui reasoning content de tool call de múltiplos turnos desde 2.0.20;
- `apps/zcode-cli/packages/adapters/src/model/anthropic-reasoning-metadata.ts` é a implementação atual de synthetic empty thinking; `apps/zcode-cli/docs/design/v2/model/anthropic-reasoning-history-replay.md` guarda afirmações de design interno histórico, mas não é evidência de serviço externo;
- os `syntheticReason` das fixtures de Replay atuais do DeepSeek deixam claro que o wire shape relacionado é dado construído e não prova sozinho restrições do servidor;
- o commit candidato de signature text/tool `70546bde31` existe apenas em `origin/anthropic-block-signature-replay-staging-latest` e não é ancestral do HEAD atual nem do `origin/staging`;
- o marcador atual do Off-Peak é a constante `off-peak-ticket-expired`; o Adapter e a UI continuam passando e identificando pela string de erro, mantida nesta rodada conforme o comportamento existente.