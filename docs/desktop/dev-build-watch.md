# Escopo do watcher de build de desenvolvimento do Desktop

## Contexto

`pnpm dev:desktop` executa Vite e tsup watch em paralelo antes de iniciar o Electron. O diretório
do pacote Desktop também contém artefatos gerados como cache de E2E, mock CDN remoto, Agents
embutidos e CUA Helper local; esses conteúdos não são código-fonte de desenvolvimento em
TypeScript, mas são varridos pelo `tsup --watch` padrão (watch path `.`).

Quando esses diretórios gerados são muito grandes, o marcador de build de main/host demora a
aparecer e o `dev.mjs` só consegue continuar emitindo `Waiting for build artifacts`. Essa mensagem
de log é um estado de espera, não um erro do próprio Electron.

## Objetivo

O watch de desenvolvimento desktop deve observar apenas o código-fonte e as dependências que
disparam reconstrução de main/host/preload/scheduler, excluindo os diretórios gerados que não
participam da atualização incremental do build de desenvolvimento, encurtando o primeiro
startup e o tempo de estabelecimento do watcher. É necessário restringir também o watch root;
apenas definir `--ignore-watch` ainda faz o tsup fazer um glob completo de `.` antes, o que não
resolve o custo da primeira varredura.

A cadeia de startup permanece inalterada:

```text
dev:runtime
  +--> vite dev
  +--> tsup --watch + blacklist de diretórios gerados
  `--> dev.mjs
          `--> aguardar marcadores de main/host/preload e então iniciar o Electron
```

## Blacklist

Os caminhos a seguir são relativos a `packages/desktop` e servem apenas para exclusão do watcher de
desenvolvimento local, sem alterar build, empacotamento ou preparação de recursos de runtime:

- `mock-cdn/**`
- `bundled-agents/**`
- `.e2e-cache/**`
- `.e2e-artifacts/**`
- `.e2e-home-*/**` (home isolado de E2E)
- `dist-cua-helper/**`

Esses diretórios podem continuar sendo escritos pelos fluxos de E2E, Helper ou runtime asset; as
escritas não disparam reconstrução do bundle Desktop. `out`, `.git` e `node_modules` continuam
usando as regras de exclusão padrão do tsup.

O watch root cobre explicitamente `packages/desktop/src` e os diretórios `src` de `services`,
`server`, `shared`, `rpc`, `client`, `provider` e `provider-node`, mantendo as mudanças de código do
workspace capazes de disparar reconstruções.

## Restrições

1. `dev:runtime` e `dev:local-cli` usam o mesmo watch root e blacklist, evitando divergência de
   comportamento entre o caminho de startup do desktop padrão e do local-cli de controle remoto.
2. Apenas o escopo de escuta do chokidar muda; entry points do tsup, diretório de saída, ready
   marker e o gate de startup do Electron não mudam.
3. O blacklist deve usar a forma de glob e ser citado no shell, evitando que `*` seja expandido
   antecipadamente pelo shell hospedeiro.
4. Após a alteração, a capacidade de disparar build por mudanças de código do workspace deve
   continuar; se futuramente o código-fonte de dependências sair do escopo padrão de watch,
   o source path correspondente deve ser adicionado explicitamente e este spec atualizado.

## Aceitação

- As duas entradas de watch do Desktop nos package scripts contêm a blacklist completa.
- Os testes estáticos relacionados passam.
- O log do `tsup --watch` mostra cada caminho da blacklist aparecendo em `Ignoring changes`.
- Em um checkout que contenha diretórios gerados de grande volume, o watcher não fica mais
  bloqueado pela varredura desses diretários até o ready marker.
- `pnpm typecheck`, `pnpm lint` e os testes unitários afetados passam.