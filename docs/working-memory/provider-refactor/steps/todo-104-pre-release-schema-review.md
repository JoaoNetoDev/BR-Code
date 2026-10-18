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
Built-in / conta / configuracao pessoal
          |
          v
Effective Provider Config (pode conter fatos dinamicos)
          |
          v
julgamento local de disponibilidade do ZCode e montagem da requisicao
          |
          v
o servico de conta fornece material de acesso em tempo de requisicao -> autorizacao final no servidor do modelo
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
    -> regras pessoais comuns ou regras pessoais manuais
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
    +-- templateRules -> indice de templates
    +-- providerRules -> busca o template por templateId -> combina a configuracao da instancia
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
criar Provider (idioma atual)
    -> nome do template no idioma atual / en-US / templateId
    -> verifica duplicidade e escolhe um nome disponivel dentro da mesma atualizacao de configuracao
    -> salva providerName
    -> exibicoes posteriores leem o nome salvo
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
arquivo built-in
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

arquivo pessoal
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
Provider / Model / alteracao de ordenacao --+
configuracao de selecao padrao / limpeza ---------+-> mesma entrada de atualizacao do arquivo pessoal
    -> le o conteudo mais recente com trava
    -> altera o membro alvo, preservando os demais membros
    -> escrita atomica e notificacao aos consumidores correspondentes
```

Um arquivo pessoal final sem defaultModelSelection significa que nenhum padrão foi especificado; não se pode, só porque esse membro está ausente, restaurar a cada inicialização uma escolha que o usuário já limpou. A importação de dados antigos e a verificação da existência do arquivo final precisam ser adaptadas em conjunto.

Evidências: [codec do arquivo de seleção padrão atual](../../../../packages/provider-node/src/model-selection-config-file-codec.ts), [Repository da seleção padrão atual](../../../../packages/provider-node/src/model-selection-config-repository.ts) e [montagem atual do arquivo separado](../../../../packages/services/src/node.ts).

### 6.10 Escolha dos arquivos novos e diretório de manutenção do programa: confirmado

Contexto: o usuário pediu para ver apenas os arquivos e tabelas novos em comparação com o staging e confirmar a necessidade de cada um, sem misturar arquivos, schemaVersion e revision numa mesma rodada de explicação. A transformação de Provider / ModelSelection desta rodada não adicionou arquivos nem tabelas de banco, mas nas três tabelas existentes automations, automation_runs e off_peak_tasks do tasks-index.sqlite atual foi adicionada uma coluna model_selection TEXT cada, e não se pode ler "sem tabela nova" como "sem coluna ou migração nova". O design dessas colunas e das outras estruturas existentes que passam a usar ModelSelection foi aprovado de forma unificada, ver 6.14. Aqui ficam registradas apenas as escolhas de arquivos desta rodada, sem iniciar uma refatoração de catálogo de todo o repositório.

Camada de configuração do usuário: mantém provider_config.json, que concentra a configuração pessoal de Provider / Model, a ordenação e a seleção de modelo padrão de 6.9. O config.json agregado antigo continua cuidando das demais configurações e o conteúdo antigo de Provider serve apenas como entrada de upgrade. O estilo global de nomenclatura de arquivos ainda não foi confirmado e provider_config.json não é trocado por hífens por efeito colateral.

Camada de manutenção do programa: tudo unificado no diretório runtime/provider/ sob o diretório do ambiente. Aqui runtime representa os dados mantidos pelo programa, e não arquivos temporários que se pode apagar à vontade. As duas propostas anteriores de diretórios de topo cache/ e state/ foram substituídas.

```text
~/.zcode/v2/
|-- provider_config.json
|-- bot-config.v3.json
|-- bot-state.v3.json
`-- runtime/
    `-- provider/
|-- <plataforma>/<versao do app>/<identificador do endereco do servidor>/
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
| provider_config.json                                | mantido                                                        | concentra a configuração pessoal de Provider / Model sem ocupar o config.json agregado antigo                        |
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
Endereco A: revision 20, model-a
               |
| alternar para o endereco B que ja esta em cache
               v
Endereco B: revision 20, model-b
               |
Reproducao atual: Source = model-b, Registry = model-a
Objetivo da correcao: quando a origem muda, o identificador de runtime muda e o Registry publica model-b
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
configuracao pessoal da origem (contem defaultModelSelection)
            |
            v
mesmo envelope -> o lado de destino busca duplicidade por syncId
                       |
    +-- ja executado com sucesso: retorna o resultado existente
                       |
    `-- nao executado: aplica configuracao / settings / credenciais e valida
        |-- sucesso: salva os records
        `-- falha: reverte conforme o escopo real da escrita
