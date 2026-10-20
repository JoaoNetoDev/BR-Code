# Build independente do Share e fronteira de dependências do CUA

## Status

- Status: implementado
- Escopo: dependências de build da landing page estática do Share
- Não altera: Share API, protocolo OAuth, importação pelo Desktop, `/remote` no celular, entrada Web completa

## Problema atual

Versões históricas de `build:web-share` construíam o aplicativo Web completo por meio de `packages/web/src/main.tsx`.
Hoje foi adotada uma entrada independente, `@zcode/web-share`; o Share apenas reutiliza `@zcode/share-ui`, os tipos de protocolo,
o cliente de autenticação/Share API e a apresentação somente leitura, sem entrar mais no fechamento de dependências do CUA do Web completo.

```text
histórico: @zcode/web -> @zcode/client / @zcode/ui -> @zcode/services -> @zcode/zcode-cua
atual: @zcode/web-share -> @zcode/share-ui / @zcode/shared
      @zcode/web       -> @zcode/client / @zcode/ui -> @zcode/services -> @zcode/zcode-cua
```

## Fronteira desejada

- `@zcode/web-share` contém apenas as rotas do Share, a Preview API, o callback do OAuth e a linha do tempo somente leitura.
- O build do Share não declara, resolve nem baixa `@zcode/services` e `@zcode/zcode-cua`.
- `@zcode/share-ui` fornece a entrada de apresentação somente leitura necessária ao Share; Desktop/Remote continuam usando o `@zcode/ui` completo.
- Share e Web completo compartilham os tipos de protocolo e as implementações de exibição somente leitura já confirmadas, sem compartilhar services em execução.
- O build do Remote v4 constrói o CUA a partir do `packages/zcode-cua` dentro do workspace, sem envolver Git privado nem credenciais.

## Cadeia de build

```text
Dockerfile.web-share
  -> pnpm install --frozen-lockfile --filter @zcode/web-share...
  -> pnpm --filter @zcode/web-share build
  -> nginx static image
```

O `.npmrc` usa `node-linker=hoisted`, e o `--filter` não poda o lockfile achatado; depois que o CUA foi incorporado ao monorepo, o lockfile já não tem origem Git, de modo que a imagem do Share não precisa de git, de BuildKit secret ou de credenciais do Jenkins, e também não precisa de `packages/zcode-cua`.

## Aceitação

- O comando de build da imagem do Share não contém secret do CUA.
- O build do Share não acessa nenhum repositório Git.
- `/cn/share`, `/share`, o callback, as fixtures de mock e os caminhos de recursos continuam funcionando.
- As fronteiras de dependências de build do Web completo e do Remote v4 não mudam.
- A página do Share não cria Host, Agent, service nem remote session.