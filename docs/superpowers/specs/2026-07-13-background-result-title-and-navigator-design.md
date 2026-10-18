# Título de resultado em background e design do catálogo de turnos reais do usuário

## Objetivo

O turn de conclusão independente de Agent/Bash em background deixa de usar o impreciso "worked for N seconds" como título de resumo e passa a exibir o title já definido no momento em que a tarefa foi iniciada. Esse resultado já é um resumo do modelo e não oferece capacidade de expandir/recolher. O Conversation Turn Navigator indexa apenas as entradas `realUser` submetidas ativamente pelo usuário e não pode tratar as notificações de sistema persistidas pelo runtime com `role=user` como uma query do usuário.

```text
background task terminal
  │ { backgroundSource, workId, title }
  ▼
synthetic provider context ──► idle runtime command ──► TurnStarted
                                                        │
                                                        ▼
                                           TurnHeaderRow.originMeta
                                                        │
                              ┌─────────────────────────┴──────────────────────┐
                              ▼                                                ▼
                    static title + full history                  navigator ignores turn

real user send ──► UserInputRow(origin=realUser) ──► navigator item
```

## Limites dos dados estruturados

- Novos metadados unificados de resultado em background: `backgroundSource: "bash" | "subagent"`, `workId`, `title`.
- O title de Subagent usa a description usada ao iniciar o Agent; o title de Bash mantém o resultado de resolução existente `description → command → toolName → workId`.
- Os metadados são persistidos com a synthetic message da background notification e chegam a `TurnHeaderRow.originMeta` por meio do runtime command, `TurnStarted`, cold hydration e product projection; é proibido fazer parsing do corpo da notificação ou procurar a tarefa de trás para frente pelo horário de conclusão.
- As notificações que fazem merge diretamente dentro do active-loop não criam um turn `backgroundResult` independente e, por isso, não inserem título. Apenas o turn independente model-only awakened por idle usa essa exibição.
- O snapshot/coalesce replayable reutiliza os metadados da row, não adiciona novo estado de negócio relay/main e não altera os limites de restauração do desktop continuous e do mobile replayable.

## Semântica de UI

- O novo ramo só é habilitado quando `turnHeader.origin === "backgroundResult"` e source, workId e title não vazio estão completos.
- O novo ramo exibe o title completo como um título de texto de hierarquia fraca, permitindo quebra natural de linha; rows históricas são renderizadas permanentemente por completo, sem criar `Collapsible`, chevron, botão de disparo ou estado local de abertura, e sem exibir a duração do trabalho.
- Turns comuns de Assistant e turns antigos de background sem metadados estruturados permanecem como estão; o histórico antigo não recebe adivinhação de texto nem migração.
- A condição necessária para um item do navigator é existir um `UserInputRow(origin="realUser")` visível dentro do turn. Entradas assistant-only, background result, goal continuation, mailbox e outras entradas synthetic com role=user são todas excluídas; guided/queue-drained é mantido desde que seja projetado como `realUser`.
- Essa regra é servida pelo renderer compartilhado tanto para desktop quanto para Web; o celular em tela estreita não exibe o rail, mas as rows recuperadas devem manter os mesmos metadados.

## Aceitação e podas

- Aceito: idle wake de Agent, idle wake de Bash, isomorfismo live/cold, título preservado após refresh, e contagem/preview do navigator vindos apenas dos turnos reais do usuário.
- terminal success/failed/stopped compartilham a mesma regra de exibição, o E2E cobre o caminho representativo e as combinações de status são cobertas por focused tests.
- Podas: inserção de title no active-loop, migração de sessões antigas sem metadados, parsing do texto da notificação, interação do rail no celular em E2E e todas as permutações de status terminal.
- A automação cobre no mínimo a conservação dos metadados de protocolo/runtime, o cold hydration, a projection, a renderização estática dos dois titles, a regressão de colapso de turns comuns, o legacy fallback e o filtro estrito do navigator.