```

Evidências: [controle de refresh](../../../../packages/provider-node/src/zcode-builtin-remote-synchronizer.ts), [schema de distribuição compartilhado](../../../../packages/shared/src/provider-provisioning.ts), [envio](../../../../packages/services/src/model-provider/providerProvisioningSource.ts) e [recebimento / rollback / registro de estado](../../../../packages/services/src/model-provider/providerProvisioningTarget.ts).

### 6.14 Outras estruturas explicitamente aprovadas ou não ajustadas

#### 6.14.1 Estruturas existentes passando a usar ModelSelection: aprovação unificada

O usuário decidiu explicitamente: "tudo que acrescentar um model selection sobre o que já existe, pode passar". Por isso não se rediscutem um a um os pontos de consumo de sessão / mensagem, seleção recente, estado de Subagent, Wiki, Bot, Automation e Off-Peak. Todos reutilizam a seleção genérica da seção 2, e a semântica de "não selecionado / seguir o padrão" já existente em cada entrada pertence à camada superior e não expande o ModelSelection em si.

O usuário esclareceu em seguida que "passar é reconhecer": não se pode reetiquetar esses itens como pulados, não confirmados ou dependentes de nova aprovação. Depois deixou claro que campos antigos não podem ser removidos, e a supplementação de preservar os valores antigos nos dois pontos Off-Peak / Wiki está registrada em 6.18, sem que isso derrube a estrutura de ModelSelection já aprovada.

A lista de alterações de banco desta rodada fica corrigida abaixo; as três colunas estão no tasks-index.sqlite existente e nenhum banco ou tabela nova é adicionada:

| Tabela existente | Nova coluna          | Decisão desta rodada           |
| --------------- | -------------------- | ------------------------- |
| automations         | model_selection TEXT | reutiliza ModelSelection, aprovado     |
| automation_runs     | model_selection TEXT | reutiliza ModelSelection, aprovado     |
| off_peak_tasks      | model_selection TEXT | reutiliza ModelSelection, aprovado     |

A nova localStorage key da seleção recente (zcode-model-selection-recent-v1 mais a identidade do workspace) pertence ao armazenamento do cliente e não é um novo arquivo JSON nem uma nova tabela. O Markdown de Subagent continua com sua expressão textual original de model / thoughtLevel e a aprovação deste item não exige converter tudo em JSON. O Bot mantém os arquivos novos v3 conforme a decisão corrigida em 6.10; "aprovar a estrutura de seleção" não exige ajustes adicionais no caminho do Bot.

O que foi aprovado é o design do schema e isso não isenta a verificação de migração dos dados do staging; por exemplo, a distinção já existente e deliberada entre SQL NULL, JSON null e uma escolha explícita precisa continuar preservando sua semântica de camada superior na implementação.

Evidências: [Automation e registros de execução](../../../../packages/services/src/session/automationRepo.ts), [Off-Peak](../../../../packages/services/src/session/offPeakTaskRepo.ts), [seleção recente](../../../../packages/ui/src/lib/composerRecent.ts) e [Markdown de Subagent](../../../../packages/shared/src/subagent-markdown-selection.ts).

#### 6.14.2 Seleção de conexão de conta: explicitamente não ajustada

Mantém o providerFamilyConnectionSelections existente dentro do setting.json: zai / bigmodel guardam as escolhas de conexão separadamente; o kind é start-plan, individual-coding-plan ou team-coding-plan, e o item de equipe traz productId, organizationId e projectId. O usuário já transformou o "ignorar por enquanto" anterior em uma decisão explícita de "não ajustar": não há unificação de nomenclatura de kind / mode nem reestruturação de campos, e o item deixa de ser listado como questão de nomenclatura pendente.

O problema de reescrever à mão um tipo que já tem schema continua sendo tratado de forma unificada conforme a seção 1.1; trata-se de organizar a origem dos tipos na implementação, sem mudar o formato de persistência. Evidências: [schema de seleção de conexão de conta e tipos duplicados](../../../../packages/shared/src/provider-family-connection-selection.ts).

#### 6.14.3 Key de credencial de conta: mantém o estado atual

Mantém a composição e a codificação atuais da key account-provider:...:api-key dentro do credentials.json existente: ela contém o Provider, a identidade da conta e os IDs de produto / organização / projeto necessários para a equipe. O usuário foi explícito em não mexer nesse item; não se troca coding-plan / team por individual-coding-plan / team-coding-plan e o armazenamento de credenciais não é refeito por causa disso.

Evidências: [geração da key de credencial](../../../../packages/services/src/model-provider/accountProviderCredentialKey.ts).

O escopo de campos do schema específico de origem também foi explicitamente mantido como "não ajustar", conforme 6.8; o princípio de derivar tipos do schema e as renomeações de campos comuns já confirmadas permanecem, sem que isso acrescente novas restrições por origem.

### 6.15 Se o objetivo desta rodada foi atingido e os limites de implementação

Tomando como escopo "a transformação de Provider / ModelSelection em comparação com o staging", esta rodada levantou os schemas centrais, as regras e origens, os arquivos físicos e as novas colunas de tabela, o schemaVersion, a revision e os registros de distribuição diretamente relacionados. A discussão posterior de rollback acrescentou a restrição de preservar campos antigos de 6.18, e a Session passou a ser um novo campo modelSelection. O usuário depois pediu para revisar apenas o que este Todo vai alterar, e 6.19 foi apertado nesse sentido para 13 itens e aprovado; o conteúdo de outros Todos não é reaberto. Uma revisão de design não representa conclusão da implementação nem da verificação de lançamento.

| Item revisado                                                  | Conclusão atual                                   |
| -------------------------------------------------------------- | ------------------------------------------------- |
| ModelSelection, ProviderConfig, ModelConfig                    | definidos nas seções 2, 3 e 5                    |
| inteligente/manual, regras por camada, camada externa de Provider / Template e nomes | definidos nas seções 6.1–6.7      |
| Restrições de campos específicos de origem                    | mantidas conforme 6.8, revisão direcionada aprovada |
| Seleção padrão, caminhos de arquivo, arquivos de Bot, cobertura de recursos e novas colunas | definidos nas seções 6.9–6.10 e 6.14 |
| Cinco limites de versão de formato, revision de publicação, problema do identificador de runtime | definidos nas seções 6.11–6.12, correções não implementadas |
| Registro de refresh / distribuição                             | tratado pela solução reduzida da seção 6.13      |
| Outras integrações de ModelSelection, seleção de conta e key de credencial | aprovadas ou explicitamente não ajustadas na seção 6.14 |
| Fonte única do schema                                          | princípio de implementação nas seções 1.1 e 7     |

O que ainda não foi atingido é "implementação concluída, pronta para lançamento": a implementação atual ainda é a antiga, e as transformações de campos/arquivos e o problema de revision já reproduzido não foram implementados. Antes do lançamento é preciso provar com resultados reais que uma instalação nova escreve o formato final e que os dados já publicados no staging migram direto para o mesmo formato final; não é exigida compatibilidade com os formatos intermediários não publicados deste branch. Essa é a verificação de implementação de decisões já tomadas, e não continuar projetando outro schema.

```text
instalacao totalmente nova --------------------> formato final
dados ja publicados em staging --upgrade----> o mesmo formato final
formato intermediario nao publicado neste branch --------> sem exigencia de compatibilidade
```

A aceitação da implementação se concentra em três trabalhos concretos: aplicar o schema / a leitura e escrita / os consumidores conforme este documento; verificar que a atualização do staging e inicializações repetidas não perdem nem ressuscitam configuração antiga; verificar a distribuição e o rollback da seleção padrão fundida e a correção da troca de Endpoint com o mesmo número. Conflitos reais são reportados quando aparecerem, sem pressupor novos campos e novas versões de migração.

Esta conclusão fecha a revisão de design e não promete que nunca será necessária uma migração futura, nem afirma ter feito uma auditoria de persistência de todo o branch. Comportamentos sem nova decisão, como edição manual de arquivos inválidos e compatibilidade com versões futuras, permanecem no escopo desta rodada e não ganham autorização de ampliação automática por causa deste documento.

### 6.16 Mapeamento da implementação e complemento da revisão de documentação

Abaixo as decisões já existentes são apenas mapeadas para os pontos de entrada reais, evitando que se altere só a definição do schema e se esqueça da escrita de volta, da migração ou do CLI independente; nenhum novo alvo de transformação é acrescentado. A referência do staging conferida nesta verificação é 790884b1ce e, se a linha de base mudar na implementação posterior, as diferenças relevantes devem ser revisadas, sem tratar o snapshot como um fato eterno.

| Decisão já existente                              | Pontos de entrada que precisam ser conferidos juntos                                                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renomeação de campos, agrupamento de regras e remoção de type | o parse de provider/config/schema.ts, a construção e o toJSON, toPersonalJSON e toZCodeBuiltinJSON de provider-config.ts / model-config.ts; não se pode mudar só o tipo de exibição, porque a escrita de volta ainda conteria campos antigos |
| Invólucro do config pessoal e fusão da seleção padrão | o provider-config-file-codec.ts, o personal-provider-config-repository.ts e o model-selection-config-repository.ts do provider-node, além da montagem do host e da assinatura da seleção padrão; não se pode manter um segundo model-selection.json com escrita contínua |
| Importação da configuração pessoal do staging    | o legacyPersonalProviderConfigImporter.ts do App e o legacy-cli-personal-provider-config-importer.ts do CLI independente produzem ambos o formato final; preserva-se a extração de intenção do usuário existente e a conversão de identidade antiga, sem congelar em sobrescrita do usuário a capacidade de default do sistema do Effective Config antigo |
| Bot mantém os arquivos novos v3                 | bots/repo.ts e storageMigration.ts seguem a cadeia atual de importação dos arquivos novos; verifica-se que configuração antiga / escolha de rascunho entre no arquivo v3 e que o arquivo antigo não é sobrescrito, sem implementar a migração pelo caminho original antes registrada por engano |
| Publicação embutida e identificador de origem de runtime | config/provider/zcode-builtin.json, o codec de release, a Source de download, o caminho de liberação do recurso fixo e a cadeia de recursos embutidos de CLI / Server são conferidos juntos, com o conteúdo que acompanha o pacote e o baixado usando o mesmo schema de publicação final |
| Adaptação da distribuição                       | shared/provider-provisioning.ts muda junto com o Source / Target e a codificação do resultado de estado; envio, recebimento e rollback de falha leem o mesmo personalConfig                         |

Evidências de pontos de entrada de migração existentes: [importação da configuração pessoal do App](../../../../packages/services/src/model-provider/legacyPersonalProviderConfigImporter.ts), [importação da configuração pessoal do CLI independente](../../../../apps/zcode-cli/packages/bootstrap/src/app/legacy-cli-personal-provider-config-importer.ts) e [migração de armazenamento do Bot](../../../../packages/services/src/bots/storageMigration.ts). Os outros pontos de entrada de código estão nas seções de decisão correspondentes, sem copiar mais um design de implementação.

O que a revisão de documentação complementa é: a diferença entre o exemplo público de Match e o schema oficial, a relação entre configuração completa e manual, a semântica de cobertura de enabled e null, a ordem das regras e a unicidade de identidade, a leitura e escrita completas e o rollback após a fusão da seleção padrão, e a diferença entre a versão final 1 e a importação de dados antigos. Tudo isso serve para deixar explícitas as decisões já existentes e os comportamentos atuais que precisam ser preservados; se a implementação descobrir que é preciso mudar algum deles, o motivo concreto deve ser reportado, e "aprimorar a documentação" não é autorização para ampliar a transformação do produto.

### 6.17 Reavaliação completa pela verificabilidade: manter a solução e distinguir dificuldade de verificação de volume de trabalho

O usuário deixou explícito que "tudo que é fácil de verificar não é risco alto" como critério desta rodada. Antes, a fusão da seleção padrão e a reestruturação externa foram classificadas direto como de alto risco por terem ampla superfície de impacto, o que misturou a julgamento de volume de trabalho; esta seção substitui essa classificação e não equipara complexidade a dificuldade de verificação. A fusão da seleção padrão de 6.9 é restaurada, e o Bot mantém os arquivos novos v3 existentes depois da correção do registro em 6.10. Não há nova decisão de campo nem autorização para começar a implementação do produto.

Conclusão da reavaliação: hoje todos os itens têm entradas que podem ser construídas e resultados que podem ser julgados, e não foi encontrada nenhuma mudança que precise ser revertida por dificuldade de verificação. A fusão da seleção padrão, a passagem de revision e a cobertura de recursos exigem uma verificação de integração / empacotamento mais completa, mas o método de verificação é claro. "Poder ser verificado" não significa "que os testes atuais já provaram que a solução final está correta"; a tabela abaixo é a base de verificação para os riscos reais durante a implementação.

| Grupo de mudanças                                              | Resultado esperado explícito                                                                                  | Forma de verificação e limite atual                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| ModelSelection e integração de estruturas existentes         | o mesmo providerId / modelId / reasoningLevel é preservado na leitura e escrita; a semântica de valor vazio de cada camada superior é preservada | reutiliza os consumidores e testes de migração existentes, com a estrutura aprovada por decisão do usuário e sem redesenhar um a um; as três novas colunas continuam sendo conferidas na leitura e escrita do upgrade |
| Renomeação de campos de Provider / Model, reposicionamento de propriedades e remoção do type das opções | o arquivo final contém apenas os campos alvo e o roundtrip de leitura e escrita não perde valores; a semântica da configuração efetiva final é preservada | casos positivos e negativos de schema, asserções de serialização e comparação de valores válidos antes e depois; resultado fácil de determinar e não se substitui uma expectativa independente pelo "roundtrip bem-sucedido do mesmo codec defeituoso" |
| Reestruturação externa de Provider / Template e nomes        | IDs, relação com o template, valores de cobertura e ordem são preservados; o nome criado usa o valor do idioma e é deduplicado, sem mudar após reinício | os testes existentes de criação / deduplicação por concorrência / Overlay se adaptam; acrescentam-se asserções explícitas para o array alvo e para a movimentação de campos, além de um E2E das operações de settings. É trabalho considerável, mas o resultado é diretamente comparável |
| Agrupamento inteligente / manual e schema específico de origem | campos de origem inválidos e regras manuais incompletas são rejeitados sem deixar modificação pela metade; o enabled é preservado de forma independente e os parâmetros manuais não acompanham atualizações da camada anterior | os testes existentes de configuração fixa / restrição de origem / edição atômica têm cenários correspondentes; acrescentam-se casos de exclusividade dos conjuntos e do novo schema, fáceis de verificar |
| Camadas de Match, remoção de providerMatch e as quatro regras movidas para Site | cada camada rejeita campos fora do seu nível; o Endpoint / API / modelo indicado é atingido e entradas próximas mas não conformes não são atingidas; a ordem das regras é preservada | verificação por matriz explícita de acerto/não acerto, incluindo API Key comum no mesmo Endpoint e as fronteiras de Start Plan e Off-Peak. Verifica-se o escopo declarado localmente, sem afirmar que isso prova a capacidade real do modelo remoto |
| Fusão da seleção padrão e adaptação da distribuição         | modificar qualquer membro não perde os outros; limpar e reiniciar não restaura a escolha antiga; modificações concorrentes são todas preservadas; uma falha de distribuição restaura o valor original sem sobrescrever modificações feitas no meio | a atualização de arquivo, a importação e a injeção de falha podem ser construídas de forma estável; acrescenta-se também escrita / notificação em dois processos reais e integração real de distribuição. É verificável e exige bastante trabalho de integração |
| Importação do staging e arquivos de Bot                      | instalação nova e importação de dados antigos geram o formato final, e inicializações repetidas não reimportam; o Bot continua gravando o arquivo v3 e o arquivo antigo fica intacto | os importers do App / CLI e os testes do Bot podem ser reutilizados, conferidos com fixtures de arquivos antigos e um resultado esperado independente; não se planeja a transformação do caminho original do Bot antes registrada por engano |
| schemaVersion e revision de publicação embutida              | os cinco limites de formato aceitam a versão final 1 e rejeitam entradas sem a estrutura esperada; a comparação de publicação aceita um número maior e rejeita o mesmo número com conteúdo diferente | os testes de codec / release conseguem verificar o mecanismo de comparação; o empacotamento e a publicação reais ainda precisam conferir a revision e o conteúdo no mesmo escopo de publicação, e um teste unitário não substitui o gerenciamento dos números de publicação |
| Correção da origem da revision de runtime embutida            | com dois Endpoints de mesmo número e conteúdos diferentes, depois da troca Source, Account, Registry e Worker ficam consistentes e passam a usar a configuração nova | já existe uma reprodução temporária com Source / Config / Registry reais; transformá-la em regressão oficial e cobrir o Host / Worker reais. É observável e reproduzível, e a cadeia inteira não pode ser provada apenas com mock em memória |
| Caminhos runtime/provider e cobertura do recurso fixo         | cada host lê e escreve no diretório de isolamento correto; quando o recurso fixo muda, ele é substituído, e quando não muda, é reutilizado, sem cópias adicionais crescendo por hash e sem leitura de um arquivo pela metade | testes de arquivo em diretório temporário, cenários de leitura e escrita concorrente / falha e verificação de inicialização com artefatos construídos de verdade de Desktop / CLI / Server; a substituição atômica é verificada nos sistemas suportados. Segue apremissa já decidida de sair do programa antigo antes do upgrade |
| Fonte única do schema e os dois ajustes pequenos da distribuição | os tipos vêm do schema e a fronteira entre antes e depois do parse / a serialização da class não se confunde; não sobram consumidores de sourceRevision e o valor do resultado continua sendo o identificador de configuração | checagem de tipos, casos de tipo negativo quando necessários, testes de comportamento de codec, checagem de dependências e casos de protocolo de envio / recebimento. Não se pode provar que a validação de runtime não foi flexibilizada só porque o tipo passa, e não há exigência de reescrever as classes de comportamento |

Limites de verificação encontrados nesta conferência somente de leitura: em provider-node-runtime.test.ts, o caso chamado de "leitura inicial por vários processos em paralelo" na verdade cria dois Repository no mesmo processo, o que valida chamadas de múltiplas instâncias, mas não prova de forma independente o lock e a notificação entre processos. providerProvisioningTarget.test.ts já tem cenários de rollback em falha, proteção de credenciais concorrentes e sincronização de snapshot vazio, mas usa principalmente mock; serve como base de adaptação e não equivale a uma verificação do rollback real do arquivo fundido. O teste de materialização de recursos hoje verifica que a versão antiga é mantida por hash e, ao implementar a solução de caminho fixo, essa expectativa antiga precisa ser substituída.

Para as duas cadeias que mais precisam de verificação de integração, usam-se barreiras de execução controladas, injeção de falha e julgamento pelo resultado real de persistência, em vez de rodar várias vezes ou dormir um tempo arbitrário para perseguir a sorte:

```text
Processo A altera o Provider ----+
Processo B altera a selecao padrao -----+-> mesma atualizacao de arquivo -> os dois itens sao preservados -> o outro processo le o novo valor
                                  |
