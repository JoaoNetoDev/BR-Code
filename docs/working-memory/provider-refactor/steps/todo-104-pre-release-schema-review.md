# Todo 104: Levantamento e refinamento do schema de persistência antes do lançamento

> Decisões posteriores (2026-09-11): o [Todo130](todo-130-manual-model-config-editable-field-boundary.md) substituiu as regras deste documento sobre "desabilitar a chave enquanto a configuração não está pronta / fixar e validar a configuração manual inteira": só desabilita durante o salvamento, o modo manual exige apenas os campos editáveis e os campos de sistema continuam sendo resolvidos. **O Todo130 ainda precisa ser executado**; a implementação antiga e os critérios de aceitação abaixo são preservados como histórico e não representam a semântica nova já implementada.

> Especial de banco de dados posterior, 2026-09-10: o [Todo109](./todo-109-database-migration-consolidation-and-rollback-readability.md) assume o fechamento de todas as migrations do repositório e a legibilidade do conteúdo de rollback. Mantém a semântica de conversão já decidida e preserva campos/valores antigos; enquanto esta migration não for executada, é possível reconstruir o novo campo alvo a partir de uma origem antiga explícita, sem compatibilidade para estados intermediários não lançados. Migrations já concluídas não são reexecutadas e a falta de configuração nova não pode impedir a leitura do conteúdo. Evite ao máximo a double write; quando o conteúdo estiver ilegível, faça a double write mínima necessária. As evidências de implementação já existentes neste documento são preservadas, e os termos de migration/compatibilidade conflitantes têm, no escopo de banco de dados, a precedence dos especiais posteriores; isso não afeta as decisões fora do banco de dados.
> Status: a implementação funcional e a revisão completa do lote foram fechadas, mas a aceitação do artefato final ainda tem limitações; 2026-09-10. As três snapshots de rollback da 6.18, o schema central, as regras externas, nomes e templates, a seleção e distribuição padrão do Personal no mesmo arquivo, os caminhos de execução e a identificação de origem já foram implementados. 155 arquivos e 1296 testes, 156 testes de Wiki/idle e a verificação de settings Pro/recuperação de sessão passaram; os testes de migration do CLI passaram depois de corrigir o seeding de dados reais antigos. Os problemas de empacotamento preexistentes de Server/SEA e as limitações de máquina real no Windows estão no razão; não se afirma que todos os artefatos podem ir para produção. Os 13 itens de suporte da 6.19 foram revisados um a um; o Markdown de Subagent segue o Todo97 e este Todo não muda.
> Autorização atual (atualizada em 2026-09-10): o usuário autorizou explicitamente a execução do que for correto e puder ser decidido pelas decisões já existentes; o que realmente exige uma nova decisão foi preservado. Os trechos "apenas discutido / não autorizado / não implementado" abaixo são preservados como histórico de origem e não representam a autorização nem o estado de conclusão deste rodada.
> Origem: Todo99 do m2, commit fixo 02dfc1b45819626dc6d1614a8e528c72eaed31af; para evitar colisão de numeração com o Worker corrigindo o Todo99 e com a investigação já concluída do Todo100, o número passou a ser Todo104 na integração. O estado de implementação e as evidências estão unificados em [Razão de implementação do Todo104](../research/todo104-schema-implementation-ledger.md).
> Entrada atual do design: [Design V2](../design-v2/design.md). Este documento preserva o contexto desta rodada, as decisões e a estrutura-alvo, sem escrever renomeações não implementadas como um fato do código vigente.

### Complemento sobre granularidade de execução (2026-09-10, exigência mais recente do usuário)

Não executar regressões de larga escala e verificações Pro a cada campo ou ponto pequeno alterado. Os commits já concluídos e suas evidências são preservados; daqui em diante a implementação é feita em lotes por cadeia funcional completa, sem mais desmembrar as pequenas renomeações dentro de B2 em um conjunto de aceitação completo cada.

- Durante o desenvolvimento: primeiro escrever testes discriminantes e rodar os testes direcionados que cobrem diretamente a mudança atual; fazer verificação de tipos local quando necessário. Passos pequenos como propagação de campo e atualização de fixtures não disparam novamente testes de todo o repositório, verificação de tipos de todo o repositório, build compartilhado ou reconstrução Pro.
- Divisão em lotes: as regras restantes de Provider/Model em sua estrutura final, a atribuição de nomes/templates e os pontos de leitura e escrita correspondentes avançam como um lote completo de regras; a seleção e o armazenamento/distribuição padrão no mesmo arquivo, fortemente acoplados ao novo envelope do Personal, são ligados juntos antes de serem aceitos. O caminho de execução e a revision de origem são outro lote de cadeia completa. É permitido unir lotes por acoplamento real, sem dividir o trabalho só para obter muitos commits pequenos.
- Fechamento de lote: rodar em conjunto a verificação de tipos necessária, o lint, a checagem de arquitetura e as regressões relevantes entre domínios, e revisar de novo todos os termos e o que está acima e abaixo; evidências que já passaram e não foram afetadas por mudanças posteriores não são refeitas.
- Pro/E2E: ficam para quando as cadeias completas de settings/execução envolvidas estiverem estáveis, com build compartilhado e verificação em lote; não reconstruir e rodar o mesmo conjunto de casos para cada campo de estrutura. Primeiro concluir a verificação estática e direcionada e só então iniciar a verificação cara, evitando reconstruções repetidas por rodar Pro enquanto se checam tipos.
- Classificar as falhas primeiro. Só rerodar a checagem correspondente para mudanças novas, correções ou fronteiras críticas ainda não provadas; problemas preexistentes ficam registrados e cada falha não vira uma correção independente. Defeitos reais de interação podem ser reproduzidos de forma direcionada antes, mas isso não reinicia a regressão completa.
- O escopo completo do Goal, spec/testes primeiro, a revisão completa final e os requisitos de aceitação crítica permanecem inalterados; apenas a granularidade de execução e verificação é ajustada, sem omitir cobertura necessária e sem escrever como aprovado o que não foi testado.

## 1. Contexto e modo de discussão

Esta rodada começa por "quais schemas que podem ser persistidos que este branch adicionou em comparação com staging". O usuário quer deixar claros os nomes e a estrutura dos campos antes do lançamento, para não descobrir problemas depois do release e ser forçado a migrar dados de usuário. Model Selection, Provider Config e Model Config são as estruturas centrais de primeira preocupação; o escopo da revisão não se limita a esses três nomes, e as outras estruturas novas ainda precisam ser levantadas ao longo das localizações reais de armazenamento.

O usuário permite renomear e reorganizar em conjunto os schemas deste branch que ainda não foram oficialmente publicados, tomando o design de longo prazo como referência; a compatibilidade de upgrade dos dados já publicados em staging é preservada à parte. Isso não equivale a ter decidido todas as compatibilidades, rollbacks ou estratégias de nomeação, nem representa autorização para modificar a implementação imediatamente.

Acordos de collaboration explícitos nesta rodada:

- Primeiro levanta-se, e só então se discute item a item começando pelas estruturas centrais. O usuário já corrigiu explicitamente: "não é para você mudar direto, é para nós dois discutirmos como mudar".
- "Lançar em disco" atualiza apenas o documento de decisões. Umainterpretation anterior tratou "seria melhor corrigir os dois primeiros" como autorização de implementação, e todas as modificações de código, testes e documentos temporários daquela rodada foram revertidas; não houve commit de produto. O que foi lançado em disco desta vez são decisões de correção pendente, não correções concluídas.
- Foco no schema. Campos, tipos, opcionalidade, null, aninhamento etc. são ângulos de discussão, sem aplicar mecanicamente um checklist genérico.
- Problemas concretos com base em código podem ser levantados, mas palpites e sugestões não confirmadas não podem ser escritos como defeito encontrado ou decisão do usuário.
- Quando o usuário perguntar sobre a chamada de um campo, responder primeiro sobre a chamada real e não expandir automaticamente em uma tarefa de correção arquitetural.
- O usuário pediu explicitamente depois "não seja tão agressivo": renomeações puras e envelope enxuto sem benefício claro não continuam sendo ampliados; os registros de refresh/distribuição seguem o esquema de redução de 6.13, sem restaurar as sugestões já revertidas.
- A avaliação de risco parte principalmente da verificabilidade: o usuário disse explicitamente que "tudo que é fácil de verificar não é risco alto". Volume de trabalho e amplitude de impacto não são, sozinhos, motivo para reverter um design; é preciso explicar se o cenário pode ser construído de forma estável, se o resultado é verificável e qual é a diferença entre os testes existentes e a verificação ainda a ser acrescentada. A reavaliação completa está em 6.17.
- A discussão e o lançamento em disco mostram o schema por camada através de interfaces: primeiro o nível superior, depois as estruturas de membros separadamente; cada camada é explicada em uma frase e só então o código da camada é apresentado. Os campos da interface são expandidos diretamente, sem esconder a estrutura da camada com Omit ou tipos Identity intermediários; na implementação os schemas continuam sendo reutilizados e os tipos derivados, sem copiar a interface de exibição para outra definição de implementação. Campos comuns do mesmo nível não recebem explicações longas um a um, e não se enfia de uma vez uma estrutura aninhada completa.
- O resumo de cada rodada cobre apenas a estrutura em discussão naquele momento e não repete de carona outras estruturas já confirmadas antes; no lançamento em disco, todas as decisões históricas são preservadas.
- Arquivos/tabelas, schemaVersion e revision são discutidos separadamente item a item; o escopo se limita às estruturas de persistência novas ou alteradas em comparação com staging, sem expandir mecanismos preexistentes e não relacionados.
- As estruturas de ajuste já determinadas estão nas seções 3, 5 e 6 respectivamente; registrar uma decisão não equivale a autorizar a implementação, e outras estruturas também não passam a ser implementadas automaticamente por estarem listadas neste Todo.
- Redução de escopo mais recente: o usuário só decidiu o conteúdo que este Todo deve alterar; outros Todos e comportamentos já existentes neste branch que este Todo não altera deixaram de ser tarefas de revisão. É permitido deixar de fora e registrar isso; o importante é que as mudanças autorizadas não quebrem comportamentos existentes, e não é preciso ampliar escopo só para perseguir cobertura total.

### 1.1 Schema e tipo como fonte única de verdade (princípio novo desta rodada)

Para as estruturas de dados de persistência/protocolo abrangidas por este Todo, o schema é a fonte única de verdade de campos, aninhamento e restrições. É proibido ter um schema existente e ainda escrever à mão uma lista independente de interface/type com a mesma semântica; o tipo é derivado do schema ou reutilizado por meio de tipos derivados.

- Tipos de dados comuns usam `z.infer` / `z.output`; quando o schema tem transform e é preciso expressar a entrada antes da transformação, usa-se `z.input`, e não se mistura os dados de entrada com a classe transformada no mesmo tipo.
- Variantes como completa, cobertura esparsa e esquema fixo reutilizam o schema base e são combinadas por extend / pick / omit, tratando explicitamente das restrições de obrigatoriedade aninhada, sem recopiar campos. Tornar apenas o top-level required não torna completos todos os membros aninhados.
- A validação de salvamento e a de parse reutilizam o schema correspondente e as restrições de conteúdo compartilhadas, sem manter uma lista paralela de campos de integridade. Ao editar, primeiro se determina a qual conjunto a regra inteligente/manual pertence e só então se valida a regra completa com o schema correspondente; o useRecommendedConfig do código atual e a solução intermediária useSmartConfig não entram na estrutura de persistência final.
- Classes com comportamento como `overlay` e `toJSON` podem ser mantidas; a existência de uma classe não equivale a duplicar o schema de dados. A entrada de construção, a forma serializada e os estreitamentos de tipo necessários continuam reutilizando os tipos derivados.
- O módulo de schema atual depende de classes; na implementação o schema de dados base e as classes de comportamento devem manter dependência unidirecional, sem criar referências circulares para derivar tipos e sem fingir a derivação concluída com any / asserções de tipo.
- Os blocos de interface deste documento servem para comunicar a estrutura-alvo camada a camada e não significam que a implementação exija escrever à mão um segundo conjunto de definições de tipo.

Este princípio já foi incorporado ao Todo por exigência do usuário; até agora só foram feitas a verificação direcionada e o registro, sem alterar a implementação.

### 1.2 Base de leitura e de implementação

A estrutura-alvo final deste Todo tem precedência sobre as explicações históricas deste documento marcadas explicitamente como "proposta anterior" ou "código atual"; nomes históricos servem apenas para localizar o ponto de entrada da transformação e não constituem um segundo formato aceitável. Ao entrar na implementação, as decisões deste documento substituem as partes conflitantes do design antigo, e a descrição vigente do Design V2 é atualizada em conjunto. Comportamentos não tratados seguem o estado atual; "não haver outra decisão" não equivale a poder inventar um mecanismo novo.

As interfaces deste documento mostram apenas a forma dos campos; as restrições de runtime existentes que não estão expressas em TypeScript precisam ser preservadas, por exemplo ID não vazio, teto de inteiros positivos, array de opções não vazio, regex válido e map compilável. Não se pode afrouxar a validação só porque a interface foi escrita como string / number, nem transformar todos os schemas de cobertura esparsa em schemas de configuração completa.

## 2. ModelSelection: confirmado

O usuário aceita a seguinte estrutura geral:

### 2.1 Nível superior

Mantém o Provider, a identidade do modelo e as options opcionais.

```ts
interface ModelSelection {
  providerId: string;
  modelId: string;
  options?: ModelSelectionOptions;
}
```

### 2.2 options

Mantém apenas reasoningLevel; o nome de interface aqui serve só para exibição em camadas e não constitui uma decisão de transformação de tipos.

```ts
interface ModelSelectionOptions {
  reasoningLevel?: string;
}
```

### 2.3 Contexto das decisões

Decisões específicas:

1. A expressão "não selecionado / seguir o padrão" pertence ao schema de nível superior do usuário e não adiciona um campo discriminante novo ao ModelSelection genérico.
2. `maxOutputTokens` não faz parte da seleção de modelo e deliberadamente não entra em `options`. A definição das opções de ModelConfig confirmada depois está na seção 5 e permanece distinta do valor de seleção.
3. A completude em tempo de execução é uma validação de execução e não expande por isso a discussão do schema de ModelSelection desta rodada.
4. Nesta rodada não foi pedido um novo enum para `reasoningLevel`, nem renomeação, nem mudança de opcionalidade, nem autorização de preencher outros campos em options.

Depois disso o usuário aprovou de forma unificada o design de "ligar esta ModelSelection à estrutura já existente", sem discutir mais os pontos de consumo um a um; o escopo está em 6.14. O que foi aprovado foi a escolha estrutural, e a migração de dados antigos e a adaptação dos consumidores ainda precisam ser verificadas na implementação.

## 3. ProviderConfig: alterações confirmadas e itens mantidos

