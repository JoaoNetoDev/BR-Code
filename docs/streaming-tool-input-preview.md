# Streaming Tool Input Preview

## Contexto

Alguns modelos emitem os argumentos das ferramentas como function call em streaming antes de concluírem o raciocínio ou o corpo da resposta. Por exemplo, `Write`
produz primeiro `tool_input_start`, depois emite continuamente `tool_input_delta` e só então obtém o
`tool_call` completo. Se o protocolo app/agent só expõe deltas de corpo e reasoning, a UI fica presa em «pensando»
até o fim do turno do modelo, quando a chamada de ferramenta de arquivo aparece de repente.

## Objetivo

- O agent expõe à app um placeholder de chamada de ferramenta o mais cedo possível, assim que os argumentos da ferramenta começam a chegar.
- A UI exibe um cartão de ferramenta pending durante o fluxo dos argumentos e, com o cartão de alterações de arquivo já existente, mostra o caminho e a contagem de linhas amostrada por segundo.
- Ferramentas com efeito colateral continuam sendo executadas apenas na fase de tool execution, após o fim do turno do modelo; a pré-visualização dos argumentos não pode disparar escrita de arquivos.
- O caminho principal `desktop-continuous` do desktop permanece em tempo real; o `web-remote-replayable` do web remote
  continua usando replayable snapshot/event seq como fronteira de recuperação.

## Protocolo

`@zcode/protocol` ganha o session event `model.streaming`. atualmente, apenas os seguintes
streaming kinds de modelo são expostos à app:

- `text_delta`
- `reasoning_delta`
- `tool_input_start`
- `tool_input_delta`
- `tool_input_end`
- `tool_call`

`tool_input_delta` é agregado em blocos de texto maiores na camada do agent runtime antes de entrar no protocol,
evitando que os argumentos de `Write` de arquivos grandes gerem centenas de pacotes pequenos de stdio por segundo. O resultado final da execução da ferramenta continua sendo determinado pelos eventos da fase de tool execution.

A sessão v4 não expõe mais esse conjunto de eventos diretamente ao renderer; em vez disso, eles são projetados como
`ToolCallRow` no `ProductProjection` da CLI:

```text
model tool_input_*
  -> core ModelStreaming
  -> v4 ProductProjection
       row.appended(toolCall, inputStreaming)
       row.delta(inputText)           [Write/Edit no máximo uma vez por segundo, exceto o primeiro pacote e o fechamento]
       row.upserted(input,inputText)  [continuous/replayable ambos recuperáveis]
  -> UI v4 adapter
       buildZCodeStreamingToolInputPreview(inputText)
  -> ToolCallBlocks
       caminho, conteúdo e número de linhas de Write/Edit são atualizados no mesmo ponto de amostragem
```

Fronteiras do delivery profile:

- `desktop-continuous` mantém `row.delta(inputText)`, usado para exibir em tempo real a pré-visualização dos argumentos na sessão de desktop ativa.
- `web-remote-replayable` filtra `row.delta(inputText)` e recupera o `input` / `inputText` completo apenas pelo
  `row.upserted` final ou pelo snapshot.
- Como o replayable filtra os deltas do fluxo de entrada, qualquer evento de finalização dos argumentos da ferramenta precisa carregar o `inputText` completo no `row.upserted`, que não é filtrável; caso contrário a recuperação pelo controle remoto do celular ficaria sem o estado final dos argumentos da ferramenta.

### Amostragem de um segundo em Write/Edit

Os argumentos acumulados de `Write` / `Edit` disparam recuperação de JSON pela metade, cálculo de diff e atualização no React. Quando a saída do modelo é rápida,
materializar cada delta não traz ganho de legibilidade; por isso a pré-visualização de ferramentas de arquivo no desktop continuous adota uma amostragem determinística de
um segundo; as demais ferramentas mantêm o ritmo incremental original.

```text
tool_input_start ───────────────> criar imediatamente o cartão de ferramenta pending
primeiro tool_input_delta ─────> publicar imediatamente, exibir cedo o caminho/forma da ferramenta
deltas seguintes (desde o último < 1000ms) ─> apenas anexar ao buffer da projection
primeiro delta que atinge 1000ms ────────> agregar o suffix pending, publicar um único row.delta
end / call / scheduled / cancel ─> drenar imediatamente ou finalizar com o input completo
```

- O orçamento de tempo usa `SessionEvent.timestamp`, não timer do renderer; o mesmo ledger de eventos produz a mesma projection em live e em replay.
- A unidade de amostragem é a pré-visualização inteira da ferramenta de arquivo: caminho, conteúdo, inline diff e `+N/-N` são atualizados no mesmo ponto de amostragem,
  sem recuperação independente para cada um.
- O primeiro delta não espera um segundo. Os limites de término como finalização normal, agendamento e cancelamento também não esperam um segundo, e não podem perder o suffix ainda não
  publicado.
- A amostragem apenas reduz o número de projeções da pré-visualização; não altera o ledger dos argumentos, a verificação de permissões nem o momento de execução da ferramenta.
- O `+N` da pré-visualização em streaming de `Write` é o número de linhas lógicas do `content` já recuperado; em `Edit` é o
  resultado LCS linha a linha entre `old_string` e a parte atual de `new_string`, então o número pode subir e baixar durante o streaming, e apenas o diff do arquivo
  completed representa o fato real da alteração.

## Projeção na UI

O legacy service adapter projeta os eventos de argumentos de ferramentas de `model.streaming` nos já existentes
`tool_call` / `tool_call_update`:

- `tool_input_start` cria o cartão de ferramenta pending.
- `tool_input_delta` acumula fragmentos de JSON dos argumentos, tentando extrair campos comuns como `file_path` e `content`.
- `tool_input_end` preserva a última pré-visualização dos argumentos.
- `tool_call` sobrescreve o input da pré-visualização com o input completo, mas continua pending até chegar o evento
  real de execução `tool.updated`.

Se o evento scheduled de um `tool.updated` posterior usar o mesmo `toolCallId` da ferramenta em pré-visualização,
a UI precisa atualizar o cartão de ferramenta existente, em vez de acrescentar um cartão duplicado.

O lado do renderer v4 continua reutilizando o mesmo conjunto de cartões de ferramenta. `ToolCallRow.input` é o input estruturado final;
quando ele está ausente e `inputText` ainda é um JSON pela metade, o adapter usa
`buildZCodeStreamingToolInputPreview` para tentar extrair campos como `file_path`, `content`,
`new_string`, `old_string` e `command`. Pré-visualização vazia não é exibida como Parameters;
o raw metadata guarda apenas o comprimento do input e se está completo, sem copiar o raw input completo do streaming.

## Fronteiras de execução

A pré-visualização dos argumentos em streaming não altera as regras de agendamento de ferramentas. `Read`, por ser somente leitura e segura para concorrência, ainda pode passar pelo
streaming tool coordinator já existente; `Write`, `Edit` e `Bash`, que têm efeito colateral ou exigem aprovação,
não são executados durante o fluxo dos argumentos. A gravação em disco, a solicitação de permissão e os estados de falha/sucesso continuam vindo dos eventos
`tool.updated` da fase de tool execution.