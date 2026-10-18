# Design de fallback da lista de modelos no Task Restore

## Contexto

O modelo persistido de um task histórico pode já não estar entre os modelos disponíveis no momento. A versão anterior da lógica de restauração usava, em `useTaskRestore`, o primeiro item do provider snapshot como fallback automático, mas o provider snapshot é a visão do registry subjacente, que não equivale à lista de modelos do usuário nem tem necessariamente seu uso aceito pelo host runtime.

Já aparecia em logs reais: a UI escolhia `builtin:bigmodel/GLM-5.2` como fallback do provider snapshot, mas o host considerava aquele modelo de sessão indisponível; ao mesmo tempo, a barra de ferramentas ainda exibia o histórico `builtin:bigmodel/GLM-5.1`.

## Objetivo

Quando o modelo de um task histórico for confirmado como indisponível, a troca automática deve reutilizar o primeiro modelo selecionável da lista de modelos, ou seja, o primeiro item que o usuário pode ver e selecionar no dropdown da barra de ferramentas.

## Design

- A camada de parsing do task restore apenas verifica se o modelo local do task está disponível e não escolhe mais por conta própria um modelo de fallback a partir do provider snapshot.
- A camada de parsing do task restore / send, ao confirmar que o modelo histórico está indisponível e não haver um fallback de modelo visível e explícito, deixa de passar o modelo antigo como resume hint ao runtime.
- O posicionamento automático do modelo na barra de ferramentas volta a ser "task ativa disponível": quando o modelo atual não está em `modelSelectGroups`, seja ele um modelo nativo ou vindo de um custom provider, usa-se `modelSelectGroups[0].items[0].value` como fallback.
- A troca automática passa pelo link existente de `handleModelValueChange`, mantendo a semântica consistente entre seleção da UI, sincronização com o provider, task config e hint do runtime.
- Se a lista de modelos não tiver nenhum modelo selecionável, não há fallback automático e o aviso atual de indisponibilidade é preservado.

## Non-Goals

- Não introduzir um novo host RPC para consultar o primeiro modelo disponível do runtime.
- Não depender do componente de toolbar na lib de task restore.
- Não alterar o comportamento de troca manual de modelo pelo usuário.

## Verificação

- Teste unitário cobrindo que, quando o modelo atual do task ativo está indisponível, há fallback para o primeiro item da lista de modelos.
- Teste unitário cobrindo que, quando o task restore confirma o modelo como indisponível, o primeiro item do provider snapshot deixa de ser usado.
- Executar os vitest relacionados, `pnpm typecheck` e `pnpm lint`.