| Item                               | Decisão final                                            | Contexto                                                                                                                                        |
| ---------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelIds`                         | passa a `personalModelIds`                                | O campo original só representa os modelos adicionados pelo usuário e, ao lado de `builtinModelIds`, era facilmente entendido como o conjunto total de modelos. |
| `api.baseURL`                      | passa a `api.baseUrl`                                     | Fica consistente com o estilo abreviado de `apiKeyManagementUrl`. A decisão se limita ao schema em discussão, e não é uma renomeação mecânica de todos os parâmetros de SDK do repositório. |
| `label`                            | removido de ProviderConfig; a regra externa passa a usar `providerName` | O template mantém apenas templateNameMap; o nome de Provider padrão é gerado na criação conforme o idioma atual, deduplicado e salvo, ver 6.5.                        |
| `api` / `ProviderApiConfig`        | mantém o aninhamento e a estrutura independente           | No início questionou-se a necessidade desta camada, e depois discutiram-se `apiType`, `baseUrl` e `headers` no nível superior. O usuário lembrou da consideração original de um OAuth futuro e exigiu explicitamente restaurar `api`. A proposta de achatar foi revertida. |
| `access`                           | mantém a união de estruturas atual                       | Esta rodada não decidiu novos tipos OAuth nem campos OAuth concretos; "talvez haja OAuth no futuro" é motivo para manter o agrupamento, não para implementar OAuth agora. |
| `entitled`                         | mantém o nome, a posição e a semântica atual              | O Provider Config pode conter fatos dinâmicos e não é o autorizador final; ver a próxima seção.                                               |
| `group`, `logo`, `visibility`      | mantém o design atual                                     | Significado e chamadas já foram explicados e esta rodada não confirmou renomeação, mudança de tipo ou extensão de campos.                        |
| `ProviderConfigOverlay` e nomes de tipos alike | não se insistir, nenhuma renomeação é planejada              | O usuário encerrou explicitamente a discussão de nomenclatura.                                                                            |
| Opcionalidade de campos e `null`    | mantém o estado nesta rodada                              | Nenhuma decisão nova alterando a opcionalidade desses campos ou a semântica de limpeza foi formada.                                          |

Inicialmente se manteve providerId como chave do map externo e templateId dentro do ProviderConfig; essa proposta desta fase foi substituída pela estrutura externa final da seção 6.4: providerId e templateId passam ambos para as regras da instância, e o ProviderConfig carrega apenas o conteúdo de configuração. `builtinModelIds` e `modelOrder` mantêm os nomes atuais.

### 3.1 Estrutura-alvo (resultado da discussão, ainda não implementada)

As interfaces abaixo expressam apenas a forma do schema discutida nesta rodada e não exigem reescrever a implementação atual de classes, tipos de ID ou readonly como essas interfaces.

**Nível superior**: `modelIds` passa a `personalModelIds`; templateId vai para a regra externa, label sai e passa a ser o providerName externo, e os demais campos e agrupamentos permanecem.

```ts
interface ProviderConfig {
  group?: ProviderGroup | null;
  logo?: ProviderLogoRef | null;

  api?: ProviderApiConfig | null;
  access?: ProviderAccessConfig | null;

  builtinModelIds?: string[] | null;
  personalModelIds?: string[] | null;
  modelOrder?: string[] | null;

  visibility?: "visible" | "hidden" | null;
}
```

**group**: mantém os três valores atuais.

```ts
type ProviderGroup = "standard-personal" | "zai-family" | "bigmodel-family";
```

**logo**: mantém a estrutura de referência a recurso embutido.

```ts
interface ProviderLogoRef {
  type: "builtin";
  key: string;
}
```

**api**: mantém o aninhamento, com `baseURL` passando a `baseUrl`.

```ts
interface ProviderApiConfig {
  type?: ProviderApiType | null;
  baseUrl?: string | null;
  headers?: Record<string, string> | null;
}
```

**Tipo de API**: mantém os três valores atuais.

```ts
type ProviderApiType = "anthropic-messages" | "openai-chat-completions" | "openai-responses";
```

**access**: mantém as duas estruturas de acesso, sem novo ramo OAuth.

```ts
type ProviderAccessConfig = ApiKeyAccessConfig | ZhipuAccountAccessConfig;
```

**Acesso por API Key**: campos mantidos.

```ts
interface ApiKeyAccessConfig {
  type: "api-key";
  apiKey?: string | null;
  apiKeyManagementUrl?: string | null;
}
```

**Acesso por conta**: campos mantidos, incluindo entitled.

```ts
interface ZhipuAccountAccessConfig {
  type: "zhipu-account";
  accountType?: "zai" | "bigmodel" | null;
  mode?: "start-plan" | "individual-coding-plan" | "team-coding-plan" | "off-peak" | null;
  entitled?: boolean | null;
}
```

**Conjunto de regras externas**: unificado na seção 6.4, sem carregar mais a identidade serializada do Provider por uma chave de Record; as consultas internas ainda podem construir índices Map.

### 3.2 Contexto dos campos já explicado

- `group` é o agrupamento de produto: `standard-personal` corresponde a Providers pessoais comuns (incluindo API Key Providers criados a partir de templates), e `zai-family` / `bigmodel-family` correspondem a Providers de pacotes de conta. Hoje é usado para ordenar agrupamentos, navegar nas settings, restringir exclusões e validar agrupamentos ao salvar; esta rodada não decidiu refatorar essas chamadas.
- `logo` já tem schema: `{ type: "builtin", key: string }`, com validação de runtime de que a key não é vazia, sem restrição a um enum de keys fixas. A UI mapeia a key para ícones embutidos e tem um fallback para keys desconhecidas; nesta rodada não foram adicionados URL, upload customizado ou outros tipos de logo.
- `visibility` controla se a entrada aparece nas settings comuns e no seletor de modelo, e não equivale a desativar a execução. Um Provider Off-Peak hidden ainda pode ser usado pela entrada de execução dedicada.

## 4. Decisão sobre entitled e contexto de chamadas

Explicação final do usuário: esta Config decide o que o ZCode acha que pode usar este modelo e como usá-lo na requisição; se há qualificação no final para usá-lo continua sendo decidido em conjunto pela conta e pelo lado remoto. Por isso faz sentido `entitled` estar no Provider Config.

```text
内置 / 账号 / 个人配置
          |
          v
Effective Provider Config（可以包含动态事实）
          |
          v
ZCode 本地可用性判断与请求装配
          |
          v
账号服务提供请求期访问材料 -> 模型服务端最终鉴权 / 授权
```

Inferências explicitamente revertidas:

- Não se pode afirmar, só porque o nome é Config, que ele só permite fatos estáticos e precisa ser igual à configuração salva pelo usuário.
- Não se pode concluir, só porque `entitled` muda dinamicamente, que ele está no lugar errado e precisa ser movido.
- Os "problemas de design" derivados antes de diferenças de atribuição entre App/CLI, projeção de estado e uso de telemetria não foram reconhecidos pelo usuário e não viram defeito pendente.
- Esta rodada não autorizou alterar `entitled`, `accountState`, o objeto de acesso do protocolo ou consumidores relacionados.

A seguir fica apenas o levantamento das chamadas estáticas desta vez, para facilitar a compreensão posterior dos campos, e não é uma lista de correções:

| Caminho                         | Papel atual                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse do resultado de Account   | `available` gera true, `pending` / `unavailable` gera false; unknown pode reaproveitar um resultado antigo da mesma identidade e, sem resultado antigo, é false. Antes de o fato de conta inicial chegar, é false. |
| App Off-Peak                   | Valor derivado de o pacote pessoal/equipe da mesma família de conta selecionado estar ou não available.                                                          |
| CLI independente                | Valor gerado conforme a identidade de conta local e a existência da API Key correspondente; a checagem de configuração verifica se existe um Provider de conta entitled.         |
| Resolver / Registry do Provider | A elegibilidade de execução de um Provider de conta exige entitled true, além de verificar current, completude da configuração etc.; a opcionalidade também é afetada por visibility. |
| Página de settings              | Participa do status de conta dos itens de navegação, dos cartões de plano, da visibilidade do Start Plan, da verificação de conclusão de conexão/reautorização e da primeira sincronização complementar. |
| Consulta de cota e de plano     | Barra lateral, página de settings, caixa de entrada e snapshot de identidade do plano, obtendo o objeto de acesso da conta e a impressão digital de atualização pelo helper comum.            |
| Consulta de plano somente leitura | Um helper de inspeção dedicado permite consultar benefícios em alguns estados ainda não entitled; só sem accountState é que ele recorre à verificação de entitled. Usado em detalhes de settings, hooks de benefícios, banner de resgate manual e na atualização após OAuth. |
| Telemetria da entrada de compra  | Usa o Provider entitled para inferir o estado do plano ao entrar na compra, usado por entradas como Automations e criação de Off-Peak.                                                |
| Tipos e projeção                | O campo aparece no Provider Access Config, na projeção AccountProviderState e no objeto de acesso de conta do protocolo; esta rodada não muda essas estruturas.                        |

Principais evidências de código (no momento do registro o campo ainda tinha o nome original):

- [ProviderConfig e tipos de Access](../../../../packages/provider/src/config/provider-config.ts)
- [Schema de runtime](../../../../packages/provider/src/config/schema.ts)
- [Parse de resultado de Account e projeção de estado](../../../../packages/provider/src/account-provider-resolution.ts)
- [Verificação de elegibilidade de execução](../../../../packages/provider/src/resolver.ts)
- [Resolução de conexão de conta do App](../../../../packages/services/src/model-provider/accountProviderConnectionResolver.ts)
- [Configuração de conta do CLI independente](../../../../apps/zcode-cli/packages/bootstrap/src/app/standalone-account-provider-runtime.ts)
- [Helpers de Account Access da UI](../../../../packages/ui/src/lib/accountProviderAccess.ts)
- [Página de settings de Provider](../../../../packages/ui/src/settings/ModelProviderSection.tsx)
- [Cálculo do status do plano](../../../../packages/ui/src/settings/model-provider-section/providerFamilyConnectionVisibility.ts)
- [Snapshot da identidade do plano](../../../../packages/ui/src/hooks/usePlanIdentitySnapshot.ts)
- [Telemetria da entrada de compra](../../../../packages/ui/src/lib/codingPlanFunnelTelemetry.ts)
- [Objeto de acesso de conta do protocolo](../../../../packages/shared/src/zcode-protocol/index.ts)

## 5. ModelConfig: alterações confirmadas e estrutura-alvo em camadas

O usuário já confirmou os três pontos abaixo nesta rodada, e a implementação ainda não foi modificada:

- `properties.input_format` / `output_format` passam a `inputFormat` / `outputFormat`, e dentro delas `support_text`, `support_image`, `support_video`, `support_audio` e `support_pdf` passam respectivamente a `supportsText`, `supportsImage`, `supportsVideo`, `supportsAudio` e `supportsPdf`.
- `requiresMfjsToolSchema` sai do nível superior do ModelConfig e entra em `properties`, junto das demais capacidades e restrições do modelo.
- Removidos `optionSpecs.reasoningLevel.type` e `optionSpecs.maxOutputTokens.type`. O usuário pediu primeiro para ver o schema real, confirmou que os nomes de membro já estão vinculados a estruturas enum / limit respectivamente e então concordou explicitamente com a remoção.

A base para remover `type` é que o schema atual já vincula `reasoningLevel` a `enumOptionSpecSchema` e `maxOutputTokens` a `limitOptionSpecSchema`; o `type` não estava sendo usado para desambiguar entre diferentes formas de membro. Os nomes de variável de `map` também estão vinculados a essas duas opções. Nesta fase confirma-se primeiro a remoção do type das duas opções; depois, em 6.6, confirma-se separadamente a remoção do type das regras classificadas por conjunto. O type continua onde ainda é necessário distinguir formas de membro, como em Provider Access, e não há remoção mecânica em todo o repositório.

Os demais campos, a opcionalidade e os nulls mantêm o estado atual; `enabled` continua sendo a configuração de ligar/desligar o modelo. As interfaces abaixo servem para expressar a forma-alvo e não exigem substituir a implementação atual de classes / readonly. Campos comuns não recebem um checklist genérico de design adicional.

### 5.1 Nível superior

`requiresMfjsToolSchema` sai do nível superior e entra em properties.

```ts
interface ModelConfig {
  enabled?: boolean | null;
  properties?: ModelPropertiesConfig | null;
  optionSpecs?: ModelOptionSpecsConfig | null;
}
```

### 5.2 properties

Adiciona `requiresMfjsToolSchema`, e os campos de formato de entrada e saída passam a nomenclatura camelCase.

```ts
interface ModelPropertiesConfig {
  requiresMfjsToolSchema?: boolean | null;
  contextWindow?: number | null;
  inputFormat?: ModelInputFormatConfig | null;
  outputFormat?: ModelOutputFormatConfig | null;
  supportsToolCall?: boolean | null;
  supportsJsonSchemaOutput?: boolean | null;
  supportsNativeWebSearch?: boolean | null;
  supportsMidConversationSystem?: boolean | null;
}
```

### 5.3 Formatos de entrada e saída

Campos internos unificados em `supportsXxx`.

```ts
interface ModelInputFormatConfig {
  supportsText?: boolean | null;
  supportsImage?: boolean | null;
  supportsVideo?: boolean | null;
  supportsAudio?: boolean | null;
  supportsPdf?: boolean | null;
}

interface ModelOutputFormatConfig {
  supportsText?: boolean | null;
}
```

### 5.4 optionSpecs

Esta camada não muda.

```ts
interface ModelOptionSpecsConfig {
  reasoningLevel?: EnumOptionSpecConfig | null;
  maxOutputTokens?: LimitOptionSpecConfig | null;
}
```

### 5.5 Definição de opções

Remove os dois campos `type` das estruturas enum / limit.

> Progresso da implementação (2026-09-10): este item já foi conectado por B2c ao schema, às classes de comportamento, ao Built-in, ao contrato do CLI, ao salvamento das settings e aos testes; a renomeação de mídia e a movimentação de MFJS da seção 5 também foram concluídas por B2d. SC90/F98 do Pro passaram. O agrupamento das regras seguintes e o conjunto independente da configuração manual ainda não foram concluídos, e não se pode considerar o fechamento dos campos da seção 5 como a conclusão de todo o Todo. As evidências completas estão no razão de implementação.

```ts
interface EnumOptionSpecConfig {
  values?: string[] | null;
  map?: string | null;
}