falha ao injetar depois da distribuicao da aplicacao
`-> verifica a restauracao do valor original / o novo valor durante o periodo nao e sobrescrito

Endpoint A(rev 20) -> alterna para B(rev 20, conteudo diferente)
`-> Source -> Account / Registry -> o Worker usa B
```

Todas as mudanças-alvo já confirmadas são mantidas, e os passos de implementação verificáveis são formados separadamente por estrutura de dados, fusão de arquivos e montagem de origem e caminhos. O código que precisa mudar junto por causa de uma dependência compartilhada é alterado por completo no mesmo passo, sem introduzir double write temporário, migração intermediária ou novo formato de compatibilidade só para dividir commits. O fim da implementação é confirmado por resultados de verificação, e não pela avaliação de verificabilidade deste documento.

Evidências: [testes de configuração e modo fixo](../../../../packages/provider/test/config-service.test.ts), [testes de regras](../../../../packages/provider/test/model-config-rules.test.ts), [testes de armazenamento / materialização do Node](../../../../packages/provider-node/test/provider-node-runtime.test.ts) e [testes do alvo de distribuição](../../../../packages/services/test/providerProvisioningTarget.test.ts). Desta vez não foram executados testes de produto voltados ao alvo futuro nem alterado o código de produto.

### 6.18 Rollback prático: preservação de campos antigos e as três decisões de correção pendente

O usuário tende a preferir campos novos / arquivos novos, o que facilita o rollback prático, e esclareceu ainda que "os campos simplesmente não podem ser excluídos". Os valores antigos são preservados para uso das versões antigas, e a nova versão só atualiza os seus próprios campos, sem exigir que os valores novos sejam sincronizados de volta continuamente para o formato antigo. Essa restrição se aplica ao armazenamento já publicado do staging que este Todo modifica; o novo formato de Provider ainda não publicado neste branch continua seguindo as decisões anteriores de renomeação, agrupamento e fusão, e não se pode confundir esses dois tipos de "campo antigo". O Markdown de Subagent já foi explicitamente definido no Todo 97 como usando migração de identidade no campo original, o usuário pediu para respeitar essa escolha de legibilidade e este Todo não derruba esse plano, ver 6.19.2.

#### 6.18.1 Off-Peak: pendente de correção, as colunas antigas de modelo não são mais limpas

A tabela existente já ganhou model_selection, mas ao salvar, updateEditableFields ainda define model / thought_level como NULL. O usuário pediu a correção para: atualizar apenas a nova seleção e os campos editados nesta operação, mantendo as colunas antigas de modelo com os valores existentes, sem limpá-las e sem reescrevê-las a partir da nova seleção. Um registro novo não tem valor antigo, e não é preciso fabricar uma escolha antiga.

Escopo de implementação: remover as duas atribuições model = NULL / thought_level = NULL do UPDATE atual; os pontos de entrada existentes de atualização de campos, validação e gravação são reutilizados, sem criar um novo mecanismo de gravação.

A aceitação verifica diretamente as colunas brutas do SQLite: depois de mudar só o título ou a nova seleção, as duas colunas antigas de modelo continuam iguais ao que eram antes da modificação e o modelSelection realmente lido pela nova versão está correto. Este item ainda não foi implementado.

#### 6.18.2 Wiki / Draft: pendente de correção, os campos antigos são preservados ao salvar

Na leitura atual, generationModel / generationOptions.thoughtLevel são convertidos no novo modelSelection, mas o objeto entregue à camada de execução não contém mais os campos antigos de modelo; gravar o objeto de execução de volta apagaria os valores antigos em disco. O usuário pediu a correção para que os campos antigos continuem presentes após um salvamento normal, servindo o conteúdo apenas como snapshot de rollback e sem participar do parse da nova seleção.

A alteração deve se concentrar no adaptador de salvamento de Wiki / Draft do RepoWikiStorage: na gravação, preservar alguns valores antigos do disco reutilizando o lock de arquivo existente e a escrita atômica atomicWriteText. Depois da leitura os campos antigos já não estão no objeto de execução, então não se pode afirmar que basta apagar duas linhas, mas não é preciso refazer o serviço de gravação, introduzir cache ou sincronização em segundo plano, nem reescrever utilitários de IO genéricos. Um arquivo novo, sem valor antigo, não precisa de parâmetros antigos fabricados. Se a implementação obrigatoriamente precisar ir além desse escopo local, o motivo concreto precisa ser explicado, e preservar campos não pode virar uma reestruturação da arquitetura de gravação.

Também foi verificado que generationOptions.maxOutputTokens do staging é um campo publicado, e o princípio de preservar campos antigos também se aplica a esse valor existente. A nova versão continua usando o Limit do modelo, não restaura o orçamento manual de saída e não gera orçamento antigo para arquivos novos; isto complementa o comportamento de armazenamento do Todo 94 ("remover o orçamento antigo em um salvamento normal") e não derruba as decisões de execução e de UI dele.

A aceitação cobre Wiki e Draft: depois de salvar a nova seleção, os valores antigos de modelo / reasoning / orçamento continuam presentes, o corpo e o generateDiagrams atual são salvos normalmente e os parâmetros antigos não entram na requisição atual. Depois de preservar os valores antigos, ainda é preciso verificar que uma nova escolha explicitamente limpa ou inválida não ressuscita o valor antigo após o reinício. A marcação específica de salvamento e a implementação de leitura e escrita não são definidas unilateralmente nesta rodada, e não se pode tomar o modelSelection: null da implementação já retirada como uma nova decisão de schema do usuário.

```text
campo antigo em disco -- mantem o valor original ----------------> leitura da versao antiga apos rollback
selecao da versao nova   -- atualiza campo novo / arquivo novo -----> leitura da versao atual
               |
