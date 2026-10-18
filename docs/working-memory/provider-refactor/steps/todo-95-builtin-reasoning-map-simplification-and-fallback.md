# Todo 95: embelezamento equivalente e reforço do fallback do Reasoning Map dedicado

> Adjudicação posterior de 2026-09-12: [Todo138](./todo-138-reasoning-level-ui-and-api-defaults.md) mudou os níveis genéricos de Model para disabled/enabled, e os três maps genéricos de API ganharam `enabled → high`; isso substitui a restrição deste documento de "não adicionar `enabled → high`". O map dedicado, a cobertura pessoal e a hierarquia de regras mantêm a semântica original. O restante deste conteúdo é preservado como registro de implementação da época.


> Status: A/B/C concluídos e fechados, atualização de 2026-09-09. O unificação dos níveis de desligamento e o mapeamento de melhor esforço dos Selections antigos foram implementados; não há compatibilidade para configurações Personal que nunca foram publicadas. A regressão de layout também foi corrigida pelo Todo98. Todas as pendências de teste restantes e as promoções manuais são acompanhadas apenas em [Todo102](todo-102-verification-debt-closeout.md). Evidência histórica em [registro de execução](../research/todo94-97-execution-and-review.md).
> Princípio geral: **embelezar o Reasoning Map dedicado que já existe para os modelos e reforçar o Reasoning Map de fallback. As regras dedicadas existentes recebem apenas embelezamento equivalente, sem mudar o comportamento do modelo.** A padronização dos nomes de nível desligado e a compatibilidade dos Selections históricos é uma alteração separada e não é misturada ao "embelezamento".

## 1. Três frentes de trabalho e fronteiras

| Frente de trabalho | Pode mudar | Precisa manter |
| --- | --- | --- |
| A: embelezamento do Map dedicado | estrutura da expressão, ramos duplicados, posição das condições | o campo final de request, o valor e a semântica de omissão/remoção para cada entrada legal, o modo e o orçamento |
| B: reforço do Map de fallback | fornecer um mapeamento utilizável de campos de raciocínio genéricos por API Schema | a capacidade de cobertura das regras dedicadas, a cobertura Personal, a validação de seleção de modelo e a autoridade do limite de saída |
| C: padronização do nível desligado | unificar o nome desligado não nativo da API o máximo possível para `disabled`, com compatibilidade para as seleções antigas afetadas | a semântica desligada das seleções antigas, os níveis/Map personalizados do usuário, as fronteiras de salvamento de cada negócio |

- Não ajustar o escopo de correspondência de modelos das regras dedicadas, as regras de prefixo/sufixo, o escopo de site, a prioridade ou outras capacidades de modelo. Não substituir todos os Maps dedicados por um Map genérico misto.
- Não alterar IDs de modelo, não criar novos caminhos de execução com caso especial por Provider e não expandir a linguagem de expressão para conseguir código mais curto.
- Não modificar o Active Model em execução, o histórico, o Off-Peak Ticket ou a migração de conexão de conta.
- O orçamento de saída do Wiki pertence uniformemente ao [Todo 94](todo-94-wiki-model-output-limit.md) e não faz parte da implementação deste item.

## 2. Fatos atuais e princípios de expressão

A configuração principal está em `config/provider/zcode-builtin.json`. Atualmente as regras de modelo genéricas declaram apenas `disabled`, e o Reasoning Map é `{}`; as regras de fallback por API Schema já têm mapeamento de limite de saída, mas falta o mapeamento de raciocínio discutido aqui. Nas regras dedicadas existem ramos que retornam a mesma string por nível e ramos que constroem repetidamente o mesmo objeto.

1. `values` declara os níveis legais, e a camada de validação unificada rejeita níveis ilegais; o Map só converte entradas legais em campos de request.
2. Nomes iguais passam direto, sem escrever ternários de enumeração do tipo `low → low / high → high / max → max`.
3. As condições descem o máximo possível para o campo que realmente muda; o branch externo só é mantido quando a existência do campo ou a estrutura do objeto é realmente diferente.
4. Não usar um `else` final para transformar entrada desconhecida secretamente no nível mais alto, em desligado ou em outro nível padrão.
5. Não trocar campo omitido por `null` por brevidade: aqui é usado JSON Merge Patch, onde `null` significa remoção e não pode ser tratado como omissão.
6. Não eliminar mecanicamente todos os ternários; semântica clara e request equivalente têm prioridade sobre contagem de caracteres.

