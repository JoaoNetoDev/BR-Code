# Deep link do Desktop Dev

## Status

- Spec de fato atual, data: 2026-09-09.
- Cenário alvo: executar `pnpm dev:desktop:test` e depois clicar em "去 ZCode 继续" na página Share de teste online.
- A página Share online e o protocolo `zcode://share/import` permanecem inalterados.

## Fronteira do Problema

O CTA Share online só consegue gerar o `zcode://share/import?code=...` estável. O tratamento de protocolo no macOS é decidido pelo LaunchServices, que não tem como saber qual terminal iniciou o projeto via pnpm.

Hoje `pnpm dev:desktop:test` inicia diretamente `node_modules/electron/dist/Electron.app`. O `Info.plist` desse bundle Electron cru não tem `CFBundleURLTypes`, então o handler registrado no sistema é `com.github.electron`, e no cold start ou ao entrar por uma URL externa pode aparecer apenas a página padrão do Electron.

## Solução

Preparar um bundle local `ZCode Dev.app` apenas no script de inicialização Dev do macOS:

1. Usando o runtime Electron do checkout atual como fonte, preparar uma cópia em `.codex-runtime/desktop-dev/`.
2. Modificar apenas o `Info.plist` da cópia, gravando:
   - `CFBundleIdentifier=dev.zcode.app.development`;
   - `CFBundleName/CFBundleDisplayName=ZCode Dev`;
   - o scheme `zcode` em `CFBundleURLTypes`.
3. Iniciar a cópia ainda usando o diretório `packages/desktop` como entrada de desenvolvimento do Electron, preservando Vite, HMR, `ELECTRON_RENDERER_URL`, `ZCODE_ENV` e a semântica atual de instance lock única.
4. O main process existente continua chamando `registerDeepLinkProtocol`; como o processo atual agora vem do bundle Dev com a declaração de `zcode`, o LaunchServices registra o bundle Dev, e não o Electron cru.
5. `open-url`, `second-instance`, a entrega do ShareImport e a lógica de persistência da importação permanecem inalteradas.

## Ordem dos Eventos

```text
pnpm dev:desktop:test
  -> dev.mjs 等待 main/host/preload/Vite 就绪
  -> 准备 ZCode Dev.app + Info.plist(zcode)
  -> 从 Dev.app 启动 Electron packages/desktop
  -> main 注册 zcode 默认 handler
  -> 浏览器点击 zcode://share/import?code=...
  -> macOS open-url / second-instance
  -> 现有 Desktop ShareImport 路由
```

## Fronteiras de Execução

- Só o runtime Dev não empacotado do macOS muda; Windows/Linux mantêm o caminho de inicialização atual.
- `pnpm dev:desktop:test` continua usando o endpoint do ambiente de teste; a semântica de endpoint de production de `pnpm dev:desktop` não muda.
- A correção garante o cenário "clicar na página online depois que o Dev já está iniciado". O cold start do macOS com o Dev não iniciado ainda exige um launcher empacotado separado e está fora do escopo desta correção mínima.
- Nada é removido nem sobrescrito em `node_modules/electron`; o `.codex-runtime/` gerado é apenas um artefato local recriável.

## Critérios de Aceitação

1. O log de inicialização de `pnpm dev:desktop:test` registra o caminho do bundle Dev e o sucesso do registro de `zcode`.
2. O handler de `zcode` do LaunchServices no macOS aponta para `dev.zcode.app.development`, e não para `com.github.electron`.
3. A página Share online ainda exibe o CTA original e o href original `zcode://share/import`.
4. Ao clicar no CTA com o Dev em execução, não aparece a página padrão do Electron e a janela Dev existente recebe `ShareImport`.
5. O endpoint do Dev é `https://zcode.z.ai`, e a requisição de importação é consistente com o ambiente da página.
6. Os testes unitários existentes de parser/route de deep link continuam passando.