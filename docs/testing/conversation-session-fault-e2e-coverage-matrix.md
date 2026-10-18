# Conversation Session Fault E2E Coverage Matrix

Este documento alinha, um a um, os fault cases de produto de [conversation-session-environment-fault-catalog.md](./conversation-session-environment-fault-catalog.md) e o status posterior de cobertura WDIO E2E.

Critério central: um fault case precisa ter primeiro uma conclusão de produto para que se possa escrever asserções estáveis. `decision-needed` não pode se passar por `covered`; `covered` precisa ter setup/action/assert próprios e evidência automatizada.

## Definição dos status de cobertura

| Status | Significado |
| --- | --- |
| `decision-needed` | A expectativa de produto não está confirmada; não se pode escrever asserções estáveis |
| `missing` | A expectativa de produto foi aceita, mas ainda não há asserção automatizada própria |
| `covered` | Já há asserção automatizada própria cobrindo o caso |
| `failing` | Já existe uma sonda automatizada, mas a implementação atual não atende à expectativa de produto |
| `partial` | Só há asserção fraca ou cobertura de semântica adjacente; não conta como prova completa |
| `ignored` | O produto confirmou que a versão atual não cobre |
| `invalid` | O produto confirmou que essa combinação é podada por regras prévias |

## Abreviações de teste de fault

Uma fault spec pode ser registrada antes do diretório definitivo no formato `manual-review/pending`; pending ainda conta como `missing` e não pode entrar em `covered`.

| Abreviação | Spec |
| --- | --- |
| NQ | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-turn-error-queue-preserved.test.ts` |

## Estatísticas atuais

| Escopo | Quantidade |
| --- | ---: |
| Linha de fault de produto | 40 |
| decision-needed | 36 |
| fault aceito sem cobertura | 4 |
| covered | 0 |
| sonda failing | 0 |
| partial | 0 |
| ignored | 0 |
| invalid | 0 |
| Abreviações de automação | 1 |
| Abreviações de automação referenciadas | 1 |
| Specs com declaração de teste | 1 |
| Specs com skip/only | 0 |

## N. Falhas de requisição ao modelo/API

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| N01 | decision-needed |  | A requisição ao modelo principal retorna 401/403 |
| N02 | decision-needed |  | Provider não configurado ou API Key ausente |
| N03 | decision-needed |  | A requisição ao modelo principal retorna 429 |
| N04 | decision-needed |  | A requisição ao modelo principal retorna 502/503 |
| N05 | missing | NQ | A requisição ao modelo principal retorna 500 com JSON de erro; o estado terminal de erro preserva a queue e pausa o consumo automático, aguardando review do caso pending |
| N06 | decision-needed |  | DNS/connection refused, sem obter os headers de resposta |
| N07 | decision-needed |  | Timeout da requisição, sem headers de resposta por muito tempo |
| N08 | decision-needed |  | 200, mas a resposta não é um JSON/SSE de modelo válido |
| N09 | decision-needed |  | A requisição de title/sidecar falha |

## S. Falhas de streaming SSE

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| S01 | decision-needed |  | Os headers de resposta foram devolvidos, mas a conexão cai sem nenhum evento SSE |
| S02 | decision-needed |  | Já há diagnóstico pending para o stall após `message_start` / thinking; coleta-se apenas o fato atual, sem contar como covered |
| S03 | decision-needed |  | Já há diagnóstico pending para o stall após um delta de texto; a semântica final de produto para partial ainda precisa ser confirmada |
| S04 | decision-needed |  | JSON de evento SSE malformado |
| S05 | decision-needed |  | O provider emite um error event no SSE |
| S06 | decision-needed |  | As seis categorias de cutoff já têm diagnóstico real de idle-timeout/recovery; a semântica final de UI/exaustão ainda precisa ser confirmada |
| S07 | decision-needed |  | Após o stop, o provider continua emitindo eventos SSE tardios |

### Evidência de sub-limites de recuperação já confirmada

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| S02-R1 | partial | Core focused unit | Para o corte de stream/idle timeout somente de reasoning já foi provado que é seguro ancorar uma nova assistant message id e descartar eventos; o fault-stream E2E pending foi complementado, mas ainda não entra nas estatísticas de cobertura de fault do nível superior |

Os limites de asserção e de evidência dos diagnósticos pending estão em [conversation-session-sse-stall-e2e-diagnostic.md](./conversation-session-sse-stall-e2e-diagnostic.md). Ele cobre a cadeia real Desktop → Host → CLI → provider → UI V4, mas não registra abreviação de automação de fault antes da confirmação da conclusão de produto no nível superior, e portanto não conta como covered.

## C. Aliases de falha de Compact

`C01-C03` são aliases da perspectiva de falha de ambiente dos casos de caminho principal `F09/G11/G12`. Eles não adicionam um product case único a mais, mas precisam manter o mesmo estado de decisão dos casos de origem.

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| C01 | missing |  | F09: tanto a perna de streaming do compact manual quanto a perna de fallback non-stream falham (já arbitrado: completed + failed marker + retry; falta um E2E com asserções estáveis) |
| C02 | missing |  | G11: o compact automático falha 3 vezes seguidas (já arbitrado: seguir executando sem compactação + circuit breaker; falta um E2E com asserções estáveis) |
| C03 | missing |  | G12: o compact automático é interrompido por stop (já arbitrado: alinhar com o stop comum e manter pendingAction na linha do tempo; falta um E2E com asserções estáveis) |

## D. Falhas de sistema de arquivos/armazenamento

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| D01 | decision-needed |  | ENOSPC na gravação do session history |
| D02 | decision-needed |  | Disco cheio enquanto uma tool grava um arquivo do workspace; a injeção de fault atual se limita a criação de diretório pai, gravação não atômica ou remoção; o padrão atomic temp/rename não é injetado |
| D03 | decision-needed |  | Permissão negada nos dados do app ao salvar as configurações do provider |
| D04 | decision-needed |  | Arquivo de snapshot da sessão corrompido na recuperação da inicialização |
| D05 | decision-needed |  | Falha de gravação de log/artifact de streaming longo |

## L. Falhas de ciclo de vida/processo do App

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| L01 | decision-needed |  | O usuário muda para outro app ou minimiza |
| L02 | decision-needed |  | Fecha a janela atual sem sair do app |
| L03 | decision-needed |  | Sai do app e abre de novo |
| L04 | decision-needed |  | Reload/crash do renderer |
| L05 | decision-needed |  | Crash/restart do host process |
| L06 | decision-needed |  | Crash/saída do agent process |
| L07 | decision-needed |  | Sleep/wake do sistema |
| L08 | decision-needed |  | O app é fechado/encerrado durante o compacting |

## W. Mudanças externas em Workspace / Tool

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| W01 | decision-needed |  | O diretório do workspace é apagado ou renomeado |
| W02 | decision-needed |  | O arquivo alvo é modificado/apagado externamente durante um read/write de tool |
| W03 | decision-needed |  | O repositório git não existe ou o dirty state muda |
| W04 | decision-needed |  | A conexão do remote workspace por SSH/WSL/Docker cai |
| W05 | decision-needed |  | O usuário fecha ou troca de sessão enquanto há um permission request pendente |

## X. Isolamento de falhas entre Sessions

| ID | Status de cobertura | Automação | Observações |
| --- | --- | --- | --- |
| X01 | decision-needed |  | A em execução, B ativa, a requisição ao modelo principal de A falha |
| X02 | decision-needed |  | A em compacting, B ativa, o compact de A falha |
| X03 | decision-needed |  | A em erro, B ativa, voltando para A |