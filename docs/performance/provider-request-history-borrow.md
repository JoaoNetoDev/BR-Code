# Leitura do Histórico Antes da Requisição ao Provider

## Contexto

Antes de enviar a requisição em cada model step, o Agent Runtime lê várias vezes o mesmo `MessageHistory`. Quando o histórico é longo, se cada ponto somente-leitura fizer uma cópia profunda de todas as entries via `toRuntimeEntries()`, as mensagens, os content blocks e os objetos de metadata serão alocados repetidamente; e a entrada de projection do provider faz mais uma cópia profunda completa, amplificando ainda mais o custo de CPU síncrona e de GC.

Desta vez apenas se consolidam as leituras de histórico internas do Runtime e a fronteira de cópia do provider projection, sem alterar a ordem das mensagens, o resultado do microcompact, o cache control, o formato de persistência, o protocolo ou o comportamento da UI.

## Contrato de Propriedade

`MessageHistory` é o único owner autoritativo do histórico de mensagens dentro do Agent Runtime. Depois que uma entry entra no histórico, ela é usada como valor imutável; quando for necessário mudar o conteúdo do histórico, deve-se adicionar uma nova entry, fazer uma substituição integral, ou fazer copy-on-write apenas nas entries modificadas. É proibido modificar in-place uma entry/message/content emprestada.

O histórico oferece três formas de leitura com ciclos de vida distintos:

| Forma de leitura                          | Custo          | Escopo de aplicação                              | Contrato                                                                 |
| ----------------------------------------- | -------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `borrowReadOnlyRuntimeEntries()`          | O(1)           | síncrono, somente leitura imediata               | retorna diretamente as entries autoritativas atuais; o chamador não pode escrever nem manter referência além de uma fronteira assíncrona |
| `[...borrowReadOnlyRuntimeEntries()]`     | O(n) de ponteiros | tarefas assíncronas ou fronteira de compact que exigem conjunto fixo de membros | fixa os membros do array no momento; as entries continuam compartilhando referências imutáveis |
| `toRuntimeEntries()`                      | O(n) de clonagem de conteúdo | quando é necessária uma cópia independente mutável ou um snapshot defensivo externo | o chamador pode modificar o valor retornado sem poluir o histórico |

Não se introduz revision, cache de versões nem protocolo de invalidação. O Runtime chama o borrow novamente em cada ponto de leitura imediata para obter o array autoritativo daquele instante. Somente o código que explicitamente atravessa `await` e exige preservar a fronteira de agendamento faz um snapshot superficial do array no ponto de leitura.

## Sequência

```text
同一个 model step

microcompact
  borrow 当前历史 A
  -> projection 只读
  -> 若清理 tool result，以新 entry/message replaceMessages

reminder 判断
  borrow 当前历史 B                 # 重新取，不复用 A
  -> 可能 addAttachment

最终 provider projection
  borrow 当前历史 C
  -> 有 memory update 才用 [...C, update] 创建请求数组
  -> reorder / system projection    # 不改输入 entry
  -> render clone message           # 每次 projection 唯一的内容克隆边界
  -> media/cache-control/request
```

O memory agent em segundo plano e o compact ativo continuam usando o conjunto de membros do momento do agendamento em passos assíncronos posteriores, portanto eles fazem um snapshot superficial do array na entrada. Mesmo que depois do snapshot superficial haja append ou replacement em `MessageHistory`, o conjunto de entries escolhido pela tarefa não muda.

Esses dois snapshots superficiais apenas fixam a fronteira dos membros do array; eles não fazem deep-freeze de entry/message/content:

- A Extração/Dream de Project Memory pode consumir `providerEntries` apenas em outros turns, após compact ou rewind, no mesmo turno do agendamento. O snapshot superficial do array feito no agendamento é responsável por excluir mensagens acrescentadas no futuro; ao construir de fato a requisição de Memory para o provider, o render clona message/content.
- O compact ativo mantém `activeEntries` ao longo de passos assíncronos como a requisição de summary, retentativas e persistência. Selection, provider render e o `replaceMessages` final clonam cada um os dados de que precisa ser dono.
- Ambos os caminhos dependem da mesma restrição de imutabilidade: depois que uma entry entra em `MessageHistory`, é proibido modificar in-place sua entry/message/content; mudanças posteriores só podem ocorrer por append, substituição integral ou copy-on-write da entry modificada. Violar essa restrição faz com que um snapshot assíncrono já agendado observe mudanças de conteúdo ocorridas após o agendamento.
- Se no futuro for realmente necessário permitir mudanças in-place em entries do histórico, é preciso antes restaurar a clonagem defensiva de conteúdo no momento do agendamento ou introduzir um mecanismo equivalente de snapshot imutável; não se pode continuar reutilizando o contrato atual de snapshot superficial.

## Fronteira de Cópia do Projection

- O reorder de attachments, a system projection no meio da conversa e a movimentação do legacy reminder apenas reordenam referências ou criam entries sintéticas; não podem modificar as entries de entrada.
- `renderProjectedEntryToModelMessage` cria uma message/content independente para cada mensagem efetivamente enviada, isolando o processamento posterior de media, cache-control e serialização.
- Quando o microcompact não é acionado, retorna-se diretamente a entrada somente leitura; quando é acionado, faz-se uma cópia superficial do array e criam-se novas entries e novas messages apenas para os tool results efetivamente removidos.
- `toRuntimeEntries()` preserva a semântica original de cópia profunda defensiva e não é usada como API de somente leitura comum dentro do Runtime.

## Complexidade e Fronteiras

Após a otimização, a leitura do histórico em si é O(1), o snapshot de membros através da fronteira assíncrona é O(n) de cópia de ponteiros, e o render das mensagens do provider continua sendo a clonalgem de conteúdo O(n) necessária. A verificação de microcompact e a requisição final precisam cada uma de um render, mas já não clonam repetidamente as runtime entries antes de cada render; e um mesmo model step também não lê mais clonando o histórico inteiro de forma repetida para cada reminder.

Desta vez não tratamos a estimativa de tokens, a concatenação de strings de uso de contexto, a recuperação fria do SQLite ou o payload dos eventos `ModelRequest`; esses custos precisam de medição independente e não se pode inferir que sumiram a partir desta mudança.

## Verificação

- Primeiro travar com testes unitários o comportamento da clonagem defensiva, do isolamento do provider projection e de o microcompact não poluir a entrada.
- Os testes unitários da API de borrow cobrem: releitura do valor autoritativo após append, um borrow antigo deixar de ser o array autoritativo após replacement, e a clonagem defensiva continuar modificável de forma independente.
- Os testes unitários de copy-on-write cobrem apenas a troca de referência dos tool entries removidos, com as outras entries mantendo o compartilhamento.
- Testes direcionados, `pnpm typecheck` e `pnpm lint` devem passar.
- Usar um benchmark com histórico longo para comparar o tempo de projection antes do envio antes e depois da otimização; o benchmark serve apenas como evidência de performance, não como um limite de produto fixo entre máquinas.