`-- apos a limpeza a versao nova continua prevalecendo, sem reimportar o valor antigo
```

#### 6.18.3 Session: novo campo modelSelection, preservando os campos antigos

Atualização de implementação de 2026-09-10: o B1c já realizou o invólucro em disco e a preservação do snapshot antigo, a regressão de integração parcial passou e a verificação completa de entrega continua junto com o B5. O "após a migração atual" abaixo é um exemplo de investigação anterior à transformação. O SessionStorePort lógico continua usando o payload ModelSelection, e o adapter faz o invólucro e o desembrulho de forma unificada; não se exige que core/bootstrap sintam o campo de rollback. As evidências e os limites estão no [razão de implementação](../research/todo104-schema-implementation-ledger.md).

O session_entry do banco já tem registros de "seleção de modelo atual" com type runtime/model_selection. Se a migração atual atingir esse registro antigo, ela reutiliza o id dele e reescreve o JSON de data; ao derivar a seleção a partir de mensagens antigas, é adicionado um novo entry. As linhas antigas de message mantêm os mesmos bytes. Tomando como exemplo uma identidade antiga determinável do Z.ai Coding Plan:

```text
a mesma session_entry.data (antes da migracao)
  providerId: "builtin:zai-coding-plan"
  modelId: "GLM-5.2"
  thoughtLevel: "high"
                 |
                 v
a mesma session_entry.data (depois da migracao atual)
  providerId: "account:zai-individual-coding-plan"
  modelId: "GLM-5.2"
  options: { reasoningLevel: "high" }
```

