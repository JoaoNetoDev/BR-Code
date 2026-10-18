# Design do Registro de Permissões de Comandos Bash

## Contexto

Atualmente, o "sempre permitir" de Bash em nível de projeto grava o `input.command` completo como permission rule. Mesmo que a regra use o sufixo `:*`, a correspondência ocorre sobre a string original, o que não permite reutilizar de forma estável a ação comum entre `pnpm run lint --fix` e `pnpm run lint --reporter=dot`, e ainda pode fazer com que `npm run:*` cubra indevidamente `npm run test && rm -rf ...`.

Este design distingue dois registries independentes, sem confundir suas responsabilidades:

- command prefix registry: fornece as formas de argumentos de comandos, subcomandos e options a partir dos specs do `@withfig/autocomplete` e dos overrides embutidos, usado para encontrar prefixos de ação estáveis;
- política Bash somente-leitura: decide se uma invocation pode ter liberação automática somente-leitura, continuando a cargo da política Bash data-driven já existente do ZCode.

O prefix registry não pode transformar um comando em somente-leitura; o registry somente-leitura também não pode decidir o escopo de autorização persistida.

## Objetivos e não objetivos

Objetivos:

- elevar a autorização Bash de nível de projeto, do comando completo em string, para um command prefix estável e consciente de AST;
- julgar separadamente cada invocation de um compound command que precise de aprovação, sem poder executar comandos adicionais sob o pretexto de um prefixo já autorizado;
- tornar a suggestion um fato durável de permissão, com exibição consistente em desktop, replay em celular, recuperação após refresh e TUI;
- reutilizar o JSON de `permission/ruleset` e o `PermissionRuleValue`, sem nova migração SQL;
- preservar compatibilidade de leitura das regras antigas exact, `:*`, wildcard e tool-only, sem ampliação em lote de permissões.

Não objetivos:

- não usar LLM para extrair prefixos;
- não adicionar escopo de permissão de session/global;
- não fornecer página de gestão de regras de permissão nem input de pattern editável;
- não trazer o pacote Fig ou seus specs para o runtime do CLI;
- nesta rodada não implementar E2E de rede real no celular nem alterar a fronteira entre desktop continuous e mobile replayable.

## Fluxo de dados geral

```text
build/dev only
@withfig/autocomplete@2.692.3
        |
        v
deterministic generator ---> compact generated registry ---> zcode.cjs / SEA
                                  |
runtime                           v
Bash input ---> unbash AST ---> permission rule policy
                                  | evaluator + suggestions
                                  v
PermissionService ---> permission.requested durable event
                                  |
              +-------------------+--------------------+
              |                   |                    |
              v                   v                    v
 desktop-continuous       web-remote-replayable   TUI approval
 PermissionDialog         snapshot / gap restore  read-only scopes
              |                   |                    |
              +-------------------+--------------------+
                                  |
                                  v
                    option.response.permissionUpdates
                                  |
                                  v
              local_setting(permission/ruleset JSON)
```

relay, desktop main, host bridge e UI apenas repassam ou exibem a suggestion, sem reparsear o Bash. O `/remote` do celular continua se anexando ao shared host já existente do desktop; o permission snapshot permanece mantido pelo runtime do host, sem afundar o estado de negócio para o relay/main e sem entrelaçar a recuperação replayable no fluxo principal do desktop continuous.

## Registry de Build

### Entradas e saídas

A fase de geração fixa exatamente `@withfig/autocomplete@2.692.3`. O generator percorre os specs da raiz Fig e mantém apenas:

- nomes e aliases de comandos/subcomandos;
- se a option consome argumento;
- `isCommand`, `isModule`, `isVariadic`, `isOptional`, `isDangerous` do argument;
- informações de template de path de file/folder.

O artefato gerado usa codificação compacta por tuple/campos curtos, com ordenação estável e sem timestamps; o cabeçalho registra a versão do Fig, o hash do conteúdo de entrada, estatísticas de items ignorados e a atribuição ISC. `registry:check` regenera em um diretório temporário e compara byte a byte, além de verificar que o artefato não comprimido não excede 3 MiB. O bundle do CLI, o desktop-agent e os testes de SEA devem provar que o runtime não lê arquivos do pacote Fig.

