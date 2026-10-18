# Comando de atalho `/plan` do Composer

## Objetivo

Fornecer ao V4 Composer do desktop, da Web e do `/remote` no celular um comando de atalho `/plan` descobrível,
combinando "mudar para o modo Plan" e "enviar uma tarefa" em uma única operação de entrada.

Este comando pertence apenas à superfície do App Composer e não estende a CLI TUI, `--prompt` nem as entradas headless.

## Sintaxe e resultado

| Entrada                                     | Resultado                                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/plan`                                     | o draft atualiza o renderer draft mode; em uma session existente, envia `switchCollaborationMode(plan)`; não envia requisição ao modelo. |
| `/plan <task>`                              | conclui primeiro o CAS de modo e depois envia com o `sendText(<task>)` comum; o provider e o transcript veem apenas `<task>`. |
| `/plan` ou `/plan <task>` com anexo/contexto | exibe explicitamente que a primeira versão não suporta isso, preservando entrada, anexos e contexto, sem trocar de modo e sem enviar. |
| Outros textos (por exemplo `/planner`)     | tratados como texto comum.                                                                                  |

O nome do parâmetro não diferencia maiúsculas de minúsculas; o corpo da tarefa remove os espaços das pontas, mas preserva as quebras de linha e o conteúdo internos.
Depois que o comando é consumido, o Composer limpa a entrada do comando; o `/plan` em si não gera nenhuma user transcript row.
O comando original pode permanecer no prompt history local, mas não pode entrar no prompt do provider nem no conversation transcript.

## Estado e limites de falha

```text
Composer submit
      │
      ├─ attachments/context -> unsupported toast -> keep draft
      │
      └─ text only
           ├─ draft
           │    ├─ update current Composer Draft mode to plan
           │    └─ task present -> create/prewarm config mode=plan -> send task
           └─ existing session
                ├─ switchCollaborationMode(plan)
                ├─ accepted/noop/duplicate
                ├─ no task -> done
                └─ task -> ordinary sendText(task)
```

Os comandos de configuração e de envio continuam usando a config barrier existente. Um CAS stale usa a retry limitada já existente; se o resultado final não for
`accepted`, `noop` ou `duplicate`, retorna `blocked`, sem limpar o Composer e sem enviar a tarefa.
Quando já está no modo Plan, o CAS de modo converge como noop e ainda permite enviar a tarefa.

O `/plan` de draft compartilha a renderer draft preference com a troca de modo pela barra de ferramentas; a troca em uma session existente não reescreve
o valor padrão dos drafts seguintes. Entradas running/queued continuam sendo admitidas pelo `CommandInbox` do runtime da CLI conforme o FIFO existente,
sem criar uma fila específica para `/plan` nem um mode snapshot.

## Limites entre plataformas

O workspace local/remoto do desktop continua usando o attachment confiável `desktop-continuous`, e o `/remote` no celular
continua usando o attachment confiável `web-remote-replayable`. Os dois lados reutilizam a mesma ordem de comandos do Composer, sem alterar
as responsabilidades de relay, desktop main, Host, workspace identity, remoteSessionId ou snapshot/gap replayable.

Não é adicionado nenhum V4 wire command, campo de protocolo, estrutura persistida ou runtime separado.

## Evidências de verificação

- O slash catalog exibe `/plan [task]` e, ao selecionar, insere `/plan `.
- O comando vazio em draft apenas muda o modo; o comando vazio em uma session existente não gera requisição ao modelo nem user row.
- Com tarefa, o CAS de modo precede o `sendText`, e apenas o corpo da tarefa aparece no provider/transcript.
- Falha de CAS e rejeição por anexo/contexto preservam o estado completo do Composer.
- Desktop continuous e mobile replayable diferem apenas no delivery profile, com semântica final de comando idêntica.