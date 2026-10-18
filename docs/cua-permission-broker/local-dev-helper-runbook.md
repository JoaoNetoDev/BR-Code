# Computer Use Helper local de avaliação (build dev) — Runbook

> Esta nota registra os fatos-chave relacionados ao build do Helper dev. O script de build do
> dev Helper (`scripts/build-cua-helper-app.mjs`) e a ferramenta de identidade de assinatura estável
> (`scripts/ensure-cua-helper-dev-identity.mjs`) estão ambos neste repositório (z-code); o repo
> producer (zcode-cua) tem notas do lado de avaliação em `docs/cua-permission-broker/`.

## Autorização TCC estável (configuração única, elimina reautorização a cada rebuild)

**Problema**: após cada rebuild do dev Helper o CDHash muda, o macOS o trata como um app novo e
exige conceder novamente Accessibility + Screen Recording — durante o desenvolvimento iterativo é
preciso autorizar manualmente a cada rodada, o que atrapalha muito a velocidade.

**Solução** (`scripts/ensure-cua-helper-dev-identity.mjs` no repo z-code): criar uma única vez o
certificado autoassinado `zcode-cua-helper-dev` e armazená-lo no login keychain; a partir daí todos os
dev Helpers são assinados com ele → o designated requirement é ancorado na chave pública do
certificado (estável) e não no CDHash → **a autorização TCC persiste entre rebuilds**.

**Fluxo padrão** (nova máquina / primeira vez):

```bash
# ⚠️必须在本地 GUI 终端（Terminal/ghostty）跑，SSH 会话会被 macOS 拒绝
#    （"User interaction is not allowed"——keychain 写操作要求 GUI audit session）
cd <z-code 仓> && node scripts/ensure-cua-helper-dev-identity.mjs
# 弹出信任对话框时点「始终信任」。之后 rebuild 永远不再弹 TCC 授权。
```

**Fluxo de colaboração em sessões SSH/agente** (consolidado em 2026-08-16):

1. Qualquer sessão (inclusive SSH) roda uma vez `node scripts/ensure-cua-helper-dev-identity.mjs` —
   ele gera e **persiste** a chave em `~/.zcode/cua-helper-dev-identity/`, depois o import falha e dá
   instruções precisas (`import_needs_gui_session`).
2. O usuário roda em um **terminal GUI local** `node scripts/ensure-cua-helper-dev-identity.mjs --reimport` — reutiliza a mesma chave persistida no passo 1 (não gera outra), completando o import + trust.
3. Depois disso `pnpm build:cua-helper:dev` (= `build-cua-helper-app.mjs --allow-unsigned-launcher-local-dev`) assina automaticamente com a identidade estável; a saída do build não mostra mais
   o aviso de adhoc. Atenção: `pnpm build:cua-helper` puro, sem a dev flag, segue o caminho de
   artefato release (empacotamento temporário adhoc, re-assinado depois com Developer ID) e não usa a dev
   identity.

**Proteções** (consolidadas em conjunto):

- O script de build, por padrão, **recusa produzir** um build dev adhoc quando a assinatura com a dev identity estável falha (ele sugere
  usar o comando de correção pontual); se for realmente necessário um adhoc temporário, defina explicitamente `ZCODE_CUA_HELPER_ALLOW_ADHOC=1`
  (o script imprime junto o aviso de que a autorização TCC não será preservada).
- `ZCODE_CUA_ADDON_PATH=<producer>/build/Release/ax_native.node` permite que o addon recém-construído
  do worktree do producer entre direto no pacote do helper — caso contrário o build usa silenciosamente o
  **addon antigo** do `node_modules` do consumer (compilado pelo commit fixado), a correção nativa do
  producer não entra no pacote de jeito nenhum, e só se descobre isso depois de gastar uma rodada
  inteira de autorização TCC (problema realmente encontrado em 2026-08-16).

## Módulo nativo: sharp já foi corretamente empacotado no dev Helper (wave-10)

O dev Helper agora armazena o prebuild nativo do `sharp` em
`ZCode Computer Use Dev.app/Contents/Resources/node_modules/` (espelhando a abordagem do lado do produto em D-018).
O pipeline de functionalities RGBA→resize→JPEG já foi verificado com sucesso em uma máquina real:
`require('sharp')` retorna uma function.

- Script de correção: `scripts/build-cua-helper-app.mjs` (repo z-code-toolset).
- Sintoma anterior: dentro do dev Helper o `require('sharp')` falhava e o backend de screenshot não conseguia fazer resize / codificação.
- Critério de verificação: teste real da wave-10, o pipeline funcional RGBA→resize→JPEG passou.

> Contexto histórico: o lado do produto em D-018 (commit `f811c910fd`, `fix(desktop): package sharp into ZCode.app for product CUA server`) já havia empacotado o sharp no Helper de produto; a wave-10
> adicionou a mesma lógica de staging ao script de build do dev Helper, eliminando a diferença entre
> dev / produto no que diz respeito ao sharp.