Por exemplo, como os níveis legais já correspondem diretamente ao effort da API, a expressão pode ser simplificada para:

```text
{"reasoning":{"effort":reasoningLevel}}
```

Mas quando o valor original é `off/enabled`, não se pode passar `reasoningLevel` direto para um `thinking.type` que só aceita `disabled/enabled`. A mudança de nome precisa ser tratada antes pela frente C; o embelezamento não pode mascarar essa diferença.

## 3. Reforço do fallback: camadas de configuração e objetivo

Quando o usuário adiciona um modelo desconhecido e informa apenas os níveis de raciocínio que ele suporta, o objetivo é que ele consiga usar diretamente o Map de fallback da camada de API Schema, sem precisar escrever uma expressão antes.

```text
Configuração padrão do modelo genérico
      |
      v
Map de fallback por API Schema
      |
      v
Regras existentes mais específicas de modelo / site / template etc. (mantendo a ordem de mesclagem atual)
      |
      v
Cobertura da configuração Personal
      |
      v
Validação dos values efetivos -> Option Map -> request final
```

- Com base na implementação de camadas existente do [Todo 76](todo-76-builtin-provider-config-layering-and-site-rules.md), sem criar outro sistema de mapeamento em runtime.
- Os `values` genéricos permanecem conservadores, e o reforço do Map não declara que todos os modelos desconhecidos suportam `low/high/max`. Quem declara os níveis suportados é o usuário ou uma configuração mais específica.
- O Map dedicado continua prevalecendo sobre o fallback; Map Personal explícito e a configuração completa com a "configuração inteligente" desligada não são reescritos automaticamente.
- Não se promete que qualquer nível inventado pelo usuário seja entendido pela API; a passagem direta é apenas uma forma de organizar o request, e não uma detecção de capacidade.
- O código abaixo são expressões CEL restritas planejadas, que devem passar pelo compilador existente e pelos testes de request final na implementação.

### 3.1 Chat Completions: fallback misto de compatibilidade máxima

Adotando a premissa de compatibilidade aceita pelo usuário, carrega-se simultaneamente os campos de controle comuns a vários protocolos e com semântica consistente:

```text
{
  "thinking": {
    "type": reasoningLevel == "disabled" || reasoningLevel == "none"
      ? "disabled" : "enabled"
  },
  "enable_thinking": reasoningLevel != "disabled" && reasoningLevel != "none",
  "reasoning_effort": reasoningLevel == "disabled" ? "none" : reasoningLevel,
  "reasoning": {
    "effort": reasoningLevel == "disabled" ? "none" : reasoningLevel
  }
}
```

- `thinking.type` cobre formas de chave de pensamento como a da Zhipu; `reasoning_effort` cobre a forma de parâmetro das interfaces OpenAI; `enable_thinking` cobre a forma de parâmetro das interfaces Qwen/SiliconFlow; `reasoning.effort` cobre a forma de parâmetro das interfaces OpenRouter.
- `disabled` e o `none` nativo ambos expressam desligamento, e não pode haver contradição de uma chave desligada com outra ligada; outros efforts concretos e legais passam direto.
- Não incluir orçamento, `reasoning.exclude`, `reasoning_split`, `chat_template_kwargs` nem outros campos de semântica diferente ou privados de um site.
- Não adicionar mapeamento implícito novo `enabled → high/max`; modelos apenas com chave continuam tratados pelas regras dedicadas, e o fallback genérico não declara suporte a qualquer nível.

**Premissas aceitas e seus limites exatos:**

1. O servidor ignora campos extras que não reconhece.
2. O servidor aceita múltiplos campos de controle duplicados e semanticamente consistentes, sem rejeitar o request pela própria combinação.
3. Para serviços que controlam o desligamento por `thinking.type`, **na premissa de `type=disabled`**, o effort extra em excesso deixa de se aplicar e pode ser ignorado, ou a interface aceita `none`. Isso não é a premissa de que `none` também é aceito quando o pensamento está ligado.
4. Para serviços que controlam por effort, `none` significa desligamento, e a chave de pensamento extra pode ser ignorada.

