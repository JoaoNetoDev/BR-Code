# Design — Ocultar o Banner de Modelo de Runtime Indisponível

## Contexto

Tarefas históricas do ZCode podem carregar uma referência de modelo persistida cujo provider ou modelo não está mais disponível no provider registry atual. A camada de serviço reporta isso como `ZCODE_RUNTIME_MODEL_UNAVAILABLE` e mantém o guard no lugar para que as sessões contínuas do desktop não retomem silenciosamente com um modelo de runtime diferente.

Atualmente, a UI exibe esse guard como um banner de erro de chat com a mensagem:

`历史任务使用的模型已不可用，请从当前模型列表中选择一个可用模型后继续。`

O comportamento de produto desejado é manter intactos o guard interno, os logs, o tratamento de restore e o estado da tarefa, mas parar de renderizar essa mensagem como um banner de erro de chat visível ao usuário.

## Objetivos

- Ocultar o banner de erro de chat para `ZCODE_RUNTIME_MODEL_UNAVAILABLE`.
- Manter inalterados o error code do serviço e a proteção de runtime.
- Manter logs e estado da tarefa disponíveis para diagnóstico.
- Preservar o comportamento normal do banner de erro para todos os outros error codes.
- Evitar adicionar UI, textos ou novos estados de interação substitutos.

## Não objetivos

- Não remover `ZCODE_RUNTIME_MODEL_UNAVAILABLE` da lógica de serviço ou de protocolo.
- Não alterar a semântica de restore, fallback ou setModel.
- Não remover testes que validam a proteção do serviço contra modelo indisponível.
- Não adicionar um toast mais discreto, uma dica inline ou um aviso na barra de ferramentas.

## Design

O limite mais estreito e seguro é a camada de apresentação do erro de chat. `ChatErrorBanner` deve tratar `ZCODE_RUNTIME_MODEL_UNAVAILABLE` como um erro de UI não renderizável e retornar `null`. Isso mantém o estado e o diagnóstico upstream inalterados, ao mesmo tempo que impede o banner visível de aparecer.

O limite no nível do componente é preferível a limpar o erro da tarefa em `useTaskRestore`, porque os fluxos de restore e de troca de modelo ainda dependem desse código para identificar e limpar o estado histórico de modelo indisponível após uma troca de modelo bem-sucedida.

## Testes

Adicionar ou atualizar os testes de UI de `ChatErrorBanner`:

- A renderização com `code: "ZCODE_RUNTIME_MODEL_UNAVAILABLE"` não deve conter a mensagem de modelo histórico no HTML.
- A renderização de um erro normal deve continuar exibindo a mensagem de erro.

Não é necessária regressão visual no navegador, porque o comportamento solicitado remove um banner existente em um único caminho de código e não adiciona layout nem estilo.

## Compatibilidade

A mudança é somente de UI e não afeta a semântica de desktop, web remote, mobile remote, processo de serviço, relay, snapshot de tarefa ou recuperação de stream. Os caminhos replayable do desktop continuous e do web remote continuam recebendo e persistindo o mesmo error code; apenas o banner de chat visível é suprimido.