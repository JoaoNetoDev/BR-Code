# Todo 80: suporte a saída com streaming de JSON Schema

> Status: rascunho, aguardando discussão
>
> Data: 2026-09-04

## Problema

Atualmente, `responseJsonSchema` só tem efeito no caminho não-streaming de `generateText`:

```text
generateText -> repassa e codifica o JSON Schema
streamText   -> atualmente não repassa o JSON Schema
```

Isso é inconsistente com o objetivo de que, "ao suportar JSON Schema, a requisição deve ser tratada sob o mesmo contrato", mas, como os chamadores de produção usam majoritariamente o caminho não-streaming, ainda não foi confirmado se trata de uma capacidade de produto a ser ampliada imediatamente ou de um limite mantido explicitamente.

## Ideias iniciais

- Estudar isoladamente se o streaming com JSON Schema precisa ser suportado e se é necessário devolver o "objeto final" ou "incrementos de objeto".
- Priorizar não adicionar um novo `ModelStreamEvent`: se o produto precisa apenas do resultado final, é possível obter o objeto completo no fim do stream e reutilizar o contrato de resultado existente.
- Se realmente forem necessários incrementos de objeto, projetar separadamente o evento de streaming e a cadeia de consumo Core/UI, sem assumir isso antecipadamente neste Todo.
- Começar pelos Anthropic Messages como objeto de estudo, sem estender para outros API Schema.

## Fora do escopo deste Todo

- Não modificar o código de produção atual;
- Não alterar o comportamento de JSON Schema no caminho não-streaming;
- Não projetar um protocolo completo de eventos de streaming;
- Não lidar com PDF, tool calls ou a camada de Provider Config.