Este é um fallback "baseado em premissas, buscando compatibilidade", e não uma garantia sem perdas para todos os sites compatíveis. Mesmo um servidor estrito pode validar e rejeitar um valor ilegal de campo conhecido ao receber a chave de desligamento; campos desconhecidos também podem ser rejeitados estritamente. Diferenças conhecidas são tratadas por regras dedicadas; situações desconhecidas reportam erro normalmente, sem remover campos e tentar de novo, trocar de nível ou mudar de modelo automaticamente.

### 3.2 Anthropic Messages: desligado ou Adaptive

```text
reasoningLevel == "disabled"
  ? {"thinking":{"type":"disabled"}}
  : {
      "thinking":{"type":"adaptive"},
      "output_config":{"effort":reasoningLevel}
    }
```

- Este fallback não se adapta ao modo manual `enabled` + `budget_tokens`; o effort concreto é entregue diretamente ao Adaptive.
- O ramo `enabled` discutido, o orçamento de 12.800 e a ideia de sobrescrever a saída máxima em paralelo foram removidos e **não são implementados**.
- Essa remoção vale apenas para o fallback: o `enabled` e o modo de orçamento dos modelos dedicados existentes mantêm o comportamento original.
- Não se pode garantir suporte a Adaptive/effort apenas pelo API Schema do Anthropic; quem não suportar usa configuração dedicada, e o modo não é trocado automaticamente.

### 3.3 Responses: manter a própria estrutura de campos

```text
{"reasoning":{"effort":reasoningLevel == "disabled" ? "none" : reasoningLevel}}
```

Usa-se apenas a estrutura de effort de Responses; valores legais nativos como `none` são mantidos, e não se copia o conjunto de quatro campos de Chat Completions.

### 3.4 Impacto no limite de saída e no desligamento padrão

- O Reasoning Map não escreve campos de saída máxima como `max_tokens` ou `max_output_tokens`; o Option Map de maxOutputTokens existente continua responsável de forma independente. Não contornar a validação de conflito de múltiplos Maps.
- Enquanto o modelo genérico só tem `disabled`, o novo fallback também emite os campos explícitos de desligamento acima, o que difere do `{}` original. Essa é a mudança real de comportamento deste reforço e precisa entrar nos testes de compatibilidade e no registro de riscos.
- Não adicionar silenciosamente um segundo conjunto de regras dinâmicas do tipo "trocar de Map conforme os values aumentam" para mascarar essa mudança; se a medição exigir mudar a política de desligamento, registrar a evidência e adjudicar novamente.

## 4. Nome do nível desligado e compatibilidade das seleções históricas

O objetivo é organizar os nomes de desligamento inventados pelo próprio projeto, como `off/nothink`, e não reescrever uniformemente os valores de todos os fabricantes. O `none` nativo que é apenas transmitido pode ser mantido; nem todos os `disable` que os usuários mencionam oralmente existem de fato, e a lista de configuração é a autoridade na implementação.

```text
Selection persistida original / rascunho atual do usuário
                 |
                 v
Configuração efetiva do Host alvo e resolução unificada da seleção
                 |
       O nível original ainda é legal？ -- 是 --> 原样保留
                 |
                 否
                 v
A tabela de renomeação explícita das regras afetadas foi atingida e o nível alvo é suportado？
       | 是                          | 否
       v                             v
临时 effective 档位              现有失效处理，不猜最高档
       |
       v
业务原有成功提交 / 显式保存边界（不是读取时写回）
```