Há duas perdas no lugar: o thoughtLevel é substituído; e o providerId, embora com o mesmo nome de campo, também tem o valor alterado. Preservar apenas o thoughtLevel não equivale a preservar a identidade de modelo original da versão antiga. Comparando de novo com origin/staging@790884b1ce, a versão antiga realmente já tinha registros de seleção com o mesmo type e id estáveis, e essa não é uma nova categoria de registro criada por este branch.

O usuário confirmou que isso era uma omissão e exigiu explicitamente uma migração para um campo novo. Solução final: manter o id / type da mesma entry e adicionar modelSelection no data; o providerId / modelId / thoughtLevel antigos mantêm seus valores originais, e as escritas posteriores da nova seleção atualizam apenas o novo membro, sem sincronizar continuamente os campos antigos de volta. Nenhuma tabela nova e nenhum novo tipo de entry são criados; esta decisão substitui o estado anteriormente pendente de discussão e a sugestão indefinida de "gravar um registro novo da nova versão".

Camada externa do registro: mantém os metadados existentes de session_entry e a categoria runtime/model_selection, sem ajuste de estrutura.

Camada de data: os campos antigos carregam apenas o snapshot de rollback existente, e o novo membro carrega a seleção atual. Os campos antigos são opcionais, porque um registro novo não precisa fabricar valores antigos; aqui são mostrados apenas os membros relevantes, sem autorização para remover outros campos existentes do data.

```ts
interface SessionModelSelectionEntryData {
  providerId?: string;
  modelId?: string;
  thoughtLevel?: string;
  modelSelection?: ModelSelection;
}
```

Camada do modelSelection: reutiliza a estrutura genérica da seção 2, sem criar um conjunto separado de definições de identidade de Provider / Model.

```text
primeiro upgrade: providerId / modelId / thoughtLevel antigos
    |-- valor original preservado ----------------> leitura da versao antiga
    `-- apos a conversao, escreve em modelSelection -> leitura da versao nova
