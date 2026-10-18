# Suporte a proxy de API de negócio do Host

## Contexto

O Renderer, o WebView e o `electron.net` do Electron usam o proxy de Session do Chromium; o Window Host é um processo Node separado e o `NodeApiClient` usa por padrão o `fetch` do Node, portanto não herda `session.setProxy`. Em redes com proxy obrigatório, a troca de token OAuth e as demais APIs de negócio do Host falham ao tentar conexão direta.

## Solução mínima

Adicionar um transport em nível de requisição apenas na saída de API do Host, dentro de `packages/services`, e injetá-lo pelo ponto de injeção `fetchImpl` do `NodeApiClient` existente:

- Proxy, No Proxy e CA já são lidos de `AppSettings`;
- A política é carregada de forma preguiçosa e congelada na primeira requisição do Host;
- No Proxy é decidido pela URL final de cada requisição;
- Sem proxy explícito, mantém-se a conexão direta; quando a configuração de proxy explícito falha, não há retorno para conexão direta;
- Cobre apenas o `NodeApiClient`, sem alterar o Renderer, a Session do Electron, o Agent, o Bot, o telemetry ou outros `fetch` avulsos.

```text
AppSettings
    |
    v
Host Node transport -- final URL -> No Proxy? --+--> direct
    |                                           `--> proxy
    v
NodeApiClient -> OAuth / Coding Plan / client-scenes / provider APIs
```

## Limites e próximos passos

Não se introduz o CLI adapter diretamente nos services, nem se define um dispatcher global para o processo do Host. Compartilhar o egress adapter de Node entre Host e Agent pode ser uma refatoração independente posterior, evitando ampliar o escopo de regressão de requisições de modelo, WebFetch e HTTP MCP desta tarefa.

## Verificação

É preciso cobrir conexão direta sem proxy, encaminhamento via proxy, acerto de No Proxy, erro de proxy sem conexão direta e seleção de rota após reescrita de endpoint; as semânticas existentes de timeout, abort e fluxo de resposta devem permanecer inalteradas.