- A tabela de renomeação precisa estar ligada às regras/-fontes Built-in afetadas, sem substituir globalmente qualquer `off/none/disable` por `disabled` e sem adivinhar por fragmentos do nome do modelo.
- Valor original tem prioridade: um `off` explicitamente mantido pelo usuário e ainda legal não é migrado; o `none` nativo não é migrado; valores desconhecidos não são adivinhados.
- Cada renomeação valida que "entrada antiga + Map antigo" e "entrada nova + Map novo" produzem o mesmo request, em vez de exigir que o literal da entrada seja idêntico.
- Reaproveitar a resolução de seleção válida e a notificação de mudança do [Todo 87](todo-87-selection-view-unified-resolution.md). A leitura devolve um resultado temporário e não sobrescreve a intenção persistente; as configurações de longa duração da tarefa continuam sendo atualizadas pela fronteira de salvamento explícito original, e o run atual pode congelar o resultado já resolvido.
- Não adicionar versão de armazenamento, não reescrever o histórico em massa, não modificar o Markdown de Subagent do usuário e não analisar nem reescrever expressões de Map do usuário.
- **Limite de compatibilidade mais recente:** não há compatibilidade para configurações Personal que nunca foram publicadas, não se reescrevem automaticamente Maps pessoais antigos e não se adiciona migração para esse formato intermediário. Os values/Map explícitos e formais atuais continuam valendo pelas regras de cobertura; a renomeação do Selection antigo só acontece quando o valor original é ilegal, atinge explicitamente uma fonte afetada e o alvo é suportado, preservando a intenção original e as fronteiras de salvamento já estabelecidas.
- O Subagent explícito já foi conectado pelo Todo99 à resolução comum local do Worker; C deve reutilizar essa entrada para validar o mapeamento de nível puro e não deve mais tratar a ausência de RPC do Host como bloqueio. Modelo não especificado e override interno permanecem congelados, sem usar a renomeação para estender o protocolo ou mudar a semântica de herança.
- O Provider e o Ticket originais do Off-Peak permanecem inalterados, e a compatibilidade de nível puro não pode reautorizar troca entre contas.

## 5. Superfície de impacto e autoridade única

### Registro de execução de C: migração de nível desligado limitada por fonte

- A lista de renomeação deste ciclo tem 25 `modelRules`: 24 `off` e 1 `nothink`; `none` e `enabled` não mudam. A lista guarda o seletor antigo da regra e o valor desligado antigo, e não guarda uma segunda configuração completa de modelo.
- A Facade unificada do Node constrói a projeção do domínio de valores antigo a partir do mesmo snapshot já aplicado: o valor desligado antigo só é restaurado para regras Built-in exatamente iguais às da lista, e o casamento de regras e a ordem de cobertura continuam reutilizando `ModelConfigRules.resolve`. Portanto não é adivinhação por fragmento de nome de modelo, e um domínio de valores antigo que foi sobrescrito por uma regra posterior não volta a valer.
- O alias só é tentado quando o nível original é ilegal, e o novo nível passa pela validação existente. Values/Map de raciocínio Personal explícitos ou configuração fixa não participam da inferência; um valor original ainda legal é mantido diretamente. Essa restrição não é compatibilidade de configuração não publicada, e sim evitar que valores personalizados do usuário sejam confundidos com valores internos antigos.
- Host e Worker compartilham a Facade do Node; a seleção padrão da configuração também passa pela mesma normalização de nível puro. O Registry/Factory final mantém a validação exata, sem novos aliases.
- Aceitação em camadas: equivalência com o request real das 25 regras da lista, testes somente leitura de fonte/cobertura da Facade comum e regressão nas entradas reais de Composer/tarefa. Requisições em execução, herança implícita e Ticket não ganham reanálise; a dívida histórica de verificação do 102 não está no escopo desta rodada.
- Complemento da revisão de todas as regras/APIs: equivalência de request do Map dedicado antes e depois da renomeação; para as combinações que herdam o fallback genérico, corrigiu-se o descompasso temporário deixado pela implementação em etapas separadas de A/B e C. Por exemplo, o `off` do GLM Chat chegou a ser transmitido como effort ligado pelo novo fallback e, após a unificação, entra corretamente no ramo desligado; o `off/nothink` antigo de Responses passou a transmitir `none`. Isso é o fechamento da semântica de desligamento do fallback já adjudicada, não a preservação dessas requisições intermediárias erradas, e também não se afirma que todas as requisições de fallback sejam byte a byte equivalentes. Os níveis ligados e os orçamentos dedicados mantêm os valores originais.

Este item trata de semântica de configuração/request e de compatibilidade limitada de seleção, e não é um redesenho de UI. O levantamento de fronteiras usou os nós model-capabilities e model-selection do mapa de funcionalidades existente; como não há codegraph disponível no ambiente atual, a leitura direcionada de configuração e dos arquivos-semente conhecidos foi usada como alternativa, sem afirmar que a auditoria completa do grafo de chamadas foi concluída.