alteracoes posteriores: atualiza apenas modelSelection, mantendo o valor original dos campos antigos
```

Quando já existe uma entry antiga, o novo membro é acrescentado; quando não há entry e só existem mensagens antigas, ainda se pode criar uma entry de seleção, mas colocando a nova escolha em modelSelection e sem alterar as mensagens antigas. Os pontos de entrada da nova versão que leem, salvam, restauram e copiam a seleção, como fork, precisam se adaptar ao invólucro, e não basta modificar a função de migração. Quando já existe estado novo, não se pode voltar a completar valores a partir dos campos antigos ou de mensagens históricas; depois de limpar uma escolha inválida, o reinício não ressuscita o valor antigo, e a marcação específica de valor vazio continua seguindo as restrições da camada superior, sem que esta interface apresente uma decisão adicional sobre o formato de null.

A aceitação lê o JSON bruto do banco: os campos antigos são idênticos valor a valor antes e depois da migração, a identidade e o nível do novo membro são convertidos corretamente; modificar a nova seleção continua preservando o snapshot antigo; a migração é idempotente; as mensagens antigas não mudam. Além disso, um reader antigo alvo é usado para conferir que a identidade e o nível originais ainda podem ser lidos. Este item ainda não alterou o código nem executou os testes da solução alvo.

A verificação do comportamento antigo é apenas evidência estática atual: a cadeia de recuperação desktop / Web do staging acima consegue ler IDs desconhecidos, mas julga o modelo correspondente como indisponível; havendo um modelo disponível existe um caminho de fallback e, sem nenhum modelo disponível, o histórico abre, mas o envio fica bloqueado. A versão antiga não lê options.reasoningLevel. Portanto esta decisão resolve a perda do snapshot da escolha original e não deve ser apresentada como se a versão antiga necessariamente não conseguisse abrir a sessão inteira; também não se afirma que o rollback em uma máquina real com o App antigo foi concluído.

Evidências: [edição de Off-Peak](../../../../packages/services/src/session/offPeakTaskRepo.ts), [armazenamento de Wiki](../../../../packages/services/src/repo-wiki/repoWikiStorage.ts), [migração de seleção de Session](../../../../apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/model-selection-migration.ts), [conversão de identidade antiga](../../../../packages/shared/src/legacy-model-provider-identity.ts) e [limite original do rollback prático](./todo-69-provider-refactor-practical-rollback-compatibility.md).

#### 6.18.4 Limites concretos que ainda exigem atenção

- A migração do novo campo da Session já foi decidida e está a ser implementada; a estrutura genérica do ModelSelection e os outros itens aprovados permanecem. A 6.19 lista apenas o que este Todo vai alterar, e o usuário aprovou o escopo apertado.
- "Limpar a escolha na nova versão não pode ressuscitar o valor antigo" depois de preservar os valores antigos é um requisito de verificação das três correções pendentes e não exige ampliar antes o ModelSelection genérico.
- As evidências de rollback do Todo 69 se referem ao Reader de staging congelado no documento dele e não afirmam um rollback completo em máquina real com o App antigo; a aceitação da implementação deve deixar explícito o alvo real do rollback e não tomar os testes de leitura e escrita da nova versão como prova de que a antiga consegue ler.

Nesta rodada foram registrados em disco apenas as decisões acima e os pontos ainda a discutir. As duas implementações e testes iniciados por engano antes foram totalmente revertidos e nenhuma modificação de produto foi mantida; no futuro isso só deve ser feito depois que o usuário iniciar explicitamente a implementação, e a verificação deve recomeçar com testes primeiro.

### 6.19 Lista de mudanças fora do schema central deste Todo: escopo apertado e aprovado

O usuário foi explícito: "só vou decidir o que este nosso todo precisa mudar, o resto não vou ver" e "só não quebrem o que já funciona, perder algo não tem problema". Esta seção substitui a lista A/B/C anterior, que misturava comportamentos já existentes neste branch; ficam apenas as mudanças que o Todo 99 vai implementar, omitindo os campos internos das regras de Provider / Model Config e de Config já definidos antes. O usuário aprovou os demais itens e, ao conhecer a solução local de salvamento de Off-Peak / Wiki e o contexto do Todo 97, confirmou de novo; ainda não há autorização de implementação de produto.

#### 6.19.1 Os 13 itens de suporte que este Todo vai modificar

| Nº   | Item                       | Modificação e limite confirmados                                                                                                                                                       |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Migração de seleção da Session | o entry.data original ganha modelSelection, mantendo os valores originais de providerId / modelId / thoughtLevel; os pontos de entrada de leitura, gravação, restauração e cópia como fork são adaptados junto. Nenhuma tabela ou tipo de entry novo, ver 6.18.3 |
| 2    | Salvamento de Off-Peak     | o UPDATE atual deixa de definir o model / thought_level antigo como NULL; a cadeia de gravação existente é reutilizada, ver 6.18.1                                                     |
| 3    | Salvamento de Wiki / Draft  | a camada de armazenamento preserva ao salvar os valores antigos de modelo, nível e maxOutputTokens, reutilizando o lock e a escrita atômica existentes; a funcionalidade de orçamento antigo não é restaurada e o mecanismo de gravação não é reestruturado, ver 6.18.2 |
| 4    | Fusão do arquivo de seleção padrão | o model-selection.json é fundido em config.defaultModelSelection do provider_config.json; leitura e escrita, atualização com lock, verificação de conflito e notificação são ajustadas. Limpar a seleção não exclui o arquivo inteiro e não se autoriza excluir por efeito colateral o arquivo antigo, ver 6.9 |
| 5    | Caminho da configuração baixada | o active.json passa a runtime/provider/<plataforma>/<versão do app>/<identificador do endereço do servidor>/zcode-builtin.json, mantendo as três dimensões de isolamento |
| 6    | Caminho do registro de refresh | o refresh-control.json passa a zcode-builtin-refresh.json no mesmo diretório acima; os campos internos e os mecanismos de ocupação e retentativa permanecem                              |
| 7    | Caminho do registro de distribuição | o provider-provisioning-state.json passa a runtime/provider/provisioning.json; records / syncId e a semântica de deduplicação permanecem                                        |
| 8    | Cópia do recurso embutido  | fixada em runtime/provider/bundled/zcode-builtin.json, com sobrescrita atômica na inicialização quando o conteúdo difere, sem gerar mais cópias por hash. O caminho está em 6.10                                  |
| 9    | Consolidação das versões de formato | as cinco versões finais de schemaVersion unificadas em 1; o invólucro de versão separado da seleção padrão é cancelado junto com a fusão e o Bot mantém version: 3, ver 6.11            |
| 10   | Correção de refresh na troca de origem | o identificador embutido de runtime passa a incluir a origem de Endpoint e a atravessar os consumidores existentes; corrige-se a falta de refresh quando dois endereços têm a mesma revision e conteúdos diferentes, sem novo campo de revision persistido, ver 6.12 |
| 11   | Adaptação do envelope de distribuição e do rollback | remove-se o sourceRevision sem chamadas; a seleção padrão passa pelo personalConfig e o configuredDefault externo é removido; o arquivo pessoal inteiro é aplicado, validado e revertido em caso de falha de forma unificada, mantendo a proteção contra modificações concorrentes, ver 6.13 |
| 12   | Renomeação do resultado de distribuição | registryRevision passa a configRevision, com o valor real e os demais campos de resultado inalterados e sem simplificar o invólucro records, ver 6.13                        |
| 13   | Limpeza de tipos duplicados  | no escopo deste Todo, os tipos de dados são derivados do schema; fora do núcleo isso inclui os tipos duplicados de seleção de conexão de conta, sem mudar seus campos de persistência, ver 1.1 / 7                       |

O parse, a serialização, a importação de staging do App / CLI independente e a adaptação dos consumidores exigidos pelas decisões centrais de schema continuam sendo executados integralmente conforme 6.16; essa lista não os cancela. A regra unificada e monotônica de revision de publicação embutida continua conforme 6.12, mas o compromisso de publicação não vira uma nova transformação de armazenamento.

Este Todo não exige refazer o formato de mensagem / Part, a tabela de uso, a preferência global de reasoning, a seleção recente, Automation, Bot, a conexão de conta ou o mecanismo de credenciais; as conclusões já aprovadas ou explicitamente não ajustadas de 6.14 permanecem. As adaptações de chamada necessárias para as mudanças de interface centrais ainda precisam ser feitas, e isso não autoriza refatorar esses negócios nem mudar o formato de armazenamento deles por efeito colateral.

#### 6.19.2 Markdown de Subagent: corrigir o julgamento errado e respeitar a escolha do Todo 97

Escrever a conversão de identidade de Provider no lugar (A10) como "novo achado, a ser decidido nesta rodada" é um registro errado e está revogado agora. A base original é o [Todo 97 §1–3](./todo-97-subagent-markdown-in-place-migration-and-legacy-read-audit.md): o Markdown é para leitura e edição manual do usuário, o formato oficial mantém explicitamente model / thoughtLevel e apenas a identidade antiga de Provider no diretório de dados do usuário é migrada dentro do próprio campo, sem gravação automática de volta em arquivos de projeto / plugin. A migração preserva o ID do modelo, o nível, o corpo, os comentários e o conteúdo não relacionado. O campo original pertence aqui ao formato oficial, e não se pode aplicar mecanicamente a definição de "campo antigo" usada em outros armazenamentos JSON.

Essa é uma escolha de legibilidade já decidida, e não algo deixado de lado por causa de outro Todo. Este Todo não transforma o Markdown em um modelSelection aninhado, não adiciona campos, arquivos sombra ou contornos de compatibilidade de identidade antiga e não exige nova aprovação do usuário para o Todo 97. As evidências existentes de execução e de teste são mantidas pelo Todo 97 e não são convertidas em novas tarefas do Todo 99.

#### 6.19.3 Significado concreto dos requisitos de verificação

Os exemplos abaixo são de aceitação de comportamentos já confirmados e não quatro mecanismos novos; a prioridade é reutilizar as leituras e escritas existentes e a proteção contra concorrência, sem refazer a arquitetura por causa de uma exigência de verificação.

```text
preservacao do valor antigo:
campo antigo guarda A -> selecao nova e B -> o campo antigo continua A e o novo campo e B

