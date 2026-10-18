# Spec de metadados de exibição do aplicativo alvo do CUA

## Objetivo

O cartão de ferramenta do CUA precisa exibir o ícone do aplicativo alvo real, mas o modelo não precisa — nem se garante que envie — novamente o `bundle_id`. O aplicativo alvo precisa ser resolvido pelo official CUA runtime a partir do `state_id`, `frame_id`, `app_ref` ou resposta do Helper já verificados nesta chamada e, em seguida, projetado ao ZCode UI por meio de metadados de resultado dedicados ao host.

Essa capacidade altera apenas a projeção de exibição; não altera os nomes, os schemas de entrada, os resultados visíveis ao modelo, as permissões, os efeitos colaterais, as proteções de owner/stale ou a semântica de delivery-state dos 30 ferramentas CUA.

Na publicação, o catalog pin do ZCode, o official plugin wrapper, o plugin manifest e a official plugin definition precisam estar alinhados entre si ao `zcode-cua@0.5.8`, que já contém esta capacidade. Atualizar apenas o SHA da dependência mantendo a versão antiga do wrapper deixa o bundle de desenvolvimento utilizável, enquanto o caminho de cache do plugin oficial continua caindo na versão antiga; a verificação de consistência de versão precisa impedir esse estado de meia atualização.

Quando `open_application(activate=false)` usa um neutral shortcut para um aplicativo já em execução, a identidade autoritativa de exibição também precisa ser completada pelo `application_info({pid})` do Helper; não se pode recorrer ao bundle id da entrada do modelo só porque a ação não foi reenviada.

## Resolução autoritativa e fronteira de confiança

```text
model input
  state_id / frame_id / app_ref(pid|bundle_id|name)
        |
        v
official zcode-cua invocation context
  session / frame registry / Helper application_info / capture result
        |
        v
MCP CallToolResult._meta["zcode.cua/target-app-display-v1"]
        |
        v
official CUA authority gate in Core
        |
        v
CuaToolResultDisplay.targetApp -> Desktop platform icon adapter
```

- O Renderer e o Desktop main são proibidos de fazer lookup de aplicação por PID. O PID pertence ao Helper/runtime que executa o CUA e, em cenários de remote/shared-host, não é possível assumir que ele esteja na mesma máquina ou no mesmo namespace que o processo de UI.
- O Core só aceita metadados de resultado MCP que já passaram pela validação de official CUA authority. Servers ou tools de terceiros com o mesmo nome não recebem essa capacidade de exibição.
- O `bundle_id` da entrada do modelo só pode servir como referência a ser verificada pelo Helper, nunca como identidade de exibição direta.
- A identidade autoritativa do aplicativo obtida na primeira chamada trava o contexto de exibição. Observações de settle posteriores só podem complementar o mesmo aplicativo; em caso de conflito de identidade, o aplicativo alvo não é projetado e a UI recorre ao ícone genérico do CUA.

## Contrato de metadados do Producer

`zcode-cua` anexa isto depois de concluído o wrapper unificado de tool:

```ts
type CuaTargetAppDisplayMetaV1 = {
  schemaVersion: 1;
  displayName?: string;
  iconLocators: Array<
    | { kind: "darwin-bundle-id"; value: string }
    | { kind: "windows-executable-path"; value: string }
    | { kind: "windows-aumid"; value: string }
  >;
};
```

- `iconLocators` é ordenado por prioridade, com no máximo três entradas; em caso de conflito de identidade, pode-se manter o primeiro nome autoritativo, mas é obrigatório limpar os locators para que a UI use o ícone genérico.
- No macOS, usa-se o bundle id capturado pelo Helper.
- Em aplicativos comuns do Windows, usa-se o caminho absoluto canônico do exe. Quando a janela tem um AUMID válido, o AUMID tem prioridade; `ApplicationFrameHost.exe` não pode servir como icon locator após a falha do AUMID.
- No Linux, esta etapa não gera locator.
- Ferramentas globais (acesso, cartões de list_apps, display, cursor, clipboard, wait, stop e capturas de tela em tela cheia sem app owner) não geram target metadata.
- Quando um frame com escopo de app gera um frame filho por meio de `zoom`, ele precisa herdar a identidade completa do aplicativo (nome, PID, bundle id, AUMID e icon locator) e continuar projetando o mesmo target metadata no resultado do próprio `zoom` e nas ferramentas de coordenadas seguintes; frames globais sem app owner e seus frames filhos precisam permanecer sem alvo.
- `_meta` não entra no tool result visível ao provider; os metadados existentes de frame-integrity precisam ser preservados.

## Core, persistência e UI

- `CuaToolResultDisplayPayload` mantém `schemaVersion: 1` e ganha o novo opcional `targetApp: { displayName?: string; iconLocators: ApplicationIconLocator[] }`. Registros antigos não precisam de migração.
- O `tool_call_result` ao vivo e os metadados de parte de tool concluída usam o mesmo display limitado; a hidratação de resume/cold consome diretamente o campo persistido, sem analisar texto visível ao modelo.
- Desktop continuous e Web Remote replayable reutilizam a mesma row V4; relay/main não ganha task, queue, snapshot nem estado de recuperação.
- A ordem de obtenção do ícone no cartão CUA é: structured `display.targetApp`, input antigo, JSON result antigo e ícone genérico do CUA. Não é adicionada análise de linhas de texto comuns no formato `app:`.
- `IPlatformService.getApplicationIcon` aceita uma requisição de locator estruturada e, ao mesmo tempo, preserva a entrada de compatibilidade por string. No macOS a resolução do bundle continua igual; no Windows o exe usa o `app.getFileIcon` do Electron, e o AUMID é lido pelo Desktop através da identidade `AppsFolder` do Windows Shell.
- Web, celular e Linux, sem resolver nativo, retornam `null` e exibem o ícone genérico.

