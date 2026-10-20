# Header de idioma do cliente do endpoint ZCode

## Contexto

O header `X-Client-Language` das requisições ao endpoint ZCode antes era obtido do
`Intl.DateTimeFormat().resolvedOptions().locale` do processo.
Quando o App é iniciado pelo Finder/Dock, o processo não tem `LANG` e o ICU do Node faz fallback para `en-US`; mesmo com `LANG`, ele representa apenas o idioma do sistema,
sem acompanhar a configuração de idioma da interface. Com isso, requisições como `billing/balance` e `client/configs` continuavam enviando `en-US` mesmo com a interface em chinês.

`marketing/touch` não é afetado: a UI passa `useZCodeIntl().locale` como parâmetro ao serviço, e o serviço grava explicitamente esse header,
sobrescrevendo o valor padrão de `NodeApiClient`.

## Owner do estado

O owner do idioma da interface em tempo real é o estado da UI; o Main recebe imediatamente via `SetApplicationLocale` e guarda em
`currentApplicationLocale` (que já é usado por menus, bandeja etc.). O `locale` de `setting.json` serve apenas para restauração após reinício:
a gravação é assíncrona e a falha não bloqueia a UI, portanto não pode ser a origem para requisições em tempo real.

```text
UI locale ──imediatamente──> Main.currentApplicationLocale (owner em tempo real)
   │                  ├─ Requisições do próprio Main: gray release de client/configs, config de ajuda
   │                  ├─ spawn do Host: InitLocal.locale (valor inicial)
   │                  └─ Na troca: envia application-locale-changed para o Host de todas as janelas
   │                        └─ clientLocale em memória no Host ──leitura síncrona──> fonte padrão do header no NodeApiClient
   └─assíncrono, pode falhar──> setting.json (restauração após reinício)
```

## Regras

- O Host apenas lê o valor em memória, sem I/O; a leitura do idioma não afeta o cancelamento nem o timeout das requisições.
- InitLocal e as mensagens de mudança passam pelo mesmo porto do utility process, chegam na ordem de envio, e o valor inicial não sobrescreve mudanças mais recentes.
- Na inicialização o Main primeiro lê o idioma persistido (usando o idioma do sistema quando ausente) e só depois inicia o prewarm do gray release de client/configs;
  a requisição de prewarm não entra no cache de 1 hora carregando o idioma padrão.
- O `X-Client-Language` passado explicitamente pelo chamador continua prevalecendo (o comportamento de `marketing/touch` não muda).
- Sem idioma recebido, há fallback para a regra original do `Intl`, sem bloquear a requisição.
- O `zcode-server` remoto (SSH/WSL/Docker) não recebe injeção e mantém o comportamento original do `Intl`; a sincronização remota será desenhada à parte.

## Cobertura de testes

E2E: `packages/desktop/test/e2e/settings/settings-client-language-header.test.ts`. Usa `x-request-id`
para distinguir as requisições de `client/configs` do Host (`NodeApiClient`) e do Main (Electron `net`).

| Caso   | Cenário                                                                 | Asserção                                                           |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| CLH-01 | Após persistir `en-US` (diferente do padrão de inicialização `zh-CN`), reiniciar o App | Tanto o prewarm de inicialização quanto as requisições do Host carregam `en-US` |
| CLH-02 | O Host da segunda janela falha ao gravar `setting.json`; na página de configurações dessa janela, trocar para `zh-CN` | As novas requisições do Host e do Main das duas janelas carregam `zh-CN`; em disco continua `en-US` |

Restrições que o E2E não consegue segurar de forma estável:

- Valor inicial do InitLocal: na montagem do processo de renderização o idioma é sincronizado com o Main, que depois o repassa ao Host, e as requisições após a montagem não mostram diferença (a modificação inversa já foi medida).
  A cobertura do envio é feita por `desktopWindowLifecycle.test.ts`; a validação das mensagens do Host, por `hostMessagePortGuard.test.ts`.
- Prewarm posterior à leitura do idioma persistido: ainda existem dois `await` antes de o prewarm ler o idioma, e na ordem normal a leitura da inicialização termina antes, sendo a corrida irreproduzível (a modificação inversa já foi medida);
  a garantia está apenas na ordem das chamadas em `main/index.ts`.
- Mudança recebida durante a inicialização do Host: do mesmo modo, é mascarada pela sincronização pós-montagem (inferência, não medida). A ordem é garantida por "a mensagem é atribuída de forma síncrona antes de qualquer `await`".
- Envio apenas ao Host da janela de origem: os processos de renderização das outras janelas também sincronizam o idioma com o Main ao receber difusão, e o comportamento visível ao usuário não muda (inferência, não medida).

## Não coberto

- Requisições originadas pelo `zcode-server` remoto.
- O `offPeakServerClient` faz `fetch` direto e continua usando a regra do `Intl`.
- Roteamento de endpoint de provider do CLI (`apps/zcode-cli`) e download do Built-in standalone.