limpar nao ressuscita:
a versao nova limpa B -> reinicia -> continua sem selecao, sem reimportar A do campo antigo

a combinacao nao sobrescreve por engano:
alterar o modelo padrao -> a API Key e a configuracao do Provider no mesmo arquivo sao preservadas

rollback de falha nao sobrescreve por engano:
a distribuicao escreve B -> o usuario salva C -> a distribuicao falha
`-> nao sobrescreve o C do usuario com o A anterior a distribuicao
```

O exemplo de limpeza só vale para as entradas em que o negócio já permite limpar; hoje o Off-Peak não permite salvar uma escolha vazia e não se acrescenta essa funcionalidade para este exemplo genérico. Aqui só se exige que a semântica existente de valor vazio e a correção da gravação se mantenham, sem inventar um novo formato de null nem uma estrutura de compatibilidade global. Outros problemas esquecidos podem ser registrados à parte e não servem de motivo para expandir este Todo sem limite.

## 7. Verificação direcionada de schema / tipos escritos à mão

O escopo são as estruturas centrais discutidas nesta rodada e os tipos completos de configuração / protocolo diretamente relacionados, e não se afirma ter concluído uma auditoria de todas as estruturas de persistência do repositório.

| Estrutura                                                   | Fato verificado                                                                                                                                                | Direção de organização posterior                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| ModelSelection                                             | shared/model-selection.ts já usa z.infer; provider/registry.ts reexporta e deriva a partir de options, sem reescrita manual            | manter                                                                                                  |
| ProviderConfig, API, Access, Logo, Template                  | config/schema.ts tem a definição de runtime, mas provider-config.ts ainda escreve à mão os campos correspondentes de Input / Object / interface | derivar do schema de dados base, distinguindo a entrada da class com métodos do objeto serializado       |
| ModelConfig, Properties, formatos de entrada e saída, OptionSpecs | config/schema.ts tem a definição de runtime e model-config.ts escreve à mão os campos de Input / Object etc. em separado                 | schema compartilhado e tipos derivados; não tomar a remoção da class como premissa                    |
| Os três membros de ModelConfigRule                           | a fábrica de schema define a estrutura das regras e model-config.ts escreve à mão as interfaces de regra de novo                        | derivar dos schemas de regras concretos; a fábrica usa hoje ZodTypeAny e a implementação precisa preservar o tipo concreto de config, sem deixar a derivação degenerar em any |
| Configuração completa do Registry                            | resolver.ts escreve à mão RegistryModelConfig / RegistryModelConfigObject e outros membros completos; hoje a completude depende de validateComplete, e não de um schema completo independente já existente | compartilhar as definições de campos com a configuração completa / esparsa / fixa e não afirmar incorretamente que aqui já existe um schema completo que só não foi inferido |
| Protocolo ZCodeProviderAccountAccess                        | shared/zcode-protocol/index.ts já infere do schema, e o Resolver ainda tem escrita à mão a estrutura de acesso de conta do Registry com a mesma forma | manter o tipo de protocolo já derivado e respeitar a direção de dependência entre pacotes ao compartilhar a forma dos dados |
| Seleção e settings de conexão de conta                      | shared/provider-family-connection-selection.ts define dois schemas e mesmo assim escreve à mão o tipo de união e os tipos de mapeamento de settings | passar a derivar do schema, sem mudar kind, IDs de equipe ou a forma de persistência; o usuário já pulou a reestruturação        |

Evidências: [ModelSelection](../../../../packages/shared/src/model-selection.ts), [reuso de Selection no Registry](../../../../packages/provider/src/registry.ts), [schema de configuração](../../../../packages/provider/src/config/schema.ts), [tipos de Provider](../../../../packages/provider/src/config/provider-config.ts), [tipos de Model / Rule](../../../../packages/provider/src/config/model-config.ts), [tipos completos do Registry](../../../../packages/provider/src/resolver.ts) e [tipos de protocolo](../../../../packages/shared/src/zcode-protocol/index.ts).

## 8. Todos posteriores e limite atual