## Falhas e segurança

- O locator precisa passar pelo schema do runtime. Bundle Darwin, AUMID do Windows e caminho absoluto de exe do Windows são validados separadamente; o exe do Windows só aceita caminho absoluto de letra de unidade fixa da própria máquina, e UNC, caminhos de dispositivo, caminhos relativos e strings legadas não podem entrar em `app.getFileIcon`. Valores ilegais, muito longos ou de origem não oficial são ignorados.
- Falha ao ler o ícone não altera o status de sucesso da tool nem retorna erro ao modelo; o Desktop registra apenas warn limitado e usa cache por locator para evitar logs de alta frequência e I/O repetido.
- Resultados de ícone assíncronos não podem ser gravados de volta depois que o componente foi desmontado ou que o locator mudou.

## Testes

- Producer: PID-only, state_id, frame_id, return_state=none, conflito, isolamento de concorrência, ferramentas globais, herança de identidade de zoom em frames app-scoped/global, coexistência dos metadados de frame-integrity e conteúdo do modelo inalterado.
- Core/contracts: projeção de official authority, rejeição de terceiros, schemas de display novo e antigo, round-trip de persistência/V4.
- UI/Desktop: prioridade de metadados estruturados, fallback legado, segurança no desmonte, cache, validação de locator, adapter de bundle no macOS, exe no Windows e AUMID.
- O smoke test em máquina real do Windows cobre aplicativos Win32 comuns e o aplicativo da loja Calculator; o smoke test do macOS cobre o Calculator. Smoke tests de Windows native que não puderem ser executados na máquina atual precisam ser listados na descrição do commit.

## Revisão de 2026-09-17: troca de chave no producer + caminho de consumo pelo node_repl

O `zcode.cua/target-app-display-v1` descrito acima neste documento foi substituído pelo producer em 2026-08-20
(`zcode-cua@2796e8736 feat(cua): own application presentation metadata`) por
`zcode.cua/app-associations-v1`:

```ts
type CuaAppAssociationsV1 = {
  schemaVersion: 1;
  /** 单一目标动作与观察（APP_ASSOCIATION_MODE_BY_TOOL 里声明 "primary" 的工具）。 */
  primary?: { appKey: string; displayName?: string; icon?: { mimeType: "image/png"; data: string } };
  /** list_apps（声明 "items"）：按结果下标关联，携带最多 128 条。 */
  items?: Array<{ resultIndex: number; application: /* 同 primary */ unknown }>;
};
```

- `appKey` substitui `iconLocators`, com o formato `darwin:<bundleId>` / `windows-aumid:<aumid>` / `windows-exe:<canonical path>` / `linux-exe:<path>`; o locator é derivado pelo consumidor a partir do prefixo.
- O producer agora carrega ele mesmo o PNG de ≤32×32 capturado pelo Helper. **O ZCode não projeta esse `icon`**: a convenção de que o protocolo de sessão não transporta data URL permanece inalterada, e o ícone continua sendo resolvido por `IPlatformService.getApplicationIcon(locator)`.
- O lado ZCode nunca implementou o consumo de `target-app-display-v1`; `CuaToolResultDisplay.targetApp` e `iconLocators` ficam sem valor desde 2026-08-20, e o ícone do cartão de ferramenta sempre se apoiou no fallback legado `readBundleId(input) ?? readCuaResultBundleId(result)`. Esse fallback se mantém apenas para sessões históricas.

Depois que o Computer Use migrou para `node_repl`, o salto «official CUA authority gate in Core» deixou de valer
(o nome da ferramenta é sempre `mcp__node_repl__js`, e `readCuaToolName` não casa). O novo encadeamento antecipou o ponto de confiança para o host:

```text
producer _meta["zcode.cua/app-associations-v1"].primary
      |
      v  broker 响应，沙箱不可见
node-repl-host CUA bridge（唯一可信记录点）
      |
      v  NodeReplRunResult.cuaApp
node_repl 结果 _meta["zcode/nodeReplCuaApp"]（宿主独占写入）
      |
      v
Core `node_repl_images.app` -> UI leading icon
```

- O `zcode.cua/app-associations-v1` entregue pelo canal gravável pelo sandbox (`nodeRepl.setResponseMeta`, `nodeRepl.emitStructuredResult`) é descartado sem exceção: essas APIs ficam expostas em globals visíveis ao modelo, senão o modelo poderia fazer o cartão da ferramenta alegar que operou outro aplicativo. O tratamento é o mesmo de `zcode/nodeReplBrowserScreenshotContentIndices`.
- A identidade de server do `node_repl` é gerada pelo host e mesclada por último (`resolveAppRuntimeConfig` preserva a identity embutida), e nem usuário nem terceiros conseguem sequestrá-la com uma configuração de mesmo nome, portanto consumir a chave do host pelo nome desse server no Core é seguro.
- O contrato completo de projeção e exibição está em [`cua-tool-app-identity-summary.md`](cua-tool-app-identity-summary.md), na seção «fontes de identidade na era node_repl».