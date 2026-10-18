# Agrupamento de ferramentas Execute

## Status de lançamento

A functionality está por padrão ligada nas configurações do usuário. O item 「分组终端命令」 (Agrupar comandos de terminal) em Settings é persistido no nível do app como `toolGroupingTerminalEnabled`; quando ausente, há o fallback `ENABLE_TERMINAL_TOOL_CALL_GROUPING=true`. Quando desligada, o Shell não somente-leitura mantém a linha de ferramenta original e independente, e a classificação, o command, output/error, o protocolo e a persistência de session não mudam.

## Resumo da Feature

| Campo                    | Valor                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Mudança                  | Agregar Shells não somente-leitura consecutivos e fazer o pai `Execute` usar limites de fase visíveis e um resumo rolável de command                           |
| Superfícies visíveis ao usuário | Itens de conversation work de desktop `desktop-continuous`, Web comum e celular `/remote` com `web-remote-replayable` |
| Comportamento existente  | Shell somente-leitura vai para `Explore`; outros Shells consecutivos são agregados em `Execute`              |
| Dono do estado           | A projeção da CLI v4 mantém o `ToolCallRow` bruto; o renderer deriva agrupamento, resumo e estado do pai      |
| Fora de escopo           | Não alterar protocolo, execução de ferramentas, permission, persistência de session, snapshot, relay/main ou runtime |

## Log de Esclarecimentos

| Rodada | Questão                | Resposta do usuário                                    | Limite fixado                                                                                                        | Seguimento necessário |
| ----- | ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1     | Escopo da primeira versão | Alterar primeiro a primeira versão                 | Agregar apenas Shells consecutivos que não foram absorvidos pelo Explore; não inclui Write/Edit/ApplyPatch          | no                   |
| 1     | Resumo pai/filho       | O pai cuida do progresso geral e das estatísticas; o filho mantém o resumo de comando individual | Em execução, o pai mostra o comando mais recente; ao terminar, mostra a contagem de comandos e de falhas/paradas | no    |
| 1     | Estado final do pai    | Referência ao Explore                                 | O pai é um contêiner de UI; falha de um item não marca o pai como failed                                          | no                   |
| 2     | Estado e resumo do pai em execução | Usar o limite de fase do Explore, e também rolagem | Enquanto estiver na cauda visível do segmento em running, permanece in_progress; em execução, rola o command mais recente; quando a fase acaba, converge imediatamente para as estatísticas finais | no |

## Decisões de Limite

| Limite      | Decisão                                                                                                                                        | Inclui                                              | Exclui / poda                                                      | Origem                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| Classificação | `identity.family === "shell"` e `isExploreToolCall(...) === false`                                                                             | Comandos de Bash/Shell/execute não somente-leitura ou fora da whitelist somente-leitura | Read/Search/Explore, Write/Edit, Agent, Todo, interação bloqueante | user + código atual        |
| Continuidade | Agregar apenas Execute consecutivos na sequência de rows atualmente visível para o usuário                                                    | reasoning oculto e não inicial pode ser atravessado | reasoning visível, Explore, texto e quaisquer outras ferramentas truncam | contrato existente do Explore |
| Estado       | Quando Execute está na cauda visível do work segment em running, o pai é `in_progress`; após um limite visível ou o estado terminal do segment, completed/stopped | intervalo do modelo depois que todos os filhos terminaram | o ciclo de vida do filho não decide mais o running do pai; erro não borbulha como failed | user + contrato de fase do Explore |
| Resumo      | Durante a fase, rola verticalmente o `Running <command>` completo; estilo alinhado ao do Explore, verbo de ação em `text-foreground-subtle` e command em `text-foreground-subtlest`; `·` fixo entre `Execute` e o resumo; ao fim da fase, mostra as estatísticas imediatamente | `Execute · Running <command>`、`Execute · N 个命令` | stdout/stderr e erros específicos ficam só nos filhos; não reproduz commands antigos no estado terminal | user |
| Permission  | O diálogo de permission continua renderizando um único Execute                                                                              | agregação de conversation work item                 | não agregar identidade de aprovação                                   | invariante de arquitetura  |
| Título do grupo | O grupo pai usa o nome de categoria multiplataforma `Terminal` / `终端`                                                                    | PowerShell, cmd.exe, Git Bash, WSL, Unix shell       | não se refere ao aplicativo Windows Terminal; o texto da ferramenta filha de Execute não muda | user |

## Fluxo de Estado e Eventos

```text
ToolCallRow(shell)
        |
        +-- nonterminal + command absent --> defer render
        |
        `-- command classifiable
                 |
                 +-- readonly/explore --> Explore group
                 |
                 `-- other shell ------> Execute group
                                                |
                                  append while next visible row
                                  is also Execute-compatible

Execute parent status
        |
        +-- visible group tail + segment running ------> in_progress
        +-- visible boundary / segment terminal
        |       `-- any cancelled ---------------------> stopped
        `----------------------------------------------> completed
```