interface LimitOptionSpecConfig {
  max?: number | null;
  map?: string | null;
}
```

`values` mantém a semântica de níveis ordenados, `max` mantém a semântica de teto suportado e `map` mantém a string de expressão que converte em parâmetro de requisição. Esta rodada não decidiu renomear `EnumOptionSpecConfig` / `LimitOptionSpecConfig` nem adicionou opções.

A semântica de cobertura esparsa é mantida: campo ausente significa herdar da camada anterior e null significa limpeza explícita; objetos de configuração são sobrescritos recursivamente pelas regras atuais, e valores comuns como arrays e headers são substituídos inteiros. Ao renomear e mover campos não se pode transformar null em ausente, nem aproveitar para mudar para append de array ou deep merge de headers. A restrição completa de parâmetros do ManualModelConfig é uma exceção à parte, ver 6.2.

Base de código: [tipos ModelConfig e definição de opções](../../../../packages/provider/src/config/model-config.ts) e [schema de runtime com o vínculo de campos](../../../../packages/provider/src/config/schema.ts). No momento do registro a implementação ainda mantinha a nomenclatura antiga, o `requiresMfjsToolSchema` no nível superior e os dois campos `type`.

## 6. Discussão das regras desta rodada e status

### 6.1 Renomeação dos campos Match: confirmada

`baseURLMatch` passa a `baseUrlMatch` e `apiMatch` passa a `apiTypeMatch`. Depois ficou confirmado ainda eliminar o campo providerMatch e a lógica de correspondência correspondente; abaixo só são mostrados os campos comuns reutilizáveis, e não uma quarta regra Match genérica para ser escrita diretamente em arquivo. Os conjuntos do arquivo precisam usar os schemas estritos concretos de 6.3 e não podem aceitar condições que atravessam camadas por causa dessa estrutura ampla.

```ts
interface MatchModelConfigRule {
  modelMatch: string;
  apiTypeMatch?: string;
  baseUrlMatch?: string;
  config: ModelConfig;
}
```

### 6.2 Configuração inteligente e manual: duas regras, dois conjuntos, confirmados

O usuário propôs distinguir o grau de completude do config conforme o modo de configuração inteligente, evitando que ainda seja possível salvar parâmetros incompletos ao desativar a configuração inteligente, e exigiu que a implementação derive e reutilize em vez de copiar a estrutura. A discussão começou renomeando useRecommendedConfig para useSmartConfig, e depois ficou explícito usar dois tipos de regra, ProviderModelConfigRule / ManualProviderModelConfigRule, colocados em dois conjuntos separados. Por fim confirmou-se que a regra persistida não guarda mais um type duplicado, o modo passa a ser expresso pelo conjunto ao qual pertence, e useSmartConfig também deixa de ser persistido. O conceito na UI continua sendo chamado de "configuração inteligente".

A configuração completa após desativar chama-se ManualModelConfig, correspondente a manualModelConfigSchema, substituindo o FixedModelConfig / fixedModelConfigSchema da proposta anterior. Com a configuração inteligente ligada, continua sendo permitida uma cobertura parcial, e "configuração manual" designa especificamente o modo de configuração completa depois de desligar a configuração inteligente.

O schema de código atual declara apenas useRecommendedConfig como boolean opcional + ModelConfig esparso; as entradas de criação/edição chamam `validateComplete` via `assertFixedModelConfigComplete` e excluem os itens com enabled ausente, o parse do modo fixo também não completa lacunas a partir da configuração recomendada, e o Registry final verifica a completude.

Camada do conjunto personal: os dois tipos de regra são dois membros, sem mistura em um único array de união.

```ts
interface PersonalModelConfigRules {
  providerModelRules: ProviderModelConfigRule[];
  manualProviderModelRules: ManualProviderModelConfigRule[];
}
```

Camada das regras exatas comuns: participa da sobreposição da configuração da camada anterior e, no conjunto pessoal, representa a configuração inteligente; as regras exatas embutidas reutilizam este tipo.

```ts
interface ProviderModelConfigRule {
  providerId: string;
  modelId: string;
  config: ModelConfig;
}
```

Camada das regras exatas manuais: parâmetros do modelo completos, sem completar lacunas a partir da configuração recomendada.

```ts
interface ManualProviderModelConfigRule {
  providerId: string;
  modelId: string;
  config: ManualModelConfig;
}
```

O mesmo providerId + modelId só pode pertencer a um dos dois grupos na configuração pessoal, e não é permitido declarar configuração inteligente e manual ao mesmo tempo. Trocar de modo muda o conjunto ao qual a entrada pertence e não mantém um segundo booleano de modo; a validação de salvamento reutiliza o schema de regras do conjunto ao qual pertence.

Camada de configuração manual: exceto o enabled gerenciado de forma independente, os parâmetros do modelo e os membros aninhados obrigatórios estão completos. O nome de tipo completo existe para exibir a responsabilidade; na implementação, o schema base é reutilizado.

```ts
interface ManualModelConfig {
  enabled?: boolean | null;
  properties: CompleteModelProperties;
  optionSpecs: CompleteModelOptionSpecs;
}
```

Relação com a configuração completa: a configuração completa descreve uma configuração de modelo já completa, com enabled também obrigatório; a configuração manual só flexibiliza o enabled e os demais membros são reutilizados. Abaixo está a forma-alvo dos dados; a implementação atual não tem um completeModelConfigSchema independente diretamente reutilizável, e é preciso derivá-lo dos schemas de campos compartilhados em vez de assumir que ele já existe.

```ts
interface CompleteModelConfig {
  enabled: boolean;
  properties: CompleteModelProperties;
  optionSpecs: CompleteModelOptionSpecs;
}
```

Quando uma regra manual participa do parse, o enabled da camada anterior é preservado e só então o enabled próprio da regra manual é aplicado por cima; properties / optionSpecs usam os valores manuais completos, sem completar lacunas a partir da configuração inteligente. Não se pode perder o estado original de liga/desliga do modelo só porque a configuração inteligente foi desligada. Isso estende o comportamento atual do modo fixo, sem criar um terceiro modo nem campos de estado extras.

Camada de propriedades completa: campos folha obrigatórios e não nulos.

```ts
interface CompleteModelProperties {
  requiresMfjsToolSchema: boolean;
  contextWindow: number;
  inputFormat: CompleteModelInputFormat;
  outputFormat: CompleteModelOutputFormat;
  supportsToolCall: boolean;
  supportsJsonSchemaOutput: boolean;
  supportsNativeWebSearch: boolean;
  supportsMidConversationSystem: boolean;
}
```

Camada completa de formatos de entrada e saída: cada capacidade é declarada explicitamente.

```ts
interface CompleteModelInputFormat {
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsPdf: boolean;
}

interface CompleteModelOutputFormat {
  supportsText: boolean;
}
```

Camada de opções completa: todos os campos necessários das duas opções estão presentes.

```ts
interface CompleteModelOptionSpecs {
  reasoningLevel: EnumOptionSpec;
  maxOutputTokens: LimitOptionSpec;
}
```

Camada dos membros de opção: reutiliza a versão completa do schema da opção correspondente, sem restaurar o type de opção já removido.

```ts
interface EnumOptionSpec {
  values: string[];
  map: string;
}

interface LimitOptionSpec {
  max: number;
  map: string;
}
```

Convenção de reutilização na implementação: derivar a versão manual a partir do schema base da regra exata já existente, substituindo apenas config por manualModelConfigSchema, e então inferir os tipos separadamente; manualModelConfigSchema é derivado do schema de configuração completa, flexibilizando apenas o enabled. Não se cria um novo ProviderModelRuleIdentity nem se mantém o tipo condicional PersonalProviderModelConfigRule anterior como uma segunda estrutura de persistência.

Na gravação é possível usar diretamente o schema da regra correspondente para fazer o parse da regra inteira, substituindo a checagem de completude do modo fixo mantida à parte; restrições de faixa numérica, de conteúdo de arrays e de Map também precisam ser reutilizadas. As regras inteligentes comuns continuam podendo ser esparsas e as regras manuais precisam ser completas, sem flexibilizar ou apertar as duas em conjunto. A leitura de arquivo hoje permite configuração incompleta; no futuro, quando a validação de uma regra manual falhar, vale a fronteira de tratamento de erro do arquivo pessoal ao qual ela pertence, e esta rodada não autorizou adicionar a exclusão do arquivo inteiro, o preenchimento automático de parâmetros ou voltar silenciosamente ao modo inteligente. Se, na implementação, o tratamento de erro atual não der conta, o conflito concreto precisa ser reportado.

Evidências: [criação/edição e validação do modo fixo](../../../../packages/provider/src/config-service.ts), [schema das regras](../../../../packages/provider/src/config/schema.ts) e [parse do modo fixo](../../../../packages/provider/src/config/model-config.ts).

### 6.3 Model Rule de cada camada: limites e nomenclatura dos membros embutidos confirmados

No código atual, modelRules, modelApiRules e providerSiteRules reutilizam todos o amplo matchModelConfigRuleSchema, e a serialização reagrupa conforme a presença de campos de API / URL. Esta rodada confirma que cada camada tem um schema estrito próprio, reutilizando as definições comuns via extend; nas três camadas de Match, providerMatch é proibido e a identidade da instância só é expressa pelo providerId + modelId das regras exatas.

Camada dos conjuntos: o membro embutido providerModelRules passa a builtinProviderModelRules, apenas com o prefixo builtin; não se adota a renomeação antes levantada por engano como providerInstanceModelRules / ProviderInstanceModelConfigRule. O providerModelRules do conjunto pessoal não recebe prefixo builtin e o tipo de regra permanece ProviderModelConfigRule.

```ts
interface BuiltinModelConfigRules {
  modelRules: ModelMatchConfigRule[];
  modelApiRules: ModelApiMatchConfigRule[];
  providerSiteRules: ProviderSiteMatchConfigRule[];
  templateModelRules: TemplateModelConfigRule[];
  builtinProviderModelRules: ProviderModelConfigRule[];
}
```

Camada de Model: modelMatch é obrigatório e condições de Provider, API ou URL não são aceitas.

```ts
interface ModelMatchConfigRule {
  modelMatch: string;
  config: ModelConfig;
}
```

Camada de Model + API: reutiliza a camada de Model e acrescenta apiTypeMatch obrigatório, sem aceitar condições de Provider ou URL.

```ts
interface ModelApiMatchConfigRule {
  modelMatch: string;
  apiTypeMatch: string;
  config: ModelConfig;
}
```

Camada de Site: reutiliza a camada de Model e acrescenta baseUrlMatch obrigatório e apiTypeMatch opcional, sem aceitar condições de Provider.

```ts
interface ProviderSiteMatchConfigRule {
  modelMatch: string;
  baseUrlMatch: string;
  apiTypeMatch?: string;
  config: ModelConfig;
}
```

modelMatch é obrigatório nas três camadas; quando a regra vale para o site inteiro, escreve-se explicitamente `".*"`. As regras de busca e de System no meio da conversa já existentes para os sites Anthropic da Z.ai / BigModel são exatamente esse uso, e o usuário confirmou a manutenção. As interfaces acima servem para exibição em camadas e os tipos reais continuam devendo ser derivados dos schemas correspondentes; não se pode simplesmente apagar um campo TypeScript e deixar o schema de runtime aceitar um providerMatch desconhecido.

Os campos de correspondência continuam sendo strings de expressão regular, e apiTypeMatch não vira um único valor de enum de API. Mantêm-se a semântica atual de correspondência da string inteira, de modelMatch ignorar maiúsculas/minúsculas e de normalização de URL; não se deve transformar a renomeação em comparação de igualdade ou em correspondência de substring. Caracteres como pontos no caminho do site precisam ser escapados corretamente conforme a semântica de regex.

A ordem original dentro de cada array é preservada, e a configuração do modelo continua sendo sobrescrita camada a camada conforme o diagrama abaixo; o agrupamento e a remoção de type não alteram a prioridade e também não permitem que a serialização adivinhe de novo o conjunto a partir dos campos. As regras pessoais comuns e manuais são mutuamente exclusivas conforme 6.2, sem depender de qual dos dois grupos vier depois para resolver o conflito.

```text
modelRules -> modelApiRules -> providerSiteRules
    -> templateModelRules -> builtinProviderModelRules
    -> 个人普通规则 或 个人手动规则
```

Camada das regras exatas de modelo de template: a categoria é determinada pelo conjunto templateModelRules e o type duplicado deixa de ser salvo.

```ts
interface TemplateModelConfigRule {
  templateId: string;
  modelId: string;
  config: ModelConfig;
}
```

As regras exatas de modelo de Provider estão em 6.2; o conjunto embutido só aceita ProviderModelConfigRule comuns, sem misturar regras manuais.

### 6.3.1 As quatro regras existentes que atravessavam camadas: todas movidas para a camada Site, confirmado

A verificação feita nesta rodada com as configurações reais e os registros de commit encontrou: na camada Model há uma regra curinga de Provider de conta, e na camada Model + API há três regras com condição de Provider. Antes se havia sugerido manter o providerMatch com o argumento de "já existe uso atual disso", e o usuário vetou explicitamente; o schema deve ser restringido pela responsabilidade de cada camada, sem flexibilização por causa de regras que atravessam camadas.

| Posição e condição originais                                                       | O que cobre                    | Tratamento após a confirmação                                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Model: Provider de conta pessoal / equipe / Start Plan, modelMatch `".*"`        | entrada de imagem e vídeo = true | Passa a ser condição de Endpoint e é movida para providerSiteRules; mantém modelMatch `".*"`                     |
| Model + API: anthropic, modelos Claude, Anthropic Messages                      | busca nativa e System no meio = true | Movida para providerSiteRules, casando pelo Endpoint da Anthropic e mantendo as condições de modelo e API       |
| Model + API: moonshot-kimi, série K3, Anthropic Messages                        | schema de ferramenta MFJS = true | Movida para providerSiteRules, casando pelo Endpoint da Moonshot e mantendo a condição de modelo K3 e de API, sem ser elevada a regra comum a todos os sites |
| Model + API: deepseek, todos os modelos, Anthropic Messages                      | busca nativa e System no meio = true | Movida para providerSiteRules, casando pelo Endpoint da DeepSeek e mantendo modelMatch `".*"` e a condição de API |

Os Endpoints vêm da configuração/registro de templates atual e, na implementação, a condição de correspondência é gerada conforme o caminho correspondente, sem ser arbitrariamente ampliada para o domínio inteiro só por virar uma regra de Site:

- Imagem e vídeo correspondem aos três Endpoints usados hoje por pessoal, equipe e Start Plan: `https://api.z.ai/api/anthropic`, `https://open.bigmodel.cn/api/anthropic` e `https://zcode.z.ai/api/v1/zcode-plan/anthropic`.
- Anthropic: `https://api.anthropic.com/v1`.
- Moonshot: `https://api.moonshot.cn/anthropic`.
- DeepSeek: `https://api.deepseek.com/anthropic`.

O usuário concordou explicitamente em declarar imagem e vídeo por Endpoint: instâncias comuns de API Key e instâncias de conta do mesmo Endpoint passam a ter a mesma capacidade de site. A sugestão anterior de que "a capacidade de conta precisa ficar em builtinProviderModelRules, para evitar que uma instância comum de API Key seja atingida" foi substituída por esta decisão e não pode continuar sendo implementada como restrição. As regras de conta originais não incluíam Off-Peak e, desta vez, o Endpoint separado dele não é acrescentado.

As regras de site já existentes que casam com os dois Endpoints comuns da Anthropic da Z.ai / BigModel acima são mantidas: modelMatch `".*"`, API Anthropic Messages, declarando supportsNativeWebSearch e supportsMidConversationSystem como true. Nesta rodada a regra de busca existente não é ampliada sem fundamento até o Endpoint do Start Plan; não se deve misturar as condições de URL de regras diferentes só porque a regra de imagem/vídeo inclui o Start Plan.

No fim o campo providerMatch é removido, junto com a lógica de parse, correspondência e serialização correspondente; as quatro regras originais viram regras de site e não se mantém uma segunda entrada de correspondência por regex de Provider em nome da compatibilidade com o formato novo. As regras de instância exatas por providerId + modelId continuam sendo mantidas.

Evidências: [configuração Built-in atual](../../../../config/provider/zcode-builtin.json) e [parse e serialização das regras](../../../../packages/provider/src/config/model-config.ts). A regra curinga de mídia da conta foi adicionada no commit de refatoração de templates `9d3289240d4`; estes são fatos estáticos de implementação e decisões de design desta rodada, e não se afirma que a verificação real da capacidade do servidor foi concluída.

### 6.4 Templates, instâncias e conjuntos de regras de Provider: confirmados

O usuário achou estranho templateId dentro do ProviderConfig; a proposta inicial de um invólucro ProviderDefinition foi apontada como "mais uma camada, identidade ainda espalhada e nomenclatura assimétrica". Depois providerId também foi colocado na camada externa, ficando simétrico em relação a ModelConfigRule, e o Template foi absorvido no sistema de regras. O usuário apontou ainda que Provider usa Rule[] e Model usa Rules de forma assimétrica, e no fim tudo foi unificado em um objeto de conjuntos de regras, com arrays internos por categoria.

Camada de conteúdo da configuração embutida: ambos os lados usam um objeto de conjuntos de regras.

```ts
interface BuiltinProviderConfig {
  providerConfigRules: BuiltinProviderConfigRules;
  modelConfigRules: BuiltinModelConfigRules;
}
```

Camada dos conjuntos de regras de Provider: templates e instâncias ficam em grupos separados, substituindo os invólucros providers e providerTemplates que existiam antes.

```ts
interface BuiltinProviderConfigRules {
  templateRules: ProviderTemplateConfigRule[];
  providerRules: ProviderConfigRule[];
}
```

Camada das regras de template: carrega a identidade do template, o nome de exibição e o conteúdo de configuração.