| Prioridade / entrada | Fronteira comum e o que verificar | Fronteira de commit / salvamento |
| --- | --- | --- |
| Obrigatório: Built-in / Resolver | `zcode-builtin.json`, `packages/provider/src/resolver.ts`; hierarquia de regras, fontes e cobertura dedicada | a configuração Personal não é reescrita por causa do carregamento |
| Obrigatório: compilação e request | `packages/model-option-map/src/`, `model-option-map-fetch.ts` do Agent; compilação, Merge Patch e conflito com o Map de saída | a validação e o request do Model final continuam sendo a autoridade |
| Obrigatório: resolução compartilhada de seleção | `packages/provider/src/effective-model-selection.ts`, validação do Registry | distinguir o effective temporário da intenção persistente |
| Obrigatório: adicionar/editar modelo | rascunho de modelo compartilhado, `useModelSelectionView`; só adicionar níveis pode herdar o fallback, e Map explícito/configuração fixa permanecem | o Personal é escrito quando o usuário salva; a semântica da chave de configuração inteligente não muda |
| Obrigatório: Composer / sessão | View e rascunho compartilhados; resolução de níveis antigos e legalidade da nova seleção | fronteira original de sucesso de envio/salvamento explícito da seleção, sem modificar o Model em execução |
| Recomendado: tarefas agendadas / Bot / Wiki | entradas que reaproveitam a resolução, e se exibição e execução são consistentes | as fronteiras explícitas de salvamento e congelamento de execução de cada um, sem reescrever registros em massa |
| Condicionalmente obrigatório: Subagent / Off-Peak | se burlam a resolução do Host, e qual é o travamento de identidade e execução | conforme as restrições da seção 4, sem alterar Markdown/Ticket |
| Invariantes: Desktop/Web, Local/Remote | usam a configuração do Host alvo, sem alternativa local nem sincronização forçada antes do envio | isolamento por workspaceIdentity; continuous/replayable não muda |

## 6. Ordem de execução e aceitação

1. Completar primeiro a lista de regras: posição da regra, API Schema, escopo de site/modelo, values efetivos, Map antigo, Map novo proposto e frente de trabalho A/B/C. Registrar os riscos de renomeação e de cobertura Personal, sem substituir prova de cobertura por número de testes.
2. Atualizar os contratos que de fato mudam nas specs existentes de Model Option Map / configuração Built-in / Selection, e só então escrever os testes antes de mudar a implementação. Uma spec existente não pode ser reescrita pela linguagem de "reforço do fallback" como se o comportamento dedicado tivesse mudado.
3. Map dedicado: cobrir todos os níveis legais um a um; para regras equivalentes é possível parametrizar e reutilizar casos, mas nenhuma regra de site pode ficar de fora. Comparar o JSON final do request mesclado, incluindo campos ausentes, null, objeto vazio, orçamento e campos de saída máxima.
4. Fallback: validar desligamento/none nativo/efforts concretos no Chat, desligamento/Adaptive no Messages e desligamento/effort no Responses; nos testes, adicionar modelos desconhecidos que só mudam values, cobertura por modelos dedicados conhecidos, Map Personal e configuração inteligente desligada. Valores ilegais continuam falhando na camada de validação unificada.
5. Compatibilidade: validar que o valor original legal tem prioridade, o mapeamento de valores antigos afetados acontece, valores desconhecidos não são adivinhados, as combinações de cobertura Personal funcionam, a leitura não grava em disco e runs existentes não mudam; cobrir os consumidores reais e não apenas uma função pura.
6. E2E de interação: em um MacBook Pro, com fixture/mock isolado, validar o request ao adicionar um modelo alterando apenas os níveis, a exibição/submissão das seleções antigas e o fato de a configuração pessoal não ser sobrescrita; cobrir entradas como tarefas agendadas conforme a alteração real. Capturar o request final, sem substituir por snapshot de expressão. Não depender de resgate com conta real nem de consumo real de cota.
7. Executar `pnpm typecheck`, `pnpm lint`, os testes unitários relacionados e os E2E. Como a implementação envolve Agent/UI, ler antes os AGENTS/DESIGN e as habilidades de teste correspondentes; registrar falhas de ambiente e falhas de produto, sem escrever "não executado" como "passou".
8. Revisar a diferença por último: requests dedicados legais equivalentes; apenas o fallback e a renomeação explícita são mudanças de semântica; sem override de orçamento, retry silencioso, sincronização extra ou efeito colateral de persistência. Registrar a evidência de verificação por frente de trabalho e só então fazer o commit.

