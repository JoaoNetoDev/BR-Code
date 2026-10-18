# Rotas de provider runtime headers do subagent Explore

## Contexto

O desktop assina os dynamic session events pelo sessionId da task pai. O subagent Explore cria internamente no CLI um sessionId de sessão filha próprio, usado para eventos da subsessão, persistência e arquivamento de trace.

Start Plan / bigmodel Start Plan precisam atualizar `provider-runtime-headers` antes de cada requisição real de modelo, por exemplo o header único exigido pela verificação de segurança da build oficial. Essa atualização não é um session event comum, não passa pelo espelhamento em `mirrorSubagentToolEvent` de volta para a task pai, e é uma requisição ZCode Protocol independente.

## Problema

Antes da correção, o subagent Explore reutilizava o `providerRuntimeHeadersPort` do runtime pai, mas a requisição de atualização era iniciada pelo runtime filho, portanto carregava o sessionId da sessão filha.

Ao receber uma requisição `provider-runtime-headers`, o desktop agent service dispara o evento dinâmico conforme o sessionId da requisição; a UI assina apenas o sessionId da task pai e nunca assina `sess_subagent_agent_*`. O resultado é que a requisição de runtime headers do subagent cai no canal de sessão filha, sem ninguém ouvindo: o renderizador não processa a requisição nem chama `respondProviderRuntimeHeaders`, e a requisição de modelo do subagent fica esperando até o usuário fazer stop ou a requisição ser cancelada.

## Princípio da correção

O sessionId da sessão filha do subagent Explore é mantido, para o livro-razão interno do CLI:

- Os eventos da sessão filha continuam sendo persistidos com o sessionId da sessão filha.
- O lifecycle / tool events do subagent continuam sendo espelhados para a task pai conforme a lógica existente.
- O trace context e a relação parentSessionId permanecem inalterados.

Apenas quando o subagent chama `providerRuntimeHeadersPort.refreshBeforeModelRequest` externamente, o sessionId da requisição é trocado pelo sessionId da task pai. Assim, a requisição de runtime headers é roteada para o canal da task pai, que a UI do desktop já assina, alinhando-se à semântica externa já existente de `mirrorSubagentToolEvent`: interações bloqueantes visíveis ao usuário do subagent pertencem à task pai.

## Escopo de impacto

Essa correção afeta apenas as requisições de modelo que precisam de `provider-runtime-headers`, hoje principalmente Start Plan / bigmodel Start Plan. Ela não altera a chave primária de armazenamento das sessões nem grava os dados de persistência da sessão filha na sessão pai.

Se no futuro forem adicionadas outras requisições de protocolo bloqueantes e independentes de subagents, também será preciso julgar explicitamente se elas devem ser roteadas para a sessão filha ou para a sessão da task pai; não se pode assumir que o espelhamento via eventSink cobre requisições de protocolo.

## Isolamento de requisições em 2026-09-08

O consumidor de produção do desktop agora é o controller permanente do workspace; o roteamento para a sessão pai foi mantido.

A resposta de runtime headers é devolvida ao subagent por meio de um requestId único, correspondente à chamada de modelo atual; o Host não usa mais o modelo filho para reescrever o runtimeModel do pai.

Cada chamada de modelo (filha ou pai) possui seu próprio orçamento de retentativas por requisição, sem compartilhamento; o input do usuário pai não é editado e ferramentas já concluídas não são repetidas.