A policy embutida completa os specs de wrappers, as restrições recursivas e os overrides de profundidade, incluindo fronteiras de ação como `git push`, `docker`, `kubectl`, `aws`, `az` e `gcloud` que não podem ser derivadas só pela profundidade dos specs genéricos.

### Resolver de prefixos

O resolver reutiliza a AST do `unbash` e não faz adivinhação de tokens de shell sobre a string bruta:

1. Só processa invocations enumeráveis com segurança; em caso de falha de parsing, redirect, command/process substitution, subshell, função, loop, condição, case, here-doc ou nó dinâmico desconhecido, há fallback para exact da string inteira.
2. Opções globais conhecidas são puladas pelo registry, junto de seus argumentos, antes de buscar subcomandos; path, URL e argumentos de arquivo comuns não entram no prefixo.
3. Wrappers têm no máximo duas camadas e a profundidade total de parsing recursivo é de no máximo dez níveis. O prefixo salvo mantém o wrapper e o token de executable original do usuário; apenas o lookup no registry pode usar o basename, e um caminho absoluto não pode ser silenciosamente ampliado por unificação.
4. Atribuições estáticas de env só são mantidas quando nome e valor podem ser provados sem ambiguidade; atribuições dinâmicas ou desconhecidas caem para exact.
5. Interpretadores de shell e comandos de alto risco, como remoção ou alteração de permissões, caem para exact quando não têm fronteira de ação estável.
6. Qualquer token de prefixo que contenha espaço em branco ou não possa ser serializado sem ambiguidade cai para exact.

O prefixo estável continua sendo gravado como `ruleContent: "<prefix>:*"`. O exact salva o comando bruto completo após trim. Compound commands salvam várias rules independentes, sem mesclar o prefixo comum mais longo, com no máximo cinco; acima do limite, há fallback para exact da string inteira. Invocations já liberadas automaticamente pela policy somente-leitura não geram rule persistente redundante.

## Policy de Regras de Permissão

`ToolEntry` ganha um `resolvePermissionRulePolicy(input, runtimeContext)` opcional, que retorna:

- um evaluator para o conjunto completo de regras allow/ask/deny;
- `PermissionUpdate[]` de sugestão de liberação em nível de projeto para esta execução.

`PermissionService` continua agnostico à ferramenta. Ferramentas sem evaluator customizado seguem a lógica exact/wildcard; o evaluator de Bash verifica primeiro o exact bruto completo e depois, quando a AST é segura, faz correspondência de prefix/wildcard com fronteira de token por invocation.

```text
ruleset priority
  deny: any required invocation matched -> deny
   ask: any required invocation matched -> ask
  plan: existing plan-mode precedence
 allow: every required invocation covered -> allow
  else: ask
```

Invariantes de segurança:

- `npm run:*` pode casar com uma única invocation `npm run test --watch`, mas não pode engolir `npm run test && rm -rf ...`;
- múltiplas regras allow podem cobrir em conjunto várias invocations de um compound; faltando uma, ainda é preciso perguntar;
- qualquer invocation deny/ask atingida já vale;
- uma invocation somente-leitura é considerada coberta, mas não gera suggestion;
- quando a AST é insegura, prefix/wildcard não participam da liberação, e o exact bruto completo ainda pode casar;
- rules históricas tool-only mantêm a semântica original de autorização para todas as ferramentas;
- a precedência do plan-mode não muda por causa do evaluator de Bash.

## Suggestion durável e protocolo

`suggestedPermissionUpdates?: PermissionUpdate[]` é adicionado a:

- `PermissionBrokerRequest`;
- `PermissionRequestedPayload`;
- `PendingPermission`.