```ts
interface ProviderTemplateConfigRule {
  templateId: string;
  templateNameMap: ProviderTemplateNameMap;
  config: ProviderConfig;
}
```

Camada das regras de instância: carrega a identidade concreta do Provider e a relação opcional com o template.

```ts
interface ProviderConfigRule {
  providerId: string;
  templateId?: string | null;
  providerName?: string | null;
  config: ProviderConfig;
}
```

O nome de tipo volta explicitamente a ser ProviderConfigRule e não se adota o ProviderInstanceConfigRule acrescentado antes por engano. O prefixo builtin pedido pelo usuário se aplica apenas ao membro builtinProviderModelRules do conjunto de regras de Model e não altera a nomenclatura desses tipos de regra.

O ProviderConfig interno remove templateId e label. Embora os dois tipos de regra reutilizem o conteúdo de configuração, o schema de runtime concreto continua restringindo os campos permitidos em cada um, por exemplo um template não pode gravar API Key. A configuração pessoal só permite regras de instância e isso não acrescenta a funcionalidade de templates definidos pelo usuário; o invólucro do arquivo pessoal está confirmado em 6.7. A Os requisitos de configuração específicos de origem estão em 6.8. A decisão final de nomenclatura está em 6.5.

Limites de conversão da estrutura:

- A chave do Record original passa para o providerId da regra, o config.templateId original passa para o templateId da regra e o label original da instância vira o providerName externo; os demais campos de configuração permanecem no config, e o config.label original do template deixa de ser uma segunda origem de nome padrão.
- providerId e modelId que já estão no novo sistema de identidade de Provider são mantidos, e a mudança para fora não troca a identidade de uma ModelSelection já salva. As identidades antigas do staging ainda migram para o novo sistema pelas regras existentes de importer / conversão de identidade; não se pode entender "mover para fora não muda o ID" como cancelar a migração de identidades antigas.
- A unicidade de identidade na mesma camada do mapeamento original de Provider / Template é preservada na conversão de Record em array: os providerRules da mesma origem não repetem providerId e os templateRules não repetem templateId; a sobrescrita do mesmo Provider por origens diferentes continua legítima. Não se pode converter primeiro em Map e depois engolir silenciosamente entradas duplicadas com o último item. Essa restrição não se generaliza para proibir várias regras de Match atingindo o mesmo modelo.
- providerOrder continua expressando a ordem de exibição de forma independente e não passa automaticamente a ser a ordem do array.
- No parse o índice de templates é construído primeiro, sem exigir que templates e instâncias venham ordenados por referência.
- O ponto de entrada de upgrade dos dados antigos do staging deve produzir a estrutura final; o formato intermediário não publicado neste branch não exige uma migração de transição, e o limite de versão está em 6.11, com os pontos de entrada de migração existentes e de conferência da implementação em 6.16.

```text
providerConfigRules
    +-- templateRules -> 模板索引
    +-- providerRules -> 按 templateId 查模板 -> 合成实例配置
```

As propostas anteriores de ProviderDefinition, de ProviderConfigRules = ProviderConfigRule[] e de templates em um providerTemplates separado foram substituídas pela estrutura acima e não servem como plano de implementação paralelo.

### 6.5 Nome do template e nome do Provider: confirmados

O template guarda apenas nomes multilíngues: nameMap passa a templateNameMap e displayNames não é adotado. O template deixa de gravar separadamente name ou config.label como nome padrão da instância.

```ts
interface ProviderTemplateNameMap {
  "zh-CN"?: string;
  "en-US"?: string;
}
```

O nome do Provider se chama providerName na ProviderConfigRule externa, e a opcionalidade e o null mantêm temporariamente a forma descrita acima, substituindo o name da proposta intermediária. Quando o usuário especifica um nome manualmente, é usado o nome do usuário; o contrato de geração do nome padrão decidido nesta rodada é:

1. Na criação, o nome não vazio do idioma atual é buscado em templateNameMap, com fallback para en-US e depois para templateId.
2. O nome é deduplicado contra os nomes de Provider já existentes, ignorando espaços nas pontas e maiúsculas/minúsculas na comparação.
3. Quando já está ocupado, tenta-se em sequência `Nome 2`, `Nome 3` etc., tomando o primeiro nome livre. Por exemplo, existindo Anthropic e Anthropic 2, a criação seguinte resulta em Anthropic 3.
4. O resultado é realmente salvo no providerName externo; trocar o idioma ou atualizar o nome do template não altera o nome de uma instância já criada. O nome padrão não é lido temporariamente do template a cada exibição.
5. Ler o nome existente, gerar um nome disponível e salvar ficam na mesma atualização de configuração, evitando que criações concorrentes obtenham nomes duplicados.

```text
创建 Provider（当前语言）
    -> 模板当前语言名称 / en-US / templateId
    -> 同一次配置更新内检查重名、选取可用名称
    -> 保存 providerName
    -> 后续展示读取已保存名称
```

O que esta rodada confirma é o nome padrão do template e a deduplicação na criação; não se deriva disso uma especificação de uniformização de nomes de todo o repositório. Preserva-se o contexto das decisões históricas: primeiro propôs-se mudar label para name e movê-lo para fora, depois o usuário deixou claro que o template usa apenas um mapa de nomes e que o nome padrão da instância também é gerado a partir desse mapa, e por fim exigiu que o campo da instância se chamasse providerName de forma mais explícita, confirmando a deduplicação na criação antes de salvar.

Base no estado atual: [criação e deduplicação de nomes](../../../../packages/provider/src/config-service.ts) e [fallback de idioma do nome do template](../../../../packages/provider/src/config/provider-config.ts). O código atual ainda usa template.config.label na criação; mudar a origem do nome padrão para o templateNameMap do idioma atual é a alteração ainda a implementar neste Todo.

### 6.6 O conjunto de regras determina a categoria; type é removido das regras persistidas: confirmado

Como cada tipo de regra já ocupa um array próprio, as regras de template, de Provider, de Match de Model, de Match de Model + API, de Match de Site, de modelo exato de template, de modelo exato de Provider e de modelo manual deixam de gravar o type duplicado. As interfaces-alvo de cada camada anteriores já foram ajustadas de forma sincronizada, e não ficou só registrado no texto.

| Conjunto ao qual pertence                                      | Tipo do membro                   |
| ------------------------------------------------------------- | -------------------------------- |
| providerConfigRules.templateRules                             | ProviderTemplateConfigRule       |
| providerConfigRules.providerRules                             | ProviderConfigRule               |
| modelConfigRules.modelRules                                   | ModelMatchConfigRule             |
| modelConfigRules.modelApiRules                                | ModelApiMatchConfigRule          |
| modelConfigRules.providerSiteRules                            | ProviderSiteMatchConfigRule      |
| modelConfigRules.templateModelRules                           | TemplateModelConfigRule          |
| modelConfigRules.builtinProviderModelRules embutido           | ProviderModelConfigRule          |
| modelConfigRules.providerModelRules pessoal                   | ProviderModelConfigRule          |
| modelConfigRules.manualProviderModelRules pessoal             | ManualProviderModelConfigRule    |

Se a execução interna precisar de um tratamento combinado, ela pode deduzir um rótulo de categoria interno a partir do conjunto ao qual pertence; não se pode exigir que o arquivo grave uma segunda categoria nem adivinhar o conjunto de origem da regra a partir de campos Map/API/URL e, com isso, perdendo a fronteira de origem. A chave de configuração inteligente da UI corresponde ao conjunto comum/manual das regras pessoais e não grava useSmartConfig em separado.

Esta decisão remove apenas o type dos objetos de regra que é determinado pelo conjunto. O type de protocolo da API do Provider, os types api-key / zhipu-account do Access e o type do recurso de Logo são mantidos; não remover mecanicamente campos type em todo o repositório. Historicamente as regras inteligente / manual foram primeiro separadas por type, depois divididas em dois arrays e por fim o type duplicado foi removido; a versão final é a desta seção e a de 6.2.

### 6.7 Invólucro dos arquivos de configuração embutido / pessoal: confirmado

Camada do arquivo embutido: mantém a versão, a revision publicada e a camada de conteúdo config. O usuário confirmou que o formato embutido novo e não publicado deste branch é consolidado do schemaVersion: 3 atual para schemaVersion: 1; as regras da revision publicada e a review estão em 6.12.

```ts
interface ZCodeBuiltinRelease {
  schemaVersion: 1;
  revision: number;
  config: BuiltinProviderConfig;
}
```

A camada de conteúdo embutida e os dois conjuntos de regras reutilizam as definições completas de 6.3 / 6.4.

Camada do arquivo pessoal: acrescenta uma camada config, mantendo a separação de versão e de conteúdo do arquivo embutido.

```ts
interface PersonalProviderConfigFile {
  schemaVersion: 1;
  config: PersonalProviderConfig;
}
```

Camada de conteúdo pessoal: grava a ordem de exibição independente, os dois conjuntos de regras e a seleção de modelo padrão. O providers original passa a providerConfigRules e o Record original é convertido em arrays de regras agrupados; a decisão da seleção padrão está em 6.9.

```ts
interface PersonalProviderConfig {
  providerOrder?: string[];
  providerConfigRules: PersonalProviderConfigRules;
  modelConfigRules: PersonalModelConfigRules;
  defaultModelSelection?: ModelSelection;
}
```

Camada dos conjuntos de Provider pessoal: declara apenas Providers concretos e não inclui o conjunto de templates.

```ts
interface PersonalProviderConfigRules {
  providerRules: ProviderConfigRule[];
}
```

Camada dos conjuntos de Model pessoal: a definição completa está em 6.2, gravando providerModelRules e manualProviderModelRules separadamente, e é proibido que a mesma identidade de modelo apareça nos dois grupos ao mesmo tempo.

Conjuntos da interface sem ? precisam existir no arquivo final, com um array vazio quando não houver entradas; por exemplo, a configuração pessoal mantém os três arrays providerRules, providerModelRules e manualProviderModelRules. providerOrder e defaultModelSelection continuam opcionais e não se escreve null neles só para completar os campos. Essa é a convenção de leitura e escrita das interfaces acima, e não um novo formato de configuração vazia.

```text
内置文件
|-- schemaVersion
|-- revision
`-- config
    |-- providerConfigRules
    |   |-- templateRules[]
    |   `-- providerRules[]
    `-- modelConfigRules
        |-- modelRules[]
        |-- modelApiRules[]
        |-- providerSiteRules[]
        |-- templateModelRules[]
        `-- builtinProviderModelRules[]

个人文件
|-- schemaVersion
`-- config
    |-- providerOrder[]
    |-- providerConfigRules
    |   `-- providerRules[]
    |-- modelConfigRules
    |   |-- providerModelRules[]
    |   `-- manualProviderModelRules[]
    `-- defaultModelSelection?
```

providerOrder continua expressando a ordem de exibição de forma independente e não é substituído pela ordem dos arrays de regras. A proposta anterior de colocar providerOrder / providerConfigRules / modelConfigRules diretamente na raiz do arquivo pessoal foi substituída, e a questão de adicionar config ao arquivo pessoal deixou de ser pendente. A versão do arquivo está em 6.11 e a implementação e a verificação da migração em 6.15.

### 6.8 Schema de configuração específico de origem: mantém os limites atuais, revisão aprovada

Marcar o config de todas as regras simplesmente como o ProviderConfig comum esconderia as diferenças entre origens. Elas indicam que o mesmo conteúdo de configuração comum tem campos permitidos diferentes em cada ponto de escrita, e não um novo arquivo de configuração nem outra estrutura de domínio de Provider. O usuário concordou inicialmente em discutir isso em detalhe e depois pediu para verificar apenas problemas evidentes, mantendo o que não tivesse problema grave; a verificação direcionada não encontrou nenhum problema estrutural que exigisse refazer algo, e este item foi aprovado.

O código atual já tem os limites abaixo, que precisam continuar valendo após a movimentação de nomes/identidade feita nesta rodada:

| Origem    | Contexto de permissões/restrições já verificado                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template  | Hoje oferece logo, api, builtinModelIds e metadados de API Key Access sem apiKey; não declara modelos pessoais. O label antigo é removido por decisão desta rodada, e o nome do template só existe no templateNameMap externo. |
| Built-in  | group é obrigatório e limitado a zai-family / bigmodel-family; permite logo, api, access, builtinModelIds e visibility, e não declara personalModelIds / modelOrder. Identidade e nome vão para fora conforme 6.4 / 6.5. |
| Personal  | Não permite builtinModelIds; group só aceita o valor de cobertura standard-personal; o access do Account Provider fixo não pode ser sobrescrito pela camada pessoal. O Endpoint pessoal permite manter por enquanto strings de edição não concluída, e é a validação final de completude que decide se a execução é possível. |
| Account   | Hoje só oferece builtinModelIds, além da cobertura entitled do Access zhipu-account; não é um ponto de escrita para campos arbitrários de ProviderConfig. O type do Access é mantido. |

Na implementação essas restrições de campos já existentes são preservadas por meio de schemas derivados da base, junto com as renomeações confirmadas e a movimentação de identidade/nome; não se acrescenta engenharia de reagrupamento por origem nem de nomes de tipos dedicados. 6.4 / 6.7 mostram a forma comum com ProviderConfig / ProviderConfigRule compartilhados, o que não significa que todas as origens possa escrever todos os campos sem distinção. Validações que dependem do providerId, como a proibição de gravar access no Provider de conta fixo na camada pessoal, precisam continuar na validação da regra externa mesmo após a movimentação dos IDs, e não podem ser perdidas só por mover os campos.

Base da verificação: 66 casos nos quatro arquivos de teste existentes provider-config-kinds, config-overlay, config-service e todo21-source-contracts passaram. O que se verifica aqui são as restrições e o comportamento de mesclagem atuais, e não se afirma que a estrutura-alvo já esteja implementada; o código de produto não foi modificado.

Evidências: [schemas específicos de origem atuais](../../../../packages/provider/src/config/schema.ts), [codec do arquivo pessoal](../../../../packages/provider-node/src/provider-config-file-codec.ts) e [invólucro de publicação embutida](../../../../packages/provider-node/src/zcode-builtin-release.ts). Esta rodada não implementou essas transformações de estrutura nem a migração de dados.

### 6.9 A seleção de modelo padrão é fundida ao arquivo de configuração pessoal: confirmado

Contexto: o código atual cria separadamente model-selection.json, guardando schemaVersion e configuredDefault. O usuário achou desnecessário abrir um arquivo novo separado, aceitou a fusão na configuração pessoal e confirmou em seguida a posição e o nome dos campos. Uma estrutura lógica independente não exige um arquivo físico independente; esta decisão substitui a exigência anterior do documento de manter model-selection.json separado, e a implementação atual ainda não foi alterada.

Decisão mais recente: durante a discussão de riscos o usuário cancelou temporariamente a fusão; em seguida confirmou que concorrência, notificação, distribuição e rollback permitem construir cenários de verificação claros e pediu explicitamente para "restaurar". Por isso a fusão de arquivos desta seção, o config.defaultModelSelection, o envelope de distribuição correspondente e o plano de rollback unificado foram todos restaurados; os cinco limites de schemaVersion permanecem. O cancelamento temporário nunca entrou no código de produto e não é mantido como solução final.

Camada do arquivo: reutiliza o PersonalProviderConfigFile de 6.7, com schemaVersion gerenciando o formato do arquivo inteiro e config guardando o conteúdo de configuração do usuário; a seleção padrão não vai para a camada de metadados do arquivo e não mantém seu próprio invólucro de versão.

```ts
interface PersonalProviderConfigFile {
  schemaVersion: 1;
  config: PersonalProviderConfig;
}
```

