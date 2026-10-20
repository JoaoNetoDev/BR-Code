# Computer Use Helper local de avaliação (build dev) — Runbook

> Esta nota registra os fatos principais relacionados ao build do Helper dev. Os scripts
> de build do Helper dev, o empacotamento SEA e o fluxo de persistência do TCC estão no
> repositório z-code-toolset — o fluxo completo está em
> `docs/refactor-port-specs/DEV-HELPER-TCC-RUNBOOK.md` e em
> `docs/cua-permission-broker/` do z-code-toolset. Este arquivo registra apenas as
> mudanças relevantes visíveis entre repositórios e que afetam a avaliação.

## Autorização TCC estável (configuração única, elimina a reautorização a cada rebuild)

**Problema**: após cada rebuild do Helper dev o CDHash muda, o macOS o trata como um
app novo e exige conceder novamente Accessibility + Screen Recording — durante a
iteração de desenvolvimento é preciso autorizar manualmente a cada rodada, o que
atrasa muito o trabalho.

**Solução** (no repositório z-code, `scripts/ensure-cua-helper-dev-identity.mjs`):
criar uma vez o certificado autoassinado `zcode-cua-helper-dev` e armazená-lo no
login keychain; a partir daí todos os Helpers dev são assinados com ele → o
designated requirement passa a ancorar na chave pública do certificado (estável) e
não no CDHash → **a autorização TCC persiste entre rebuilds**.

**Fluxo padrão** (máquina nova / primeira vez):

```bash
# ⚠️ Precisa ser executado em um terminal GUI local (Terminal/ghostty); sessões SSH são rejeitadas pelo macOS
#    ("User interaction is not allowed" — a escrita no keychain exige uma GUI audit session)
cd <z-code 仓> && node scripts/ensure-cua-helper-dev-identity.mjs
# Ao aparecer a caixa de diálogo de confiança, clique em «Sempre confiar». Depois disso,
# nenhum rebuild exibe novamente a autorização TCC.
```

**Fluxo de colaboração em sessões SSH/agent** (consolidado em 2026-08-16):

1. Qualquer sessão (inclusive SSH) executa uma vez `node scripts/ensure-cua-helper-dev-identity.mjs` —
   ela gera e **persiste** a chave em `~/.zcode/cua-helper-dev-identity/`, depois o import
   falha e são dadas instruções precisas (`import_needs_gui_session`).
2. O usuário executa em um **terminal GUI local** `node scripts/ensure-cua-helper-dev-identity.mjs
   --reimport` — reutiliza a mesma chave persistida no passo 1 (não gera outra), concluindo
   o import + trust.
3. Depois disso, `pnpm build:cua-helper` assina automaticamente com a identidade estável; a
   saída do build não mostra mais o aviso de adhoc.

**Proteções** (consolidadas junto):
- o script de build imprime um aviso destacado em amarelo quando volta para a assinatura
  adhoc (explicando as consequências para o TCC e o comando de correção pontual); os
  testes podem silenciá-lo com `ZCODE_CUA_HELPER_QUIET_ADHOC=1`.
- `ZCODE_CUA_ADDON_PATH=<producer>/build/Release/ax_native.node` permite que o addon
  recém-compilado no worktree do producer entre direto no pacote do helper — caso
  contrário o build usa silenciosamente o **addon antigo** em `node_modules` do consumer
  (compilado pelo commit fixado), a correção nativa do producer nunca entra no pacote e
  só se descobre depois de perder uma rodada inteira de autorização TCC (problema real
  em 2026-08-16).

## Módulo nativo: o sharp já foi empacotado corretamente no Helper dev (wave-10)

O Helper dev agora armazena o prebuild nativo do `sharp` em
`ZCode Computer Use.app/Contents/Resources/node_modules/` (espelhando a abordagem do lado do
produto em D-018). `require('sharp')` retorna uma function; o pipeline funcional
RGBA→resize→JPEG foi verificado em máquina real.

- Script de correção: `scripts/build-cua-helper-app.mjs` (repositório z-code-toolset).
- Sintoma anterior: dentro do Helper dev, `require('sharp')` falhava e o backend de
  captura de tela não conseguia executar resize / codificação.
- Critério de verificação: teste em máquina real da wave-10, pipeline funcional
  RGBA→resize→JPEG aprovado.

> Contexto histórico: do lado do produto, D-018 (commit `f811c910fd`, `fix(desktop): package sharp into
> ZCode.app for product CUA server`) já empacotou o sharp no Helper do produto; a wave-10
> adicionou a mesma lógica de staging ao script de build do Helper dev, eliminando a
> diferença entre dev e produto no que se refere ao sharp.