A suggestion é calculada antes de entrar no broker e gravada junto com o durable event `permission.requested`. A option de permissão v4 ganha uma `response` bruta opcional; novos snapshots carregam a response allow-project como está, e snapshots antigos sem `response` continuam mapeando allow/deny pelo tipo de option e gerando uma suggestion exact para requests Bash pendentes antigas. `buildProtocolPermissionOptions`, desktop e TUI não deduzem mais regras por conta própria a partir do input.

## Armazenamento e compatibilidade histórica

Sem tabelas novas, sem upgrade de migração SQL e sem modificar `local_setting.schema_version`:

- continua-se gravando JSON com `namespace=permission` e `key=ruleset` no escopo de projeto;
- `PermissionRuleValue` mantém `toolName + ruleContent`;
- a versão do ruleset mantém o valor atual;
- os exact antigos são preservados como estão e têm prioridade pelo match do bruto completo;
- `:*` antigos e wildcards passam a usar o evaluator AST-safe para Bash, em vez de `startsWith` bruto em compound;
- rules tool-only mantêm a semântica histórica;
- o ruleset só é reescrito pelo caminho existente quando o usuário adiciona uma autorização, sem migração em lote e sem ampliar silenciosamente autorizações históricas;
- o resultado existente de `0003_backfill_permission_local_setting` não é reescrito.

## UI e TUI

O `PermissionDialog` do desktop exibe, em modo somente leitura sob a opção "Sempre permitir neste projeto", de uma a cinco scopes de prefixo:

- prefixo: usar `pnpm run lint …` substitui diretamente o texto auxiliar "não perguntar novamente pelo mesmo comando", sem exibir um rótulo extra "prefixo de comando" nem um container com borda; múltiplos prefixos são exibidos linha a linha, e tanto tela estreita quanto texto contínuo muito longo quebram de forma natural;
- exact: não repetir dentro da opção de autorização o cartão "apenas este comando"; o comando real é exibido pela prévia da ferramenta acima, e o `ruleContent` completo é mantido apenas na response da option, para resposta e persistência, sem entrar no DOM de scope, no `title` nem em textos de ARIA;
- compound: múltiplos prefixos são exibidos linha a linha, sem mesclar; invocations exact não são repetidas;
- usar monospace, as cores semânticas existentes e tokens de popover/input, compatível com temas claro/escuro e largura de celular; o texto de exibição de qualquer scope individual deve ter um limite fixo de caracteres, para que here-doc, scripts inline ou conteúdo gerado não estiquem a opção de permissão.

Não se adiciona input de edição livre; preservam-se optionId, atalhos numéricos, teclas de direção e comportamento de foco. Todos os locales existentes recebem o texto de scope. O TUI exibe a mesma lista somente-leitura e devolve diretamente a suggestion carregada pela request.

## Cobertura e podas

- `BPR01`: exibição, persistência e reuso de um prefixo estável com argumentos transient diferentes;
- `BPR02`: ação sibling e cobertura parcial de compound ainda perguntam;
- `BPR03`: fallback exact para dynamic/redirect/falha de parsing;
- `BPR04`: compatibilidade com exact, `:*`, wildcard e tool-only legados e reabertura do banco;
- `BPR05`: durable event, refresh/snapshot/replay e response allow-project sem perdas;
- `BPR06`: consistência entre suggestion/response no TUI e no desktop.

O E2E de desktop formal usa um `pnpm run <script>` para representar o ciclo de usuário de BPR01/BPR02, e o caso existente de refresh-permission é estendido para representar BPR05. Compound, banco histórico, TUI e registry/build usam testes unitários ou de integração determinísticos, sem injetar estado de GUI frágil. Nesta rodada o E2E de rede real no celular é podado: o schema v4, a projection e os testes de replay snapshot provam que os campos chegam sem perdas, sem que isso permita afirmar que a cadeia de rede real do mobile shared-host está coberta.

## Logs e privacidade

Em produção, os logs só podem registrar a versão do registry, a categoria do resultado de geração e a quantidade de rules. É proibido registrar o comando original, o `ruleContent` completo ou o texto de scope; detalhes de parsing de alta frequência só podem usar o `debug` de desenvolvimento, também evitando imprimir parâmetros sensíveis.