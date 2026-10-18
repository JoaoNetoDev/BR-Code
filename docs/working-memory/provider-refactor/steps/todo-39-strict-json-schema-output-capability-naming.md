# Todo 39: consolidação do nome da capability de saída com JSON Schema estrito

> Status: coberto pelo Todo 74 (superseded)

> Status: rascunho, aguardando discussão
>
> Data: 2026-08-28
>
> Origem: Project Memory Model Selection Review

## Contexto

Atualmente, Model Properties usa `supportsStructuredOutput` para descrever uma capability de saída. Esse nome é facilmente interpretado como "consegue gerar JSON", "suporta JSON mode" ou, de forma genérica, saída de texto estruturado, mas sua semântica real na cadeia de execução atual é mais estreita: o modelo e o Schema da API de destino conseguem aceitar o JSON Schema fornecido pelo chamador e impor uma restrição estrita de Schema à resposta.

Esse campo hoje é usado tanto como fato estático do Model Config quanto pelo Runtime, antes de enviar `responseJsonSchema`, para verificar se o Active Model atual possui a capability correspondente. Um nome cuja semântica é mais ampla que o fato genera confusão entre o autor da configuração, o chamador em tempo de execução e a interface de configurações a respeito de "saída JSON comum", "saída com restrição estrita de Schema" e "tool call", e pode levar a declarações erradas em Built-in Model Config.

## Objetivos

- Estabelecer um nome de capability preciso e único para "restringir a resposta do modelo estritamente pelo JSON Schema fornecido pelo chamador";
- Fazer com que Config, Effective Model Config, Active Model, Runtime, Adapter, Protocol, UI e testes usem a mesma semântica;
- Distinguir claramente a saída com JSON Schema estrito, o JSON mode comum, o texto JSON exigido por prompt e o Tool Call;
- Garantir que a verificação da capability continue vindo das Properties congeladas do Active Model atual, sem inferência em tempo de execução por Model ID, Provider ou API Type;
- Permitir que autores de Built-in e Personal Model Config declarem essa capability com precisão, conforme um contrato explícito;
- Eliminar as ambiguidades e os resquícios de compatibilidade causados pelo nome antigo, restando ao final um único campo autoritativo.