O nó pai `Execute` não é uma chamada de ferramenta do protocolo e não corresponde a uma execução de ferramenta. Sua key e o tool id sintético ancoram no primeiro `ToolCallRow` filho; após os acréscimos via streaming, apenas os children são atualizados, evitando reconstrução do componente e perda do estado de expansão.

## Contrato de Resumo

### Pai

| Estado                  | Resumo primário                                                                  | Status |
| ----------------------- | -------------------------------------------------------------------------------- | ------ |
| running                 | `Running <command>`; quando todos os filhos estão em estado terminal, volta ao command mais recente, com rolagem vertical do resumo de ação completo | em execução |
| completed, all success  | `N 个命令`                                                                       | concluído |
| completed, failures     | `N 个命令，M 个失败`                                                             | concluído |
| stopped                 | `N 个命令，K 个已停止`, mantendo também a contagem de falhas                       | parado |

O pai não exibe stdout, stderr nem erros específicos. O detalhe da falha continua sendo mostrado pelo card da ferramenta filha correspondente, evitando duplicar o estado de falha entre pai e filhos.

### Filho

Os itens continuam usando `ExecuteToolCallBlock`: no estado recolhido mostram a ação de execução e o command; no estado expandido mostram `$ command`.
Quando o grupo pai está em progresso e expandido, o summary do pai mostra apenas `Terminal · N commands`, e o comando atual é expresso pelo summary da ferramenta filha logo abaixo, junto do resultado ou do erro; estados terminais sem saída exibem o texto existente de "sem saída".

## Decisões de Poda

| Decision ID | Combinações podadas                                     | Guard/invariante                                                       | Cobertura representativa        |
| ----------- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------ |
| ETG-P01     | Todas as permutações de nomes de ferramenta Bash/execute/shell | `resolveToolCallIdentity` já foi unificado na família Shell           | teste unitário da família     |
| ETG-P02     | Write/Edit/ApplyPatch misturados com Execute            | file-write entra em um grupo Changes independente, preservando o resumo de arquivo original e a semântica de undo | teste unitário de limite       |
| ETG-P03     | Todas as permutações de theme/locale/OS/workspace      | renderer + i18n compartilhados; não lê estado de plataforma nem de workspace | textos zh/en e focused UI test |
| ETG-P04     | Permutações físicas de rede continuous/replayable      | o agrupamento consome apenas as UI rows finais, sem modificar o transport | renderer unit + STIP03 existente |
| ETG-P05     | Combinações de permission/approval                     | PermissionDialog não passa pelo construtor de agrupamento de conversation | testes de permission existentes |

## Casos Aceitos

| Case ID | Setup                                             | Ação                                  | Asserções                                                                 | Camadas de evidência      | Status E2E   |
| ------- | ------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ | ------------------------- | ------------ |
| ETG01   | Um único Shell não somente-leitura                | Construir work items                  | Mantém a linha de ferramenta Shell original, sem criar um grupo pai de child único | UI unit                   | covered-unit |
| ETG02   | Pelo menos dois Shells não somente-leitura consecutivos | Acréscimo de rows via streaming    | Após a chegada do segundo item o grupo pai é criado, mantendo a mesma key/tool id pai e a ordem dos children | UI unit                   | covered-unit |
| ETG03   | Explore/texto/reasoning visível aparece dos dois lados de Execute | Construir work items | Divide em vários grupos, sem cruzar limite visível                  | UI unit                   | covered-unit |
| ETG04   | Dos dois lados de Execute há apenas reasoning oculto e não inicial | Desligar reasoning              | Mescla; com reasoning ligado, divide                                            | UI unit                   | covered-unit |
| ETG05   | O command do Shell ainda não chegou                 | Construir primeiro e depois completar o command readonly/other | Primeiro frame oculto; depois só aparece um entre Explore ou Execute | UI unit                   | covered-unit |
| ETG06   | Execute é a cauda visível real de um segment em running | Todos os filhos terminam ou segue acréscimo de command | O pai permanece in_progress; o resumo do novo command rola verticalmente | UI + renderer unit        | covered-unit |
| ETG07   | Execute expandido                                   | Renderizar o grupo pai               | Os filhos continuam mostrando command e output/error                        | renderer unit             | covered-unit |
| ETG08   | desktop/replayable restaurado chegando às mesmas rows finais | Construir work items     | Resultado de agrupamento idêntico, sem novo estado de restauração           | invariante do renderer compartilhado | partial      |
| ETG09   | Row visível não-Execute aparece depois de Execute, ou estado terminal do segment | Construir work items | Pai completed/stopped; child running só aparece no detalhe; as estatísticas agregadas aparecem imediatamente no estado terminal | UI + renderer unit | covered-unit |

## Notas de Handoff E2E

- O núcleo da primeira versão é o determinístico row-to-render-item e o summary do renderer, usando testes unitários focados.
- Se for promovido a E2E formal, o fixture controlled-stream deve enviar dois comandos Bash não somente-leitura em sequência e inserir reasoning visível/oculto no meio, afirmando a identidade do group pai, o summary e as duas comandos após a expansão.
- O `/remote` do celular não usa fixture de desktop para fingir prova de replayable; vale o contrato final de restauração de rows do STIP03.