# Error Boundaries da UI

As error boundaries de React do ZCode são divididas em duas camadas:

- `AppErrorBoundary` de nível raiz: cobre falhas de inicialização, de Provider e de nível Root, evitando que a janela inteira fique branca.
- `ScopedErrorBoundary` local: isola regiões como sidebar, header, chat, terminal, side pane e settings layer dentro de um workspace, por domínio de falha.

## Escopo de isolamento

As boundaries locais devem ser posicionadas preferencialmente dentro de contêineres de layout estáveis, evitando que o fallback quebre componentes estruturais como `ResizablePanelGroup`. Por exemplo, as boundaries de terminal e side pane ficam na camada de conteúdo de cada `ResizablePanel`, em vez de envolver o panel inteiro.

## Reset Key

Quando envolver isolamento de nível de workspace, use uniformemente:

```ts
const workspaceKey = workspaceIdentity?.trim() || workspacePath;
```

Cada região acrescenta sua própria key de contexto:

- chat: `workspaceKey + activeTaskId`
- side pane: `workspaceKey + activeTabId`
- terminal/sidebar: `workspaceKey`

Dessa forma o workspace remoto é isolado por identidade, enquanto o workspace local continua recorrendo ao caminho real.

## Logs

As boundaries locais registram logs de nível `error` uniformemente por meio de `packages/ui/src/logger.ts`, e o log inclui o `scope` e o component stack do React. Erros assíncronos em callbacks de evento, Promises e stream handlers não são capturados pela Error Boundary do React e ainda precisam ser tratados explicitamente no hook correspondente ou no ponto de chamada.