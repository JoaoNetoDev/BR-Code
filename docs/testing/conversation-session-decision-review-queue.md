# Fila de Revisão de Decisões de Conversation Session

Objetivo: expandir, em ordem fixa, os casos da área de sessão que ainda aguardam decisão de produto e, após a confirmação do produto, reescrever o catalog, a coverage matrix e os E2E.

Comando de geração:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --review-queue-md
```

## Estado atual

| Métrica | Valor atual |
| --- | ---: |
| Total de product cases | 221 |
| Já cobertos | 125 |
| Aguardando decisão de produto / automação | 36 |
| Total de perguntas de protocolo | 36 |
| Perguntas de protocolo unanswered | 36 |
| Cases ready | 0 |
| Cases blocked | 36 |
| Próximo lote de review | N01, N02, N03 |
| Escopo de saída atual | Todos os cases aguardando decisão de produto |
| Cases na saída atual | 36 |

## Como usar

1. Revise os cases na ordem deste arquivo.
2. Para cada `Question`, escreva uma conclusão de produto explícita.
3. Volte ao decision worksheet correspondente, mude `产品结论` de `待确认` para a conclusão explícita e mude `Status` para `answered`.
4. Conforme o `回写目标`, atualize o catalog / fault catalog / coverage matrix de origem.
5. Depois que a semântica de produto estiver clara, escreva o E2E correspondente e, por fim, execute `pnpm audit:conversation-session-coverage`.

## Review Queue

### P0-2 Falhas de requisição de modelo/API

#### N01

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N01.1 | Estado final após 401/403, orientação para Settings, se a user message e a queue são preservadas | auth error, settings entry, queue snapshot | fault N01, fault coverage N01 |

#### N02

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N02.1 | Se provider/API Key ausente é bloqueado antes do envio ou falha depois do envio, e se o draft é preservado | no network request, composer draft, settings entry | fault N02, fault coverage N02 |

#### N03

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N03.1 | Estratégia de retry para 429, enfileiramento durante o retry, e estado/queue após a falha final | retry count, toolbar retry, queue | fault N03, fault coverage N03 |

#### N04

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N04.1 | Se 502/503 são diferenciados, estratégia de retry, e se retry/edit/fork/compact ficam disponíveis após a falha | status code, retry, action buttons | fault N04, fault coverage N04 |

#### N06

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N06.1 | user message após falha de DNS/connection/proxy/TLS, estado offline e regras da queue | network error, message retention, queue | fault N06, fault coverage N06 |

#### N07

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N07.1 | Limiar de timeout da requisição, semântica do stop, e se o timeout falha automaticamente ou faz retry | delay fixture, stop, timeout | fault N07, fault coverage N07 |

#### N08

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N08.1 | Se resposta 200 com corpo malformado é erro de protocol/provider/ignorável, e se há retry | malformed body, normalized error, log | fault N08, fault coverage N08 |

#### N09

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| N09.1 | Texto de fallback quando title/sidecar falha, se é visível ao usuário e se afeta o turn principal | title fallback, warn, main turn completed | fault N09, fault coverage N09 |

### P0-3 Falhas de streaming SSE

#### S01

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| S01.1 | Se a desconexão de um SSE vazio gera retry/error, e como tratar placeholder do assistant, user message e queue | empty SSE, retry boundary, queue | fault S01, fault coverage S01 |

#### S02

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| S02.1 | Se a desconexão após message_start gera interrupted/error/sem assistant, e se a queue faz drain automático | prelude close, assistant placeholder, queue | fault S02, fault coverage S02 |

#### S03

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| S03.1 | Conservação do partial após queda de fluxo após text delta, estado final, e se fork/edit/compact ficam disponíveis | partial text, failed/interrupted, buttons | fault S03, fault coverage S03 |

#### S04

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| S04.1 | Se um evento SSE malformado encerra, é ignorado ou se recupera, e a classificação no log | bad event, protocol log, event ordering | fault S04, fault coverage S04 |

#### S05

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| S05.1 | Se o provider error event do SSE exibe o texto original, se há retry e se gera assistant de erro | provider error frame, retry, assistant error | fault S05, fault coverage S05 |

#### S06

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| S06.1 | UI de stream stall, limiar de timeout, stop do usuário e estratégia automática de retry/falha | stalled event, toolbar state, timeout | fault S06, fault coverage S06 |

#### S07

- worksheet: `networkSse`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| S07.1 | Se eventos SSE tardios após o stop são ignorados, se há warn e como provar o isolamento por inputId | late event, activeInputId, new turn isolation | fault S07, fault coverage S07 |

### P1-1 Falhas de sistema de arquivos/armazenamento

#### D01

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| D01.1 | Alerta na UI após ENOSPC na escrita do session history, estado em memória, queue e semântica de relaunch | sqliteRun fault, DB, queue, relaunch | fault D01, fault coverage D01 |

#### D02

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| D02.1 | Tool block após falha da escrita de arquivo do workspace pelo tool, continuação do assistant, estado do turno atual e entrada de retry | workspace 父目录创建 / 非原子写 fault, tool block, file content | fault D02, fault coverage D02 |

#### D03

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| D03.1 | Erro de formulário após falha de gravação de provider/settings, preservação da entrada, rollback da configuração e bloqueio de envio | settings/provider fault, form state, config file | fault D03, fault coverage D03 |

#### D04

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| D04.1 | Na recuperação de inicialização com DB/snapshot corrompido: pular, isolar em backup, impedir a entrada ou exibir erro de recuperação | corrupt DB, workspace init, restore UI | fault D04, fault coverage D04 |

#### D05

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| D05.1 | Se a falha de escrita de log/artifact é visível ao usuário, se o fluxo principal continua e se o fallback de truncamento é aceitável | log fault, artifact fallback, warn | fault D05, fault coverage D05 |

### P1-2 Falhas de ciclo de vida do app/processo

#### L01

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L01.1 | Se agent/SSE continuam ao trocar de app ou minimizar, como o stream é retomado ao voltar ao foreground e como o unread é sinalizado | background, foreground, stream, draft | fault L01, fault coverage L01 |

#### L02

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L02.1 | Se host/agent continuam ao fechar/ocultar a janela, como restaurar ao reabrir e como tratar diferenças de plataforma | window close, host lifecycle, task restore | fault L02, fault coverage L02 |

#### L03

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L03.1 | Após quit/relaunch, se o turno em execução é interrupted/failed/notReady/replay resume, e como a queue é recuperada | app quit, snapshot, queue, timeline | fault L03, fault coverage L03 |

#### L04

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L04.1 | Após reload/crash do renderer, como são recuperados o caminho continuous, a queue e o activeInputId | renderer reload, store rehydrate, snapshot | fault L04, fault coverage L04 |

#### L05

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L05.1 | Se o host process é reconstruído automaticamente após crash, e como tratar o estado da UI e a pending permission/queue | kill host, owner lost, workspace notReady | fault L05, fault coverage L05 |

#### L06

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L06.1 | Código de erro após crash/exit do agent process, reinício automático, e se o turno atual e a queue são preservados | kill agent, PROCESS_EXIT, queue | fault L06, fault coverage L06 |

#### L07

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L07.1 | Após sleep/wake: continuar aguardando, falhar automaticamente, reconectar automaticamente ousinalizar recuperaçãoção manual, e o limiar de timeout | sleep/stall simulation, transport close | fault L07, fault coverage L07 |

#### L08

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| L08.1 | Se o app sair durante compacting, como marker, pendingAction e queue são recuperados | compact quit, marker, pendingAction | fault L08, fault coverage L08 |

### P2-1 Mudanças externas em Workspace / Tool

#### W01

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| W01.1 | Após o workspace desaparecer, entrada, histórico, file tree e chamadas de tool ficam somente leitura, bloqueados ou permitem falha | workspace missing, composer, file tree | fault W01, fault coverage W01 |

#### W02

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| W02.1 | Tool error após mudança externa no arquivo alvo durante leitura/escrita, se o assistant fica ciente da falha e se há reread/retry em um clique | stale write, not_found, assistant | fault W02, fault coverage W02 |

#### W03

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| W03.1 | Após o git repo sumir ou o dirty state mudar, a UI detecta automaticamente e o agente atualiza o git context no turno seguinte | git capability, action menu, env context | fault W03, fault coverage W03 |

#### W04

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| W04.1 | Após remote disconnect, como desktop continuous e mobile replayable exibem, reconectam e preservam o pending | remote disconnect, clientMode, workspaceIdentity | fault W04, fault coverage W04 |

#### W05

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| W05.1 | Pending permission ao alternar/fechar/desconectar: preservar, expirar, rejeitar automaticamente ou vincular à active session | permission queue, task store, response routing | fault W05, fault coverage W05 |

### P2-2 Isolamento de falhas entre Sessions

#### X01

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| X01.1 | Quando a requisição principal de A falha em background, B fica completamente alheio, há toast global e como o item A é marcado | inactive failure, active DOM, task list badge | fault X01, fault coverage X01 |

#### X02

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| X02.1 | Quando o compact em background de A falha, toolbar/sidebar de B ficam isolados, e como o marker de A e o aviso global são exibidos | inactive compact failure, switch back | fault X02, fault coverage X02 |

#### X03

- worksheet: `recoveryIsolation`
- unanswered questions: 1

| Question | O que precisa confirmar | Resumo das respostas candidatas / palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- |
| X03.1 | Ao voltar de B para A em erro, como são recuperados a distinção entre error, queue, buttons e restore failed | switch back, error detail, buttons | fault X03, fault coverage X03 |