Camada de conteúdo: a seleção padrão fica no mesmo nível das regras de Provider / Model e da ordenação, com o nome de campo defaultModelSelection. configuredDefault é um termo de runtime em que configured fica repetido no conteúdo de configuração e default não especifica o objeto, por isso o nome não é adotado.

```ts
interface PersonalProviderConfig {
  providerOrder?: string[];
  providerConfigRules: PersonalProviderConfigRules;
  modelConfigRules: PersonalModelConfigRules;
  defaultModelSelection?: ModelSelection;
}
```

Camada do membro de seleção: reutiliza o ModelSelection já confirmado na seção 2, com providerId, modelId e options opcionais, sem acrescentar uma camada de invólucro nem colocar semântica de default no ModelSelection genérico. defaultModelSelection ausente significa que o usuário não especificou uma seleção de modelo padrão do ambiente; trata-se de uma preferência de nível de ambiente, e não de um histórico de escolhas de sessão.

Na implementação os pontos de entrada de leitura e escrita do arquivo separado atual são ligados ao config.defaultModelSelection dentro do arquivo pessoal. O estilo unificado de nome de arquivo ainda não foi decidido, e a sugestão de trocar provider_config.json por provider-config.json não é registrada como confirmada por efeito colateral. A versão específica está em 6.11; o escopo do identificador de conflito de salvamento após a fusão e o arranjo de migração de dados já publicados ainda precisam ser implementados. Esta seção só confirma a fusão do arquivo físico, a posição e o nome do campo, sem decidir o comportamento de exclusão do arquivo antigo; o limite de compatibilidade dos formatos intermediários não publicados está em 6.10.

A leitura e a escrita após a fusão precisam carregar esse campo por completo: ao salvar Provider, Model ou ordenação, a seleção padrão atual é preservada; ao definir ou limpar a seleção padrão, as demais configurações pessoais são preservadas. Limpar a seleção padrão remove apenas esse membro opcional e não pode excluir o provider_config.json inteiro. O Repository atual da seleção padrão faz rm do arquivo quando a decodificação do arquivo separado falha, e esse tratamento não pode ser ligado como está ao arquivo pessoal fundido, sob pena de apagar também a configuração de Provider e de API Key; após a fusão, o Repository do arquivo pessoal passa a tratar os erros de arquivo de forma unificada.

A atualização do mesmo arquivo físico reaproveita a leitura-modificação-escrita com lock da configuração pessoal e a verificação de conflito, a revision persistente cobre a seleção padrão do arquivo e a notificação de mudança precisa chegar aos consumidores da seleção padrão. Não se especifica um campo revision extra nem um novo protocolo de lock, e se cada visão publica continua ou não continua a ser determinado pelo seu conteúdo real.

```text
Provider / Model / 排序修改 --+
默认选择设置 / 清除 ---------+-> 同一个人文件更新入口
                                -> 持锁读取最新内容
                                -> 修改目标成员，保留其他成员
                                -> 原子写入并通知对应消费者
```

Um arquivo pessoal final sem defaultModelSelection significa que nenhum padrão foi especificado; não se pode, só porque esse membro está ausente, restaurar a cada inicialização uma escolha que o usuário já limpou. A importação de dados antigos e a verificação da existência do arquivo final precisam ser adaptadas em conjunto.

Evidências: [codec do arquivo de seleção padrão atual](../../../../packages/provider-node/src/model-selection-config-file-codec.ts), [Repository da seleção padrão atual](../../../../packages/provider-node/src/model-selection-config-repository.ts) e [montagem atual do arquivo separado](../../../../packages/services/src/node.ts).

### 6.10 Escolha dos arquivos novos e diretório de manutenção do programa: confirmado

Contexto: o usuário pediu para ver apenas os arquivos e tabelas novos em comparação com o staging e confirmar a necessidade de cada um, sem misturar arquivos, schemaVersion e revision numa mesma rodada de explicação. A transformação de Provider / ModelSelection desta rodada não adicionou arquivos nem tabelas de banco, mas nas três tabelas existentes automations, automation_runs e off_peak_tasks do tasks-index.sqlite atual foi adicionada uma coluna model_selection TEXT cada, e não se pode ler "sem tabela nova" como "sem coluna ou migração nova". O design dessas colunas e das outras estruturas existentes que passam a usar ModelSelection foi aprovado de forma unificada, ver 6.14. Aqui ficam registradas apenas as escolhas de arquivos desta rodada, sem iniciar uma refatoração de catálogo de todo o repositório.

Camada de configuração do usuário: mantém provider_config.json, que concentra a configuração pessoal de Provider / Model, a ordenação e a seleção de modelo padrão de 6.9. O config.json综合 antigo continua cuidando das demais configurações e o conteúdo antigo de Provider serve apenas como entrada de upgrade. O estilo global de nomenclatura de arquivos ainda não foi confirmado e provider_config.json não é trocado por hífens por efeito colateral.

Camada de manutenção do programa: tudo unificado no diretório runtime/provider/ sob o diretório do ambiente. Aqui runtime representa os dados mantidos pelo programa, e não arquivos temporários que se pode apagar à vontade. As duas propostas anteriores de diretórios de topo cache/ e state/ foram substituídas.

```text
~/.zcode/v2/
|-- provider_config.json
|-- bot-config.v3.json
|-- bot-state.v3.json
`-- runtime/
    `-- provider/
        |-- <平台>/<应用版本>/<服务端地址标识>/
        |   |-- zcode-builtin.json
        |   `-- zcode-builtin-refresh.json
        |-- provisioning.json
        `-- bundled/
            `-- zcode-builtin.json
```

O diretório de usuário no diagrama é uma representação do ambiente padrão; o caminho real continua sendo determinado pela resolução de caminhos do ambiente e pela injeção do host, e não pode ter o diretório principal do usuário fixado no código. A configuração baixada e o registro de refresh continuam mantendo as dimensões de isolamento de plataforma / versão do aplicativo / endereço do servidor.

Decisões por arquivo:

| Implementação ou recurso atual                       | Alvo confirmado                                                | Razão                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| provider_config.json                                | mantido                                                        | concentra a configuração pessoal de Provider / Model sem ocupar o config.json综合 antigo                        |
| model-selection.json                                | fundido em config.defaultModelSelection                        | um membro lógico independente não exige outro arquivo físico, ver 6.9                                            |
| active.json                                         | runtime/provider/<diretório de isolamento>/zcode-builtin.json   | o nome diz diretamente o conteúdo; como configuração embutida adotada após o download, pode ser reconstruída a partir da configuração que acompanha o pacote quando ausente |
| refresh-control.json                                | zcode-builtin-refresh.json no mesmo diretório do arquivo baixado | registra a ocupação de refresh por múltiplos processos, o horário do refresh e a informação de retentativa de falha; não é configuração do usuário |
| provider-provisioning-state.json                    | runtime/provider/provisioning.json                             | guarda o ID e o resultado das requisições de distribuição bem-sucedidas, evitando que o reenvio sobrescreva a configuração alvo; não é uma cópia completa da configuração e, depois de perdida, o histórico de deduplicação não pode ser reconstruído diretamente |
| bot-config.v3.json                                  | mantém o esquema atual de arquivo novo                          | importa do bot-config.json do staging e o arquivo antigo é preservado; sem double write contínuo e sem voltar a sobrescrever o arquivo original |
| bot-state.v3.json                                   | mantém o esquema atual de arquivo novo                          | importa das entradas existentes como o bot-state.v2.json do staging e o arquivo antigo é preservado; sem voltar a sobrescrever o arquivo original |
| zcode-builtin.json que acompanha o pacote           | mantém o recurso que acompanha o pacote                        | fornece a base embutida para a primeira inicialização e para o uso offline; usa o mesmo schema de publicação que o conteúdo baixado do remoto |
| zcode-builtin-<hash do conteúdo>.json liberado do recurso embutido | fixado em runtime/provider/bundled/zcode-builtin.json      | CLI / Server e formas de arquivo único reutilizam a cadeia de leitura de arquivos; é uma cópia do recurso, e não um novo schema de configuração do usuário |

Semântica de sobrescrita da cópia do recurso: o usuário depois exigiu explicitamente sobrescrita, sem manter cópias históricas nomeadas por hash. Usa-se portanto fixamente runtime/provider/bundled/zcode-builtin.json, e na inicialização do novo programa a configuração do pacote é comparada: se o conteúdo for diferente, grava-se um arquivo temporário e a substituição é atômica; se for igual, pode-se reutilizar. Esta decisão substitui o plano anterior de manter cópias históricas por hash, e a configuração baixada continua separada do recurso que acompanha o pacote. A discussão pressupõe a atualização após a saída normal do programa antigo e dos subprocessos e não exige mais que programas novos e antigos em paralelo mantenham cada um sua base antiga; se um processo antigo ainda estiver rodando, uma releitura posterior do caminho fixo verá o conteúdo novo. A substituição é feita pela inicialização do programa e não exige tratamento adicional do instalador.

Limite de compatibilidade: os dados já publicados no staging precisam ser atualizados para o formato final; os formatos intermediários não produzidos durante o desenvolvimento deste branch não exigem compatibilidade nem migração. Não se confunde "preservar um arquivo de formato não suportado" com "suportar a leitura desse formato"; o tratamento de arquivos inválidos ou de versões futuras não foi estendido nesta seção a novas exigências de implementação.

Correção de um registro errado sobre Bot: este documento antes escreveu "continuar usando o arquivo original para migração" como se fosse uma decisão do usuário e, com base nisso, propôs mudar a condição de disparo da migração, o que é um erro de registro. O usuário apontou que a troca de arquivo já estava prevista e pediu a revogação do registro errado; não se trata de o usuário retirando um plano que havia aprovado. Mantêm-se no final os arquivos atuais bot-config.v3.json / bot-state.v3.json e seus version: 3, com importação dos arquivos antigos quando os novos não existem e sem implementar sobrescrita do caminho original ou uma reestruturação da condição de disparo correspondente. O diagrama mostra apenas os arquivos gravados hoje, e os antigos continuam preservados como entrada de importação; o version de Bot existente não entra nas cinco redefinições de schemaVersion da 6.11.

Evidências: [decisão anterior do arquivo pessoal separado](./todo-33-personal-provider-config-file-cutover.md), [caminho de download atual](../../../../packages/provider-node/src/zcode-builtin-cache-paths.ts), [registro de estado de distribuição](../../../../packages/services/src/model-provider/providerProvisioningTarget.ts), [arquivos de Bot e entrada de migração](../../../../packages/services/src/bots/repo.ts), [liberação do recurso embutido](../../../../packages/provider-node/src/zcode-builtin-provider-config-materializer.ts) e [liberação do recurso embutido no CLI](../../../../apps/zcode-cli/packages/cli/src/provider-runtime-env.ts). Esta rodada registra apenas o alvo; a movimentação e a renomeação de arquivos ainda não foram implementadas, e o Bot continua usando o esquema de arquivos v3 existente.

### 6.11 Escopo e uso do schemaVersion: confirmado

Camada de arquivo: depois de fundir o arquivo separado de Model Selection, os limites de versão novos desta rodada caem de seis para cinco, sendo quatro formatos de arquivo e um formato de transporte. Cada um é consolidado na versão 1; o número de versão serve para identificar o formato, escolher uma migração ou recusar entradas não suportadas, e não é incrementado por causa da modificação de um valor de configuração comum.

| Limite de versão                | Versão-alvo      | Escopo gerenciado                                                                 |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------------- |
| PersonalProviderConfigFile     | schemaVersion: 1 | o config inteiro do arquivo pessoal, incluindo defaultModelSelection              |
| ZCodeBuiltinRelease            | schemaVersion: 1 | formato de publicação embutida compartilhado pelo conteúdo que acompanha o pacote, pela cópia liberada e pelo conteúdo baixado; o 3 da implementação atual é consolidado em 1 |
| Registro de refresh embutido    | schemaVersion: 1 | registros de ocupação, horário e contagem de falhas                              |
| Arquivo de estado de distribuição de Provider | schemaVersion: 1 | formato de gravação de requisições concluídas e seus resultados |
| Envelope de distribuição de Provider | schemaVersion: 1 | a configuração completa, as settings e as credenciais enviadas ao ambiente alvo |

Camada de membros: ProviderConfig, ModelConfig e ModelSelection não têm versão própria e são gerenciados pelo arquivo ou envelope onde estão. O arquivo separado de Model Selection e seu invólucro de versão são cancelados; o campo version de Bot já existe no staging e não conta como um limite de versão novo.

O campo de versão em si não executa migrações. A configuração do usuário costuma preservar os dados por migração, os registros de refresh podem ser reconstruídos e o conteúdo baixado ou o envelope de transporte pode recusar formatos não suportados. O usuário aprovou o uso e os limites acima; isso não leva a adicionar migrações para formatos intermediários não publicados nem a considerar cada estratégia existente de tratamento de erro como já revisada.

Formatos intermediários de desenvolvimento também podem escrever schemaVersion: 1, e não se pode concluir que o formato final só pelo fato de o número ser igual; a decodificação continua seguindo o schema final. Não é preciso adicionar migração para esses arquivos intermediários. Já os arquivos de configuração antigos do staging e os arquivos originais de Bot são entradas de upgrade publicadas, e o fato de os novos arquivos de Provider começarem em 1 não permite pular a importação deles.

### 6.12 Revision de publicação embutida e review direcionado: decisões e correções a implementar

Camada de publicação: o usuário se preocupa principalmente com a revision de publicação da configuração embutida. Para o conteúdo que acompanha o pacote / online, comparado pelo mesmo cliente dentro da mesma origem de configuração, adota-se uma regra unificada de número de publicação, sem deixar o empacotamento e a publicação online numerarem de forma independente:

- Quando o conteúdo da configuração muda, a revision de publicação precisa aumentar.
- A mesma revision precisa corresponder ao mesmo conteúdo; um novo empacotamento sem mudança de conteúdo pode reutilizar o número original.
- Reverter para conteúdo antigo também é publicado de novo como uma revision maior, caso contrário o cliente ignoraria por ser uma publicação antiga.
- schemaVersion cuida do formato e é separado da revision de publicação; consolidar o schemaVersion em 1 nesta rodada não significa reiniciar o número de publicação.

A revision mantém a restrição atual de inteiro seguro não negativo (no máximo Number.MAX_SAFE_INTEGER); ao passar a ser um tipo derivado do schema, não pode ser flexibilizada para um number qualquer.

Camada de runtime: o identificador de conteúdo, o identificador combinado e a contagem de views gerados pelo código não exigem manutenção manual pelo usuário. O staging já tem o hash de conteúdo do Registry de Provider inteiro, e esta rodada acrescenta identificadores em camadas e uma nova implementação de contagem de views; não se pode contar todos os campos passados do mesmo identificador como sistemas de versão independentes.

Conclusão da review: a comparação entre números novos e antigos da configuração embutida, a verificação de conflito de conteúdo no mesmo número e o caminho principal de validar e salvar a configuração pessoal dentro do lock de arquivo não apresentaram problemas por enquanto. Há também um problema de comportamento já reproduzido com a combinação real de Source / ConfigService / RegistryService e duas questões de simplificação de campos/nomenclatura já verificadas. O que o usuário perguntou foi se os três rumos de correção têm algum problema evidente e, não havendo obstáculo de design evidente, pediu que fossem registrados; abaixo ficam registrados como um plano de correções a implementar, e não indicam que a implementação atual já esteja corrigida.

1. O identificador embutido de runtime inclui o escopo da origem. Hoje o snapshotFromRelease só produz zcode-builtin:<número de publicação>, e Endpoints diferentes têm caches independentes e podem ter o mesmo número de publicação. Quando os dois endereços têm o mesmo número de configuração e conteúdos diferentes, depois da troca a Source já leu o conteúdo novo, mas o Registry pula a publicação porque o identificador combinado não mudou. O identificador de runtime deve incluir a origem de Endpoint normalizada e atravessar o embutido, a configuração combinada e o identificador de base da Account; a revision numérica de publicação do arquivo e as regras de comparação permanecem. A passagem de origem do Source / Worker de arquivo direto precisa ser conferida junto, e não é possível complementar a refresh apenas em uma tela.

```text
地址 A：revision 20，model-a
               |
               | 切换到已有缓存的地址 B
               v
地址 B：revision 20，model-b
               |
当前复现：Source = model-b，Registry = model-a
修复目标：来源改变后运行时标识改变，Registry 发布 model-b
```

2. Remover o sourceRevision do envelope de distribuição de Provider. Hoje o campo é apenas calculado e transmitido, sem nenhum consumidor usá-lo para decidir; a deduplicação no destino usa o syncId. Remover em conjunto o membro correspondente do schema / do tipo derivado e a lógica de cálculo dedicada, mantendo a deduplicação pelo syncId que é de fato usada e o hash de conteúdo necessário para a verificação de consistência da leitura da configuração pessoal.

3. Renomear o registryRevision do resultado da distribuição de Provider para configRevision. O valor atual é na verdade snapshot.sourceRevisions.config, cuja semântica é o identificador combinado da origem da configuração e não a contagem inteira do Registry. Ajustar em conjunto o schema de resultado compartilhado, a gravação do resultado, o membro de resultado no arquivo de estado e os consumidores/casos relacionados; sem acrescentar uma segunda revision.

Base da verificação: 95 casos em 8 arquivos de teste existentes relacionados passaram; um teste temporário adicional confirmou o problema de o Registry não atualizar depois da troca de Endpoint com o mesmo número. O arquivo temporário de reprodução foi removido do workspace e o código de produto não foi modificado. Na implementação das correções, esse cenário deve virar um teste de regressão oficial, e a passagem de origem do Host / Worker reais precisa ser verificada. Nenhum dos três planos apresentou obstáculo de design evidente, mas ainda exigem verificação depois da implementação, e esta seção não deve ser lida como "a implementação atual não tem problema nenhum".

Evidências: [identificador de runtime da configuração embutida](../../../../packages/provider-node/src/zcode-builtin-provider-config-source.ts), [troca de Endpoint](../../../../packages/provider-node/src/endpoint-scoped-zcode-builtin-source.ts), [deduplicação por identificador de base do Registry](../../../../packages/provider/src/registry-service.ts), [geração do identificador de distribuição](../../../../packages/services/src/model-provider/providerProvisioningSource.ts), [gravação do resultado da distribuição](../../../../packages/services/src/model-provider/providerProvisioningTarget.ts) e [schema de distribuição compartilhado](../../../../packages/shared/src/provider-provisioning.ts).

### 6.13 Registro de refresh / distribuição: fechado com a menor mudança necessária

Contexto: o usuário inicialmente aceitou a quarta proposta de refresh / registro de distribuição e depois perguntou o tamanho da mudança e pediu "não seja tão agressivo". Depois de conferir o escopo real de leitura e escrita, a solução foi reduzida a dois ajustes claros e pequenos, mais a adaptação de distribuição necessária para a fusão do arquivo de seleção padrão; não se muda mais o formato só por nomenclatura ou por remover uma camada de invólucro. Esta seção é a solução final e substitui as propostas de endpointOrigin e de array results já levantadas.

#### 6.13.1 Arquivo de refresh

Mantém os campos e a forma originais; o diretório / nome do arquivo continuam sendo ajustados conforme 6.10. O endpointKey atual corresponde à origem normalizada do serviço de configuração e, embora o nome possa ser mais preciso, nesta rodada ele não passa a endpointOrigin.

```ts
interface RefreshControl {
  schemaVersion: 1;
  endpointKey: string;
  leaseId?: string;
  leaseUntil: number;
  nextEligibleAt: number;
  failureCount: number;
}
```

leaseId identifica uma ocupação de refresh, e leaseUntil e nextEligibleAt são timestamps em milissegundos; os mecanismos atuais de lock, ocupação e retentativa são mantidos, sem reescrever o fluxo de refresh por causa do refinamento do schema.

#### 6.13.2 Envelope de distribuição

Remove o sourceRevision sem consumidores (igual a 6.12); o personalConfig, com a fusão de arquivos já decidida, adota o conteúdo final de PersonalProviderConfig, incluindo defaultModelSelection e sem o configuredDefault externo. Não se guarda uma segunda cópia da seleção padrão só para transporte.

```ts
interface ProviderProvisioningEnvelope {
  schemaVersion: 1;
  syncId: string;
  personalConfig: PersonalProviderConfig;
  accountSettings: ProviderProvisioningAccountSettings;
  credentials: ProviderProvisioningCredentialEntry[];
}
```

As camadas concretas de personalConfig reutilizam 6.7; ao reutilizar um schema de dados no código, a dependência entre pacotes continua unidirecional, e a interface de exibição não pode exigir que shared dependa inversamente da implementação de comportamento de provider.

#### 6.13.3 Membros da distribuição

As settings de conta e os itens de credencial são mantidos; a seleção de conexão de conta não continua sendo renomeada nem reestruturada nesta rodada.

```ts
interface ProviderProvisioningAccountSettings {
  providerFamilyDomain: "zai" | "bigmodel" | null;
  providerFamilyConnectionSelections: ProviderFamilyConnectionSelectionSettings;
}
```

```ts
interface ProviderProvisioningCredentialEntry {
  scope: "oauth-session" | "account-provider";
  key: string;
  value: string;
}
```

Continuam em vigor a verificação atual de escopo de credenciais e as restrições de quantidade do array; a lista de tipos de credencial distribuíveis não é ampliada.

#### 6.13.4 Arquivo de estado da distribuição

Mantém o invólucro records e o syncId da camada de registro; não passa a results: ProviderProvisioningResult[]. Embora a estrutura atual tenha IDs repetidos, não foi encontrado nenhum problema de comportamento que obrigasse a mudar o formato por causa disso.

```ts
interface ProvisioningStateFile {
  schemaVersion: 1;
  records: ProvisioningStateRecord[];
}
```

```ts
interface ProvisioningStateRecord {
  syncId: string;
  result: ProviderProvisioningResult;
}
```

#### 6.13.5 Resultado da distribuição

Apenas o registryRevision passa a configRevision, expressando com precisão o valor existente; os campos de status, contagem e rollback são mantidos. O arquivo de estado atual grava os resultados bem-sucedidos e o resultado de falha pode ser devolvido ao chamador, e por isso não se acrescenta persistência de histórico de falhas.

```ts
interface ProviderProvisioningResult {
  syncId: string;
  status: "applied" | "already-applied" | "unsupported" | "failed" | "rollback_failed";
  personalProviderCount: number;
  credentialCount: number;
  configRevision?: string;
  errorMessage?: string;
  rolledBack: boolean;
}
```

A fusão da seleção padrão não é uma simples renomeação: a gravação, a validação e o rollback de falha precisam ser ajustados junto com a fusão do arquivo pessoal, para não continuar tratando dois arquivos separados; a deduplicação por syncId no destino e a verificação existente que impede que um rollback sobrescreva um valor novo são mantidas. A máquina de estados de distribuição não é reestruturada à parte.

Aqui personalConfig representa o snapshot inteiro da configuração pessoal da origem e não um patch parcial; quando a origem não tem defaultModelSelection, o destino também não preserva o padrão antigo após aplicar. O rollback correspondente usa o arquivo pessoal fundido como um único snapshot antes/depois da escrita, mantendo a proteção existente de "se foi modificado por outra operação no meio, não sobrescreve"; não se pode reverter regras e seleção padrão em dois rollbacks separados, o que faria uma sobrescrita do arquivo inteiro pela outra. Isso difere da semântica de preservar membros não modificados na edição comum de campos.

```text
源端个人配置（含 defaultModelSelection）
            |
            v
同一信封 -> 目标端按 syncId 查重
                       |
                       +-- 已成功：返回既有结果
                       |
                       `-- 未执行：应用配置 / 设置 / 凭据并校验
                                      |-- 成功：保存 records
                                      `-- 失败：按实际写入范围回滚
```

Evidências: [controle de refresh](../../../../packages/provider-node/src/zcode-builtin-remote-synchronizer.ts), [schema de distribuição compartilhado](../../../../packages/shared/src/provider-provisioning.ts), [envio](../../../../packages/services/src/model-provider/providerProvisioningSource.ts) e [recebimento / rollback / registro de estado](../../../../packages/services/src/model-provider/providerProvisioningTarget.ts).

### 6.14 Outras estruturas explicitamente aprovadas ou não ajustadas

#### 6.14.1 Estruturas existentes passando a usar ModelSelection: aprovação unificada

O usuário decidiu explicitamente: "tudo que acrescentar um model selection sobre o que já existe, pode passar". Por isso não se rediscutem um a um os pontos de consumo de sessão / mensagem, seleção recente, estado de Subagent, Wiki, Bot, Automation e Off-Peak. Todos reutilizam a seleção genérica da seção 2, e a semântica de "não selecionado / seguir o padrão" já existente em cada entrada pertence à camada superior e não expande o ModelSelection em si.

O usuário esclareceu em seguida que "passar é reconhecer": não se pode reetiquetar esses itens como pulados, não confirmados ou dependentes de nova aprovação. Depois deixou claro que campos antigos não podem ser removidos, e a supplementação de preservar os valores antigos nos dois pontos Off-Peak / Wiki está registrada em 6.18, sem que isso derrube a estrutura de ModelSelection já aprovada.

A lista de alterações de banco desta rodada fica corrigida abaixo; as três colunas estão no tasks-index.sqlite existente e nenhum banco ou tabela nova é adicionada:

| Tabela existente | Nova coluna          | Decisão desta rodada           |
| --------------- | -------------------- | ------------------------- |
| automations     | model_selection TEXT | 复用 ModelSelection，通过 |
| automation_runs | model_selection TEXT | 复用 ModelSelection，通过 |
| off_peak_tasks  | model_selection TEXT | 复用 ModelSelection，通过 |

最近选择的新 localStorage key（zcode-model-selection-recent-v1 加工作区身份）属于客户端存储，不是新 JSON 文件或数据表。Subagent Markdown 仍有原有 model / thoughtLevel 文本表达，不因本次通过而要求全改为 JSON。Bot 按 6.10 纠正后的裁决保留 v3 新文件；“通过选择结构”不要求额外调整 Bot 路径。

通过的是 schema 设计，不豁免 staging 数据迁移验证；例如 SQL NULL、JSON null 和明确选择的既有区别，实施时仍需保留其上层语义。

证据：[Automation 与运行记录](../../../../packages/services/src/session/automationRepo.ts)、[Off-Peak](../../../../packages/services/src/session/offPeakTaskRepo.ts)、[最近选择](../../../../packages/ui/src/lib/composerRecent.ts)、[Subagent Markdown](../../../../packages/shared/src/subagent-markdown-selection.ts)。

#### 6.14.2 账号连接选择：明确不调整

保留现有 setting.json 内 providerFamilyConnectionSelections：zai / bigmodel 分别保存连接选择；kind 为 start-plan、individual-coding-plan 或 team-coding-plan，团队项带 productId、organizationId、projectId。用户已将此前“先忽略”明确为“不调整”，不进行 kind / mode 命名统一，也不重组字段；不再列为待讨论的命名问题。

已有 schema 却重复手写类型的问题仍按第 1.1 节统一处理；这是实现的类型来源整理，不改变持久化格式。证据：[账号连接选择 schema 与重复类型](../../../../packages/shared/src/provider-family-connection-selection.ts)。

#### 6.14.3 账号凭据 key：保持现状

保留现有 credentials.json 内 account-provider:...:api-key 的 key 组成和编码方式：包含 Provider、账号身份及团队所需的产品 / 组织 / 项目 ID。用户明确不做这一项；不把 coding-plan / team 改成 individual-coding-plan / team-coding-plan，也不借此重做凭据存储。

证据：[凭据 key 生成](../../../../packages/services/src/model-provider/accountProviderCredentialKey.ts)。

来源专用 schema 的字段范围同样已明确“不调整”，沿用 6.8；原有 schema 推导类型原则及此前确认的公共字段改名保持，不因此新增来源限制。

### 6.15 本轮目标是否达到与实施边界

以“相比 staging 的 Provider / ModelSelection 改造”为范围，本轮已梳理核心 schema、规则及来源、物理文件与新增表列、schemaVersion、revision 和直接关联的分发记录。后续回滚讨论新增了 6.18 的旧字段保留约束；Session 已确定改为新增 modelSelection 字段。用户随后要求只复审本 Todo 要修改的内容，6.19 已据此收紧为 13 项并获认可；其他 Todo 的内容不重新打开。设计复审不代表实现或上线验证完成。

| 审阅项                                                | 当前结论                        |
| ----------------------------------------------------- | ------------------------------- |
| ModelSelection、ProviderConfig、ModelConfig           | 第 2、3、5 节已定               |
| 智能 / 手动、各层规则、Provider / Template 外层及名称 | 第 6.1–6.7 节已定               |
| 来源专用字段限制                                      | 第 6.8 节保留现状，定向审阅通过 |
| 默认选择、文件路径、Bot 文件、资源覆盖及新增表列      | 第 6.9–6.10、6.14 节已定        |
| 五处格式版本、发布 revision、运行时标识问题           | 第 6.11–6.12 节已定，修复未实施 |
| 刷新 / 分发记录                                       | 第 6.13 节按收缩方案处理        |
| 其他 ModelSelection 接入、账号选择及凭据 key          | 第 6.14 节通过或明确不调整      |
| schema 单一来源                                       | 第 1.1、7 节作为实施原则        |

尚未达到的是“实现完成，可以正式上线”：当前仍是旧实现，字段 / 文件改造、已复现的 revision 问题都未落实。正式上线前需要用实际结果证明：新安装写最终格式，staging 已发布数据直接迁入同一最终格式；不支持本分支未发布中间格式。这是已有裁决的实施验证，不是继续设计另一套 schema。

```text
全新安装 --------------------> 最终格式
staging 已发布数据 --升级----> 同一最终格式
本分支未发布中间格式 --------> 不要求兼容
```

实施验收集中在三件具体工作：按本文落地 schema / 读写 / 消费者；验证 staging 升级和重复启动不会丢失或复活旧配置；验证默认选择合并后的分发 / 回滚及同序号跨 Endpoint 切换修复。遇到实际冲突再报告，不预设新的字段和迁移版本。

本结论是设计审阅收口，不承诺永远无需后续迁移，也不是对整个分支无关功能的持久化做了全仓审计。非法手改文件、未来版本兼容等未新增裁决的行为保持本轮范围，不因本文自动获得扩大改造的授权。

### 6.16 实施定位与文档复核补充

以下只把已有裁决对应到实际入口，避免只改 schema 定义却漏掉写回、迁移或独立 CLI；不增加新的改造目标。本次核对的 staging 引用为 790884b1ce，后续实施若基线变化，应复核相关差异，不把快照当作永远不变的事实。

| 已有裁决                       | 必须一起核对的入口                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 字段改名、规则分组及去掉 type  | provider/config/schema.ts 的解析、provider-config.ts / model-config.ts 的构造及 toJSON、toPersonalJSON、toZCodeBuiltinJSON；不能只改展示类型，写回仍出现旧字段                                                      |
| 个人 config 包装和默认选择合并 | provider-node 的 provider-config-file-codec.ts、personal-provider-config-repository.ts、model-selection-config-repository.ts，以及宿主装配和默认选择订阅；不得保留第二个持续写入的 model-selection.json             |
| staging 个人配置导入           | App 的 legacyPersonalProviderConfigImporter.ts 与独立 CLI 的 legacy-cli-personal-provider-config-importer.ts 都输出最终格式；保留现有用户意图提取和旧身份转换，不把旧 Effective Config 的系统默认能力冻结成用户覆盖 |
| Bot 保留 v3 新文件             | bots/repo.ts 与 storageMigration.ts 沿用当前新文件导入链路；验证旧配置 / 草稿选择进入 v3 文件，旧文件不被覆盖，不实施此前误记的原路径迁移                                                                           |
| 内置发布和运行时来源标识       | config/provider/zcode-builtin.json、release codec、下载 Source、固定资源释放路径及 CLI / Server 内嵌资源链路一起核对，随包与下载使用同一最终发布 schema                                                             |
| 分发适配                       | shared/provider-provisioning.ts 与 Source / Target / 状态结果编解码一起变更；发送、接收和失败回滚读取同一份 personalConfig                                                                                          |

已有迁移入口证据：[App 个人配置导入](../../../../packages/services/src/model-provider/legacyPersonalProviderConfigImporter.ts)、[独立 CLI 个人配置导入](../../../../apps/zcode-cli/packages/bootstrap/src/app/legacy-cli-personal-provider-config-importer.ts)、[Bot 存储迁移](../../../../packages/services/src/bots/storageMigration.ts)。其他代码入口见相应裁决章节，不再复制一套实现设计。

文档复核补全的是：公共 Match 示例与正式 schema 的区别、完整 / 手动配置关系、enabled 与 null 覆盖语义、规则顺序及身份唯一性、默认选择合并后的完整读写与回滚、最终版本 1 和旧数据导入的区别。以上均用于把已有裁决和必须保留的现有行为写明确；若实施发现需要改变这些行为，另报具体原因，不能将“文档完善”当作扩大产品改造的授权。

### 6.17 按可验证性全面复评：保留方案，区分验证难度与工作量

用户明确以“容易验证的都不算高风险”为本轮判断口径。此前将默认选择合并、外层重组等因影响面广而直接列为高风险，混入了工作量判断；本节取代该分级，不把复杂度等同于难以验证。恢复 6.9 的默认选择合并；Bot 按 6.10 纠正误记后保留现有 v3 新文件。没有新增字段裁决，也未授权开始产品实现。

复评结论：目前各项都有可构造的输入与可判定的结果，没有发现因验证困难而必须撤回的变更。默认选择合并、revision 传递和资源覆盖需要更完整的集成 / 打包验证，但验证方法明确。“能够验证”不表示“当前测试已经证明最终方案正确”；下表是实施时针对实际风险的验证依据。

| 改动组                                              | 明确的判定结果                                                                                         | 验证方式与目前边界                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ModelSelection 及已有结构接入                       | 同一 providerId / modelId / reasoningLevel 读写后保持；各上层空值语义保持                              | 复用已有消费者和迁移测试，按用户裁决通过结构，不逐个重新设计；新增三列仍核对升级读写                                                              |
| Provider / Model 字段改名、属性归位、选项 type 删除 | 最终文件只含目标字段，读写往返不丢值；最终有效配置语义保持                                             | schema 正反例、序列化断言、转换前后有效值对照，易于确定结果；不拿“同一个错误 codec 自己往返成功”代替独立预期值                                    |
| Provider / Template 外层重组及名称                  | ID、模板关系、覆盖值和顺序保持；创建名称按语言取值并去重，重启后不变                                   | 现有创建 / 并发去重 / Overlay 测试可适配；补目标数组与字段外移的明确断言及设置操作 E2E。工作量较大，但结果直接可比                                |
| 智能 / 手动分组、来源专用 schema                    | 非法来源字段和不完整手动规则被拒绝且不留下半次修改；enabled 独立保留，手动参数不随前层更新             | 现有固定配置 / 来源限制 / 原子编辑测试有对应场景，补集合互斥和新 schema 用例，易于验证                                                            |
| Match 分层、删除 providerMatch、四条规则移 Site     | 各层拒绝越界字段；指定 Endpoint / API / 模型命中，邻近但不符合的输入不命中；规则顺序保持               | 用显式预期的命中 / 不命中矩阵验证，包含普通 API Key 同 Endpoint、Start Plan 与 Off-Peak 边界。验证本地声明的范围，不宣称由此证明远端模型真实能力  |
| 默认选择合并及分发适配                              | 修改任一成员不丢其他成员；清除后重启不恢复旧选择；并发修改均保留；分发失败恢复原值且不覆盖期间新修改   | 文件更新、导入、故障注入可以稳定构造；另补真实两个进程的写入 / 通知及实际分发集成。可验证，需较多集成工作                                         |
| staging 导入与 Bot 文件                             | 新安装和旧数据导入均生成最终格式，重复启动不重复导入；Bot 仍写 v3 文件，旧文件保持原样                 | App / CLI 已有 importer 及 Bot 测试可复用，以旧文件 fixture 和独立预期结果核对；不安排误记的 Bot 原路径改造                                       |
| schemaVersion 与内置发布 revision                   | 五个格式边界接受最终版本 1，拒绝不符合结构的输入；发布比较接受更高序号、拒绝同序号异内容               | codec / release 测试能验证比较机制；实际打包 / 在线发布还须在同一发布范围核对真实 revision 与内容，单测不能代替发布序号管理                       |
| 内置运行时 revision 来源修复                        | 两个 Endpoint 同序号不同内容时，切换后 Source、Account、Registry、Worker 最终一致且实际使用新配置      | 已有真实 Source / Config / Registry 的临时复现；补成正式回归并覆盖真实 Host / Worker。可观测、可重现，不能只用内存 mock 证明整条链路              |
| runtime/provider 路径及固定资源覆盖                 | 各宿主读写正确隔离目录；固定资源变更时替换、未变时复用，不新增按 hash 增长的副本，读取不到半份文件     | 临时目录文件测试、并发读写 / 失败场景，加 Desktop / CLI / Server 实际构建产物启动检查；原子替换在所支持系统上验证。沿用退出旧程序再升级的已定前提 |
| schema 单一来源与分发两处小调整                     | 类型从 schema 得到，解析前后 / class 序列化边界不混淆；sourceRevision 无残留消费者，结果值仍为配置标识 | 类型检查、负向类型用例按需要补充、codec 行为测试、依赖检查和发送 / 接收协议用例。不能只用类型通过证明运行时校验未被放宽；没有重写行为类的要求     |

本次只读核对发现的验证边界：provider-node-runtime.test.ts 中名为“多个进程并发首次读取”的用例实际是在同一进程创建两个 Repository，能验证多实例调用，不能独立证明跨进程锁与通知。providerProvisioningTarget.test.ts 已有失败回滚、并发凭据保护和空快照同步场景，但主要使用 mock；可以作为适配基础，不等于合并后的真实文件回滚已验证。资源物化测试目前验证按 hash 保留旧版本，实施固定路径方案时必须替换这一旧预期。

针对最需要集成验证的两条链路，使用可控执行屏障、故障注入和实际持久化结果判定，不靠多跑几次或任意 sleep 碰概率：

```text
进程 A 修改 Provider ----+
进程 B 修改默认选择 -----+-> 同一文件更新 -> 两项均保留 -> 另一进程读到新值
                                  |
                           分发应用后注入失败
                                  `-> 检查原值恢复 / 期间新值不被覆盖

Endpoint A(rev 20) -> 切换到 B(rev 20，内容不同)
                                  `-> Source -> Account / Registry -> Worker 使用 B
```

保留全部已确认的目标改动；按数据结构、文件合并、来源标识与路径装配分别形成可验证的实施步骤。因共享依赖必须联动的代码在同一步改全，不为拆提交引入临时双写、中间迁移或新兼容格式。实施结束用验证结果确认，而非仅凭本次可验证性评估宣称上线完成。

证据：[配置与固定模式测试](../../../../packages/provider/test/config-service.test.ts)、[规则测试](../../../../packages/provider/test/model-config-rules.test.ts)、[Node 存储 / 物化测试](../../../../packages/provider-node/test/provider-node-runtime.test.ts)、[分发目标测试](../../../../packages/services/test/providerProvisioningTarget.test.ts)。本次未运行针对未来目标的产品测试，也未改产品代码。

### 6.18 实用回滚：旧字段保留与三处待修裁决

用户倾向新增字段 / 新增文件，方便实用回滚，并进一步明确“字段就是不能删除”。旧值保留供旧版使用，新版只更新自身字段，不要求把新版值持续反向同步成旧格式。该约束针对本 Todo 修改的 staging 已发布存储；本分支未发布的新 Provider 格式仍按前文裁决改名、分组和合并，不能把这两类“旧字段”混为一谈。Subagent Markdown 已在 Todo 97 明确采用原字段身份迁移，用户要求尊重其可读性取舍，本 Todo 不推翻该方案，见 6.19.2。

#### 6.18.1 Off-Peak：待修，旧模型列不再清空

现有表已新增 model_selection，但 updateEditableFields 保存时还会将 model / thought_level 置为 NULL。用户要求修复为：只更新新选择和本次业务编辑字段，旧模型列保留现存值，不清空，也不按新选择反向改写。新建记录没有旧值时，无须捏造旧版选择。

实现范围：从当前 UPDATE 中去掉 model = NULL / thought_level = NULL 两个赋值；沿用已有字段更新、校验和保存入口，不新增保存机制。

验收直接检查 SQLite 原始列：只改标题或修改新选择后，两个旧模型列仍与修改前相同，新版实际读取的 modelSelection 正确。此项目前未实施。

#### 6.18.2 Wiki / Draft：待修，保存时保留旧字段

当前读取会将 generationModel / generationOptions.thoughtLevel 转成新版 modelSelection，但输出给运行层的对象不再包含旧模型字段；直接把运行对象写回会删除磁盘旧值。用户要求修复为正常保存后旧字段仍保留，内容只作回滚快照，不参与新版选择解析。

改动应集中在 RepoWikiStorage 对 Wiki / Draft 的保存适配：保存时保留磁盘中上述几个旧值，复用现有文件锁及 atomicWriteText 原子写入能力。读取后旧字段已不在运行对象里，所以不能声称只删两行即可完成；但不需要重做保存服务、引入缓存或后台同步，也不改写通用 IO 工具。新增文件无旧值时不伪造旧参数。若实现必须超出这一局部范围，应说明具体原因，不能把保留字段扩成保存架构重构。

同样核实到 staging 的 generationOptions.maxOutputTokens 是已发布字段：旧字段保留原则也适用于这一存量值。新版依然使用模型 Limit，不恢复手动输出预算，也不为新文件生成旧预算；这是对 Todo 94“正常保存移除旧预算”的存储行为补充，不推翻它的执行和 UI 裁决。

验收覆盖 Wiki 和 Draft：保存新的选择后，旧模型 / reasoning / 预算原值仍在，正文及当前 generateDiagrams 正常保存；旧参数不进入当前请求。保留旧值以后还需验证显式清除或无效的新选择在重启后不会被旧字段复活。具体保存标记和读写实现不在本轮擅自定型，不能把前次已撤回实现里的 modelSelection: null 当成新的用户 schema 裁决。

```text
磁盘旧字段 -- 保留原值 ----------------> 回滚后的旧版读取
新版选择   -- 更新新字段 / 新文件 -----> 当前版本读取
               |
               `-- 清除后仍以新版状态为准，不重新导入旧值
```

#### 6.18.3 Session：新增 modelSelection 字段，保留旧字段

2026-09-10 实施更新：B1c 已落实磁盘包装与旧快照保留，局部集成回归通过，完整交付验证仍跟随 B5。下文“当前迁移后”为改造前的调查示例。逻辑 SessionStorePort 沿用 ModelSelection payload，adapter 统一包装/解包；不要求 core/bootstrap 感知回滚字段。证据及边界见 [实施账本](../research/todo104-schema-implementation-ledger.md)。

数据库 session_entry 中已有 type 为 runtime/model_selection 的“当前模型选择”记录。当前迁移若命中这条旧记录，会沿用其 id，改写它的 data JSON；从旧消息推导选择时则新增一条 entry。旧 message 行保持原字节。以能确定的旧 Z.ai Coding Plan 身份为例：

```text
同一条 session_entry.data（迁移前）
  providerId: "builtin:zai-coding-plan"
  modelId: "GLM-5.2"
  thoughtLevel: "high"
                 |
                 v
同一条 session_entry.data（当前迁移后）
  providerId: "account:zai-individual-coding-plan"
  modelId: "GLM-5.2"
  options: { reasoningLevel: "high" }
```

这里有两处原位损失：thoughtLevel 被替换；providerId 虽然字段名相同，但值也改变了。仅保留 thoughtLevel 不等于保留旧版原来的模型身份。再次对照 origin/staging@790884b1ce，旧版确实已有相同 type 和稳定 id 的选择记录，不是本分支新建的记录类别。

用户已确认这是遗漏，并明确要求改为新字段迁移。最终方案：保留同一条 entry 的 id / type，在 data 中新增 modelSelection；旧 providerId / modelId / thoughtLevel 保留原值，后续新版选择写入只更新新成员，不持续反向同步旧字段。不新增表、不另建 entry 类型；该裁决取代此前待讨论状态及“另存新版记录”的未定建议。

记录外层：沿用已有 session_entry 元数据与 runtime/model_selection 类别，不调整结构。

data 层：旧字段仅承载已有回滚快照，新成员承载当前选择。旧字段可选，因为新建记录无须伪造旧值；这里只展示相关成员，不授权删除 data 中其他已有字段。

```ts
interface SessionModelSelectionEntryData {
  providerId?: string;
  modelId?: string;
  thoughtLevel?: string;
  modelSelection?: ModelSelection;
}
```

modelSelection 层：复用第 2 节通用结构，不另建一套 Provider / Model 身份定义。

```text
首次升级：旧 providerId / modelId / thoughtLevel
             |-- 原值保留 ----------------> 旧版读取
             `-- 转换后写入 modelSelection -> 新版读取
后续修改：只更新 modelSelection，保留旧字段原值
```

已有旧 entry 时补新成员；没有 entry、仅有旧消息时仍可创建选择 entry，但将新选择放进 modelSelection，旧消息不改。新版读取、保存、恢复及 fork 等复制选择入口必须适配包装，不能只修改迁移函数。已经存在新版状态时不得重新从旧字段或历史消息补值；清除 / 无效选择后重启不复活旧值，具体空值标记继续沿用上层约束，不借本接口展示额外裁决 null 格式。

验收读取数据库原始 JSON：迁移前后旧字段逐值相同，新成员身份和档位转换正确；修改新版选择仍保留旧快照；重复迁移幂等；旧消息不变。另用目标旧版 reader 检查仍可读取原身份与档位。本项尚未修改代码或运行目标方案测试。

旧版行为核查仅为当前静态证据：上述 staging 的桌面 / Web 恢复链路能读陌生 ID，但将对应模型判为不可用；有可用模型时有回退路径，无可用模型时历史可打开、发送受阻。旧版不读取 options.reasoningLevel。因此本裁决解决的是原选择快照丢失，不应声称旧版必然打不开整个会话；也未宣称已完成旧 App 实机回滚。

证据：[Off-Peak 编辑](../../../../packages/services/src/session/offPeakTaskRepo.ts)、[Wiki 存储](../../../../packages/services/src/repo-wiki/repoWikiStorage.ts)、[Session 选择迁移](../../../../apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/model-selection-migration.ts)、[旧身份转换](../../../../packages/shared/src/legacy-model-provider-identity.ts)、[实用回滚原边界](./todo-69-provider-refactor-practical-rollback-compatibility.md)。

#### 6.18.4 仍需留意的具体边界

- Session 新字段迁移已经裁决，待实施；ModelSelection 通用结构和其他 pass 保持。6.19 只列本 Todo 要改的项目，用户已认可收紧后的范围。
- 保留旧值后的“新版清除选择不能复活旧值”属于三项待修的验证要求，不需要为此先扩大通用 ModelSelection。
- Todo 69 的回滚证据针对其文档中冻结的 staging Reader，且未宣称完整旧 App 实机回滚；实施验收应明确实际回滚目标，不把新版读写测试通过当作旧版可读的证据。

本轮仅落盘上述裁决及待讨论点。此前误开始的两处实现和测试已全部撤回，没有保留产品修改；未来须待用户明确开始实施后再落实，并重新按测试先行验证。

### 6.19 本 Todo 核心 schema 之外的修改清单：范围已收紧、已认可

用户明确“我只裁决我们这个 todo 要改的，其他的不看了”“确保别改坏了就行，漏了没事”。本节取代此前混入当前分支已有行为的 A/B/C 清单；仅保留 Todo 99 将要实施的改动，省略已在前文定案的 Provider / Model Config 和规则内部字段。用户已认可其他项，并在了解 Off-Peak / Wiki 的局部保存方案及 Todo 97 背景后再次确认；仍无产品实施授权。

#### 6.19.1 本 Todo 要修改的 13 项配套内容

| 编号 | 项目               | 已确认修改与边界                                                                                                                                                             |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Session 选择迁移   | 原 entry.data 新增 modelSelection，保留旧 providerId / modelId / thoughtLevel 原值；读取、保存、恢复及 fork 等复制入口一起适配。不新增表或 entry 类型，见 6.18.3。           |
| 2    | Off-Peak 保存      | 当前 UPDATE 不再将旧 model / thought_level 置 NULL；沿用既有保存链路，见 6.18.1。                                                                                            |
| 3    | Wiki / Draft 保存  | 存储层保存时保留旧模型、档位及 maxOutputTokens 原值，复用已有锁与原子写；不恢复旧预算功能，不重构保存机制，见 6.18.2。                                                       |
| 4    | 默认选择文件合并   | model-selection.json 合并到 provider_config.json 的 config.defaultModelSelection；调整读写、持锁更新、冲突检查和通知。清除选择不删除整个文件，不授权顺带删除旧文件，见 6.9。 |
| 5    | 下载配置路径       | active.json 改为 runtime/provider/<平台>/<应用版本>/<服务端地址标识>/zcode-builtin.json，保留三个隔离维度。                                                                  |
| 6    | 刷新记录路径       | refresh-control.json 改为上述同目录的 zcode-builtin-refresh.json；内部字段、占用和重试机制保持。                                                                             |
| 7    | 分发记录路径       | provider-provisioning-state.json 改为 runtime/provider/provisioning.json；保留 records / syncId 及去重语义。                                                                 |
| 8    | 内嵌资源副本       | 固定 runtime/provider/bundled/zcode-builtin.json，启动时内容不同则原子覆盖，不再按 hash 产生多份资源副本。以上路径见 6.10。                                                  |
| 9    | 格式版本收口       | 最终五处 schemaVersion 统一为 1；默认选择独立版本外壳随合并取消，Bot 仍保留 version: 3，见 6.11。                                                                            |
| 10   | 来源切换刷新修复   | 运行时内置标识纳入 Endpoint 来源，并贯穿现有消费者；修复不同地址同 revision、不同内容时不刷新，不新增持久化 revision 字段，见 6.12。                                         |
| 11   | 分发信封与回滚适配 | 删除无调用的 sourceRevision；默认选择随 personalConfig 传递，移除外层 configuredDefault；整份个人文件统一应用、校验和失败回滚，保留并发修改保护，见 6.13。                   |
| 12   | 分发结果改名       | registryRevision 改为 configRevision，实际值和其他结果字段不变，不精简 records 包裹，见 6.13。                                                                               |
| 13   | 重复类型清理       | 本 Todo 范围从 schema 推导数据类型；核心之外包括账号连接选择重复类型，不改变其持久化字段，见 1.1 / 7。                                                                       |

已在核心 schema 定案中要求的解析、序列化、App / 独立 CLI staging 导入及消费者适配仍按 6.16 完整执行；上述清单不是把它们取消。内置发布 revision 的统一单调规则仍按 6.12 保持，但不把发布约定另列成一个新存储改造。

本 Todo 不要求重做消息 / Part 格式、用量表、全局 reasoning 偏好、最近选择、Automation、Bot、账号连接或凭据机制；6.14 中已 pass / 明确不调整的结论保持。核心接口变更所必需的调用适配仍要完成，不能据此顺带重构这些业务或修改其存储格式。

#### 6.19.2 Subagent Markdown：纠正误判，尊重 Todo 97 的取舍

此前将 A10 原位 Provider 身份转换写成“新发现、待本轮裁决”是错误记录，现撤销。原始依据是 [Todo 97 §1–3](./todo-97-subagent-markdown-in-place-migration-and-legacy-read-audit.md)：Markdown 供用户阅读、手动编辑，正式格式明确保留 model / thoughtLevel；仅用户数据目录中的旧 Provider 身份在原字段内迁移，项目 / 插件文件不自动写回。迁移保留模型 ID、档位、正文、注释和其他无关内容。原字段在这里属于正式格式，不能机械套用其他 JSON 存储的“旧字段”定义。

这是已裁决的可读性取舍，不只是因另有 Todo 而暂时搁置。本 Todo 不把 Markdown 改成嵌套 modelSelection，不新增字段、影子文件或旧身份兼容旁路，也不重新要求用户批准 Todo 97。既有执行与测试证据由 Todo 97 维护，不将它们转成 Todo 99 新任务。

#### 6.19.3 验证要求的具体含义

下列是已确认行为的验收例子，不是新增四套机制；优先复用现有读写和并发保护，不因检查要求重做架构。

```text
旧值保留：
旧字段存 A -> 新版选择 B -> 旧字段仍是 A，新字段是 B

清除不复活：
新版清除 B -> 重启 -> 仍为未选择，不重新从旧字段导入 A

合并不误覆盖：
修改默认模型 -> 同文件中 API Key、Provider 配置仍保留

失败回滚不误覆盖：
分发写入 B -> 用户又保存 C -> 分发失败
                               `-> 不把用户的 C 覆盖成分发前的 A
```

清除示例只适用于原有业务允许清除的入口；Off-Peak 当前不允许保存空选择，不为该通用例子增加清除功能。这里只要求既有空值语义和保存正确性，不擅自新增 null 格式或全局兼容框架。遗漏的其他问题可以另记，不能作为本 Todo 无限扩项的理由。

## 7. Schema / 手写类型定向核查

范围为本轮讨论的核心结构及直接关联的完整配置 / 协议类型，不宣称已完成全仓持久化结构审计。

| 结构                                               | 核查事实                                                                                                                                | 后续整理方向                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ModelSelection                                     | shared/model-selection.ts 已用 z.infer；provider/registry.ts 重导出并从 options 派生，不重复手写                                        | 保持                                                                                                        |
| ProviderConfig、API、Access、Logo、Template        | config/schema.ts 有运行时定义，provider-config.ts 仍手写 Input / Object / 接口等对应字段                                                | 从基础数据 schema 推导，区分带方法的 class 输入与序列化对象                                                 |
| ModelConfig、Properties、输入输出格式、OptionSpecs | config/schema.ts 有运行时定义，model-config.ts 另手写 Input / Object 等字段                                                             | 共享 schema，推导数据类型；不把 class 删除视作前提                                                          |
| ModelConfigRule 三种成员                           | schema 工厂定义规则结构，model-config.ts 又手写规则接口                                                                                 | 从各具体规则 schema 推导；工厂参数当前使用 ZodTypeAny，实施时需保留 config 的具体类型，不能让推导退化为 any |
| Registry 完整配置                                  | resolver.ts 另手写 RegistryModelConfig / RegistryModelConfigObject 等完整成员；目前完整性依靠 validateComplete，而非已有独立完整 schema | 与完整 / 稀疏 / 固定配置共享字段定义，不错误声称这里已存在完整 schema 只是没 infer                          |
| 协议 ZCodeProviderAccountAccess                    | shared/zcode-protocol/index.ts 已从 schema infer；Resolver 中仍有手写的同形 Registry 账号访问结构                                       | 保留已推导协议类型；共享数据形状时遵守包依赖方向                                                            |
| 账号连接选择及设置                                 | shared/provider-family-connection-selection.ts 已定义两个 schema，但又手写联合类型及设置映射类型                                        | 改为从 schema 推导；不改变 kind、团队 ID 或持久化形状，用户已跳过结构调整                                   |

证据：[ModelSelection](../../../../packages/shared/src/model-selection.ts)、[Registry Selection 重用](../../../../packages/provider/src/registry.ts)、[配置 schema](../../../../packages/provider/src/config/schema.ts)、[Provider 类型](../../../../packages/provider/src/config/provider-config.ts)、[Model / Rule 类型](../../../../packages/provider/src/config/model-config.ts)、[Registry 完整类型](../../../../packages/provider/src/resolver.ts)、[协议类型](../../../../packages/shared/src/zcode-protocol/index.ts)。

## 8. 后续 Todo 与当前边界

- [x] 记录审阅背景、允许重组未发布 schema 的原则，以及先讨论再实施的约定。
- [x] 记录已确认的 ModelSelection 形状及上层默认状态、max output 的边界。
- [x] 记录 ProviderConfig 两处改名、保留 API 嵌套的 OAuth 背景，以及 entitled 等保留项。
- [x] 记录 ModelConfig 的分层裁决：输入输出字段命名、MFJS 字段归位和两个选项 type 删除。
- [x] 记录两处 Match 字段改名、条件 config / 分层 Match / Provider 外壳的讨论状态，以及 schema 推导类型原则和定向核查。
- [x] 记录智能 / 手动配置演进与 ManualModelConfig 命名、Provider 规则集合和身份外移裁决；useSmartConfig 中间方案已被集合分组取代。
- [x] 确认不新增 ProviderModelRuleIdentity，直接复用现有规则 schema 派生智能 / 手动分支。
- [x] 记录 builtinProviderModelRules 命名、三层 Match 的严格边界、modelMatch 必填，以及 providerMatch 字段 / 匹配逻辑删除。
- [x] 记录四条旧 Provider 条件规则全部迁入 Site 层，取代账号媒体放实例层的旧建议；保留已确认的站点通用规则。
- [x] 记录 templateNameMap、外层 providerName、ProviderConfigRule 类型名纠正，以及模板默认名称在创建时去重并保存的裁决。
- [x] 记录普通 / 手动模型规则分为两个数组，同一模型身份在个人集合内互斥，不新增 Identity、不持久化 useSmartConfig。
- [x] 删除目标结构中由集合确定的重复规则 type，保留 API / Access / Logo 的有效 type。
- [x] 记录个人文件增加 config 内容层，以及完整的内置 / 个人文件分层结构。
- [x] 记录 model-selection.json 合并进个人文件，使用 config.defaultModelSelection，复用通用 ModelSelection；独立文件方案被本裁决取代。
- [x] 记录新增文件取舍、runtime/provider 目录与下载 / 刷新文件命名，取代 cache + state 方案；Bot 保留 v3 新文件，原路径迁移属于已撤销误记；内置资源改为固定文件原子覆盖，不保留 hash 历史副本。
- [x] 记录新增内置发布格式 schemaVersion 定为 1，以及不要求兼容未发布中间格式的边界。
- [x] 记录来源专用 schema 由基础 schema 派生的要求；现有边界经定向核查通过，不追加结构调整。
- [x] 记录五处 schemaVersion 边界、统一内置发布序号规则，以及 revision review 的事实和三个待实施方案。
- [x] 记录刷新 / 分发记录的收缩裁决：保留 endpointKey 和 records 包裹，只做两个明确字段调整及默认选择合并所需适配。
- [x] 记录其他既有结构接入 ModelSelection 统一通过；补齐三个现有表的新增列，区分无新表与无新列。
- [x] 记录账号连接选择、凭据 key 及来源字段限制明确不调整；账号选择重复手写类型仍按唯一来源原则整理。
- [x] 核对核心结构审阅覆盖并记录实施 / 上线验证边界；Session 回滚遗漏按 6.18 新字段迁移裁决处理。
- [x] 文档复核补清 Match / 手动配置边界、覆盖和顺序、身份迁移、合并文件读写 / 回滚及 Bot 既有导入入口，见 1.2、6.2–6.4、6.9–6.13、6.16。
- [x] 恢复默认选择文件合并，纠正 Bot 原路径迁移误记，并按可验证性重新评估全部变更，见 6.17。
- [x] 记录 pass 就是认可、已发布旧字段不删除、Off-Peak / Wiki 两处待修，以及只讨论 / 落盘文档的授权边界，见 6.18。
- [x] 确定 Session 在已有 entry.data 新增 modelSelection，保留旧字段原值，不新增表或 entry 类型；见 6.18.3。
- [x] Session 新字段迁移及读取 / 保存 / 复制入口适配，验证旧字段保留、迁移幂等及清除不复活；B1c 与 B5 证据见账本。
- [x] 6.19 收紧为本 Todo 要改的 13 项配套内容并获认可；撤销 Subagent A10 误判，链接 Todo 97 的已裁决取舍，不再列为待讨论或待实施项。
- [x] Off-Peak / Wiki 旧字段保留，验证旧值保留且不会复活新版已清除的选择。
- [x] 6.12 来源标识修复、sourceRevision 删除、registryRevision 改名；真实文件 Source/Registry 及实际构建 Worker 的来源交付与精确模型请求通过。
- [x] 按第 1.1 节原则整理第 7 节重复数据类型，复用 schema 并保持依赖单向；含账号连接类型，运行时字段不变。
- [x] 落实第 3、5、6 节字段、模式与结构，配套 schema、序列化、消费者及批次验证；保留 api 层，不实施被撤回或跳过的建议。
- [ ] 完成 6.15 的实施验收：全新安装与 staging 升级收敛到最终格式，验证重复启动、分发回滚及来源切换；不为未发布中间格式补迁移。

后续实施沿用仓库 spec / 测试约定；真正落地并验证后，再同步 Design V2 的现行描述和本 Todo 状态。本次只记录裁决，不直接创建迁移版本、OAuth 字段、全局命名规范或新的架构改造；defaultModelSelection 已按 6.9 确认，但仍须在用户授权实施后落到产品代码。

本次交付仅为文档与入口索引；本轮限定范围的设计审阅已收口，字段改名、运行逻辑调整和上线验证尚未完成。

首次落盘验证：基线新鲜度、当时的 13 个本地引用、本文格式、`git diff --check`、根 `pnpm typecheck` 和 `pnpm lint` 均通过（lint 有 39 条存量警告、0 错误）。文档记录不涉及产品代码修改，未新增或运行产品行为测试。

2026-09-09 全面收口落盘：仅更新本文和两个入口索引；基线新鲜度、三个文档格式、150 个本地引用、git diff --check、pnpm typecheck、pnpm lint 均通过（39 条存量警告、0 错误）。此前来源限制定向核查的 66 个现有测试通过；本次没有新增产品代码或重复执行产品测试。

2026-09-09 文档全面复核：补清已有裁决对应的解析 / 序列化、合并读写、迁移及回滚边界；仅修改本文，无产品实现变更。基线新鲜度、本文格式、60 个本地引用、git diff --check、pnpm typecheck、pnpm lint 均通过（39 条存量警告、0 错误），未新增或重复运行产品测试。

2026-09-09 可验证性复评：恢复默认选择合并，纠正 Bot 文件误记，更新本文及两个索引。基线新鲜度、三个文档格式、157 个本地引用、git diff --check、pnpm typecheck、pnpm lint 均通过（39 条存量警告、0 错误）。仅核对了现有测试的覆盖方式，未执行未来目标的产品验证，未改产品代码。