- [x] Registrar o contexto da revisão, o princípio de permitir reorganizar schemas não publicados e o acordo de discutir antes de implementar.
- [x] Registrar a forma confirmada do ModelSelection e o limite do estado padrão da camada superior e do max output.
- [x] Registrar as duas renomeações de ProviderConfig, o contexto de OAuth que mantém o aninhamento de API e itens mantidos como entitled.
- [x] Registrar as decisões em camadas do ModelConfig: nomenclatura dos campos de entrada e saída, reposicionamento do campo MFJS e remoção do type das duas opções.
- [x] Registrar as duas renomeações de campos de Match, o estado da discussão sobre config condicional / Match em camadas / invólucro de Provider, além do princípio de derivar tipos do schema e da verificação direcionada.
- [x] Registrar a evolução da configuração inteligente / manual com o nome ManualModelConfig, as decisões sobre o conjunto de regras de Provider e a movimentação da identidade para fora; a solução intermediária useSmartConfig foi substituída pelo agrupamento em conjuntos.
- [x] Confirmar que não se cria ProviderModelRuleIdentity e que os ramos inteligente / manual reutilizam por derivação os schemas de regras existentes.
- [x] Registrar a nomenclatura builtinProviderModelRules, os limites estritos das três camadas de Match, o modelMatch obrigatório e a remoção do campo providerMatch / da lógica de correspondência.
- [x] Registrar que as quatro regras antigas com condição de Provider migram para a camada Site, substituindo a sugestão antiga de colocar mídia de conta na camada de instância; as regras genéricas de site já confirmadas são mantidas.
- [x] Registrar o templateNameMap, o providerName externo, a correção do nome de tipo ProviderConfigRule e a decisão de deduplicar e salvar o nome padrão do template na criação.
- [x] Registrar que as regras de modelo comuns / manuais são divididas em dois arrays, com a identidade de um mesmo modelo mutuamente exclusiva dentro do conjunto pessoal, sem novo Identity e sem persistir useSmartConfig.
- [x] Remover da estrutura-alvo o type duplicado das regras determinado pelo conjunto, mantendo os types válidos de API / Access / Logo.
- [x] Registrar a camada de conteúdo config acrescentada ao arquivo pessoal e a estrutura completa em camadas dos arquivos embutido / pessoal.
- [x] Registrar a fusão do model-selection.json no arquivo pessoal, usando config.defaultModelSelection e reutilizando o ModelSelection genérico; a solução de arquivo separado é substituída por esta decisão.
- [x] Registrar a escolha dos arquivos novos, o diretório runtime/provider e a nomenclatura dos arquivos de download / refresh, substituindo a solução cache + state; o Bot mantém os arquivos novos v3 e a migração pelo caminho original é um registro errado já revogado; o recurso embutido passa a ser um arquivo fixo com sobrescrita atômica, sem cópias históricas por hash.
- [x] Registrar o schemaVersion do novo formato de publicação embutida definido como 1 e o limite de não exigir compatibilidade com formatos intermediários não publicados.
- [x] Registrar que o schema específico de origem é derivado do schema base; os limites atuais passaram na verificação direcionada e nenhuma reestruturação é acrescentada.
- [x] Registrar os cinco limites de schemaVersion, a regra unificada de número de publicação embutida e os fatos da review de revision com os três planos de correção pendentes.
- [x] Registrar a decisão reduzida sobre o registro de refresh / distribuição: manter endpointKey e o invólucro records, fazendo apenas os dois ajustes de campo claros e a adaptação necessária para a fusão da seleção padrão.
- [x] Registrar que a integração das outras estruturas existentes com ModelSelection foi aprovada de forma unificada; preencher as novas colunas dos três tabelas existentes e distinguir "sem tabela nova" de "sem coluna nova".
- [x] Registrar que a seleção de conexão de conta, a key de credencial e as restrições de campos por origem foram explicitamente mantidas como não ajustadas; o tipo duplicado escrito à mão da seleção de conta continua sendo organizado pelo princípio da fonte única.
- [x] Conferir a cobertura da revisão das estruturas centrais e registrar os limites de implementação / verificação de lançamento; a omissão de rollback da Session é tratada pela decisão de migração para campo novo de 6.18.
- [x] A revisão de documentação esclarecer os limites de Match / configuração manual, a cobertura e a ordem, a migração de identidade, a leitura e escrita / o rollback do arquivo fundido e os pontos de entrada de importação existentes de Bot, ver 1.2, 6.2–6.4, 6.9–6.13 e 6.16.
- [x] Restaurar a fusão do arquivo de seleção padrão, corrigir o registro errado da migração pelo caminho original do Bot e reavaliar todas as mudanças pela verificabilidade, ver 6.17.
- [x] Registrar que passar é reconhecer, que campos antigos publicados não são excluídos, as duas correções pendentes de Off-Peak / Wiki e o limite de autorização de apenas discutir / registrar em disco, ver 6.18.
- [x] Determinar que a Session ganha modelSelection no entry.data existente, mantendo os valores originais dos campos antigos e sem nova tabela ou tipo de entry; ver 6.18.3.
- [x] Migração do novo campo da Session e adaptação dos pontos de entrada de leitura / gravação / cópia, verificando a preservação dos campos antigos, a idempotência da migração e o fato de limpar não ressuscitar; evidências de B1c e B5 no razão.
- [x] 6.19 apertado para os 13 itens de suporte que este Todo vai alterar e aprovado; o julgamento errado de A10 do Subagent é revogado e ligado à escolha já decidida do Todo 97, deixando de ser listado como item pendente de discussão ou implementação.
- [x] Preservação dos campos antigos em Off-Peak / Wiki, verificando que o valor antigo é mantido e não ressuscita uma escolha já limpa na nova versão.
- [x] Correção do identificador de origem de 6.12, remoção de sourceRevision e renomeação de registryRevision; a entrega de origem do Source/Registry de arquivos reais e do Worker construído de verdade e a requisição precisa de modelo passaram.
- [x] Organizar os tipos de dados duplicados da seção 7 pelo princípio da seção 1.1, reutilizando o schema e mantendo a dependência unidirecional; inclui os tipos de conexão de conta, com os campos de runtime inalterados.
- [x] Implementar os campos, modos e estruturas das seções 3, 5 e 6, com o schema, a serialização, os consumidores e a verificação de lote correspondentes; manter a camada de api e não implementar as sugestões retiradas ou puladas.
- [ ] Concluir a aceitação de implementação de 6.15: instalação nova e atualização do staging convergindo para o formato final, verificando inicializações repetidas, rollback de distribuição e troca de origem; sem adicionar migração para formatos intermediários não publicados.

A implementação posterior segue as convenções de spec / testes do repositório; só depois de realmente implementar e verificar é que a descrição vigente do Design V2 e o status deste Todo são sincronizados. Esta rodada registra apenas decisões e não cria diretamente versões de migração, campos OAuth, uma especificação global de nomenclatura ou uma nova reestruturação arquitetural; defaultModelSelection já está confirmado conforme 6.9, mas ainda precisa chegar ao código de produto depois que o usuário autorizar a implementação.

Esta entrega consiste apenas em documentação e índice de pontos de entrada; a revisão de design com escopo limitado desta rodada foi fechada, e as renomeações de campo, os ajustes de lógica de execução e a verificação de lançamento ainda não foram concluídos.

Verificação do primeiro registro em disco: a atualidade da linha de base, as 13 referências locais da época, o formato deste documento, `git diff --check`, o `pnpm typecheck` da raiz e o `pnpm lint` passaram (o lint com 39 avisos preexistentes e 0 erros). O registro em disco não envolve modificação de código de produto e nenhum teste de comportamento de produto foi adicionado ou executado.

Fechamento completo registrado em disco em 2026-09-09: apenas este documento e os dois índices de entrada foram atualizados; atualidade da linha de base, três formatos de documento, 150 referências locais, git diff --check, pnpm typecheck e pnpm lint passaram (39 avisos preexistentes, 0 erros). Os 66 testes existentes da verificação direcionada das restrições por origem passaram; desta vez não foi adicionado código de produto nem executado de novo teste de produto.

Revisão completa da documentação em 2026-09-09: esclarecidos o parse / a serialização correspondentes às decisões existentes, a leitura e escrita da fusão, os limites de migração e de rollback; apenas este documento foi modificado, sem mudança de implementação de produto. Atualidade da linha de base, o formato deste documento, 60 referências locais, git diff --check, pnpm typecheck e pnpm lint passaram (39 avisos preexistentes, 0 erros), sem novos testes de produto ou nova execução de testes de produto.

Reavaliação de verificabilidade em 2026-09-09: restaurada a fusão da seleção padrão, corrigido o registro errado dos arquivos de Bot, atualizados este documento e os dois índices. Atualidade da linha de base, três formatos de documento, 157 referências locais, git diff --check, pnpm typecheck e pnpm lint passaram (39 avisos preexistentes, 0 erros). Apenas a forma de cobertura dos testes existentes foi conferida, sem executar a verificação de produto do alvo futuro e sem alterar o código de produto.