## 7. Tabela de registro de execução

| Item | Status | Evidência / o que ainda precisa ser complementado |
| --- | --- | --- |
| Conclusões da discussão e três frentes de trabalho | Implementado | Este Todo |
| Lista completa de regras dedicadas e baseline de equivalência | A concluído | `reasoning-map-before-todo95.json` com 19 tipos de expressão, índice/escopo por regra; comparação do request Merge Patch final para cada nível legal, incluindo campos já existentes e o orçamento |
| Mapeamentos de fallback das três APIs | B concluído | modelo desconhecido alterando apenas values, cobertura por Map Personal, rejeição de nível ilegal; request de Model real no Pro validando Chat high |
| Renomeação de nível desligado e combinação com Personal | C concluído | 25 regras renomeadas; prioridade do valor original legal, cobertura pela regra específica, rejeição de valor desconhecido e leitura somente da intenção original validados por testes reais da Facade Built-in; sem compatibilidade para configuração não publicada |
| Compatibilidade de cada consumidor (incluindo fronteira de Subagent) | C concluído | Facade do Node compartilhada por Host/Worker; execução real de Composer/tarefa, 33 regressões de Wiki/Bot/UI, 9 regressões de Subagent explícito; execução congelada, herança e Ticket não ganham reanálise |
| Tipos/Lint/testes unitários/E2E no Pro | A/B/C verificados | C: 352 testes de Provider / provider-node / Option Map passando; typecheck e lint de todo o repositório passando. Pro `desktop-e2e-20260909-121842-573`: R95C-01, SR87-01, SR87-06, 3/3 passando; pending não é promovido automaticamente |
| Segunda revisão e fechamento | A/B/C concluídos | C alterou apenas revision, 25 valores, 10 literais de desligamento em Maps e a resolução comum; requests dedicados equivalentes e o descompasso temporário de nomes antigos no fallback corrigido conforme a semântica de desligamento. Sem override de orçamento, sincronização antes do envio, alias na camada de request ou substituição silenciosa |

### Precorreções de execução real e de teste de C

- R95C-01 valida que um rascunho histórico `nothink` é exibido como `disabled` após o recarregamento, que a edição do texto ainda preserva o valor histórico e que o novo valor só é salvo depois do envio; captura o request de modelo real com `thinking.type=disabled`, sem effort incorreto anexado.
- A primeira execução falha foi localizada como uma corrida de precondição do teste: ao alterar o localStorage diretamente, o `beforeunload` da página antiga regravava o rascunho em memória por cima da seleção histórica injetada. Logs temporários provaram que a primeira leitura da nova página já era `disabled`, e não que a nova resolução tivesse corrompido o estado persistente.
- O caso injeta o registro antigo no `pagehide` (depois do salvamento de saída) e só então recarrega; o diagnóstico temporário foi removido e o mecanismo de salvamento de produção do Composer não foi modificado. Depois da correção, todo o grupo passou. O dispositivo real com celular＋SSH e as outras pendências históricas continuam no Todo102, sem usar este item para fingir aprovação em todos os clientes.

## 8. Base da discussão e referências

- Baseline de arquitetura: [Model Option Map](../design/model/model-option-map.md), [Selection State](../design/interaction/selection-state.md), Todo 76 / 87; a interação de configuração inteligente segue o [Todo 92](todo-92-model-smart-config-and-override-feedback.md).
- Material de protocolo: [modo de pensamento da Zhipu](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode), [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/), [interface compatível com OpenAI da Qwen](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions), [OpenRouter Reasoning](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [Anthropic Extended Thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking), [Anthropic Effort](https://platform.claude.com/docs/en/build-with-claude/effort).
- Esse material serve para explicar a origem de cada campo e não prova que campos mistos sejam aceitos por todos os servidores; as premisas e limitações reais de compatibilidade são as da seção 3. Se uma diferença de protocolo for encontrada na implementação, não se pode mudar silenciosamente o comportamento de modelos dedicados existentes com base no material mais recente.