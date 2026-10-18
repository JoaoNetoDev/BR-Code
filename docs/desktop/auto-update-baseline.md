# Baseline temporário de atualização automática (solução histórica)

## Situação atual

Por padrão, o desktop verifica atualizações de pacotes novos pela interface de manifest do servidor. Quando o CI envia
artefatos para o OSS, escreve apenas produtos estáticos versionados:

```text
<path-prefix>/<version>/macos-arm64/
<path-prefix>/<version>/macos-x64/
<path-prefix>/<version>/windows-x64/
<path-prefix>/<version>/windows-arm64/
<path-prefix>/<version>/linux-x64/
<path-prefix>/<version>/linux-arm64/
```

Dentro dos diretórios versionados de plataforma/arquitetura são enviados uniformemente o `latest.yml` com logs multilíngue,
o pacote de instalação e o `.blockmap`. O electron-builder tem `detectUpdateChannel: false` fixo na configuração e, inclusive
para prerelease, gera um `latest.yml` unificado; o canal de publicação é determinado pelo manifest do servidor. A publicação
gradual e a completa são controladas apenas por `status=3` / `status=1` da release API: o CI não sobrescreve mais feeds
stable como `/update` ou `/update-insider`, e o switch de publicação `ZCODE_STABLE_UPDATE_FEED_ROOTS` não é mais suportado.

## Contexto histórico

Versões antigas do desktop dependiam do generic feed do electron-updater. Pacotes antigos já instalados lêem
fixamente o generic stable feed gravado no `app-update.yml` dentro do pacote; por exemplo, o feed principal do macOS
arm64 era:

```text
https://${CDN_DOMAIN}/${OSS_PATH_PREFIX}/update/mac/arm64/latest-mac.yml
```

Na época, para evitar que pacotes antigos `2.0.0` fossem promovidos diretamente para `3.0.x`, era usado
`/update-insider/<platform>/<arch>/` como feed baseline temporário, e o tráfego era redirecionado sobrescrevendo um ou
mais feeds na etapa de publicação.

Esse mecanismo foi removido do fluxo principal atual do CI. Se ainda for necessário compatibilizar pacotes antigos, use uma
ação de publicação de emergência separada ou o procedimento operacional de feeds antigos; não dependa da atualização
automática de feeds pelo release pipeline atual.

## Solução substituta atual

- Novo cliente: usa `GET /api/v1/releases/electron/manifest`, e o servidor retorna a versão stable ou preview conforme `platform`, `device_mid` e `channel`.
- Publicação gradual: a etapa publish do CI envia `status=3`, e o servidor decide pela política de `device_mid` se retorna a versão preview.
- Publicação completa: a etapa promote do CI envia `status=1`, e o manifest stable do servidor retorna o mesmo conjunto de arquivos versionados da CDN.
- Feed generic antigo: mantido apenas como entrada de diagnóstico, emergência ou compatibilidade histórica; não é enviado automaticamente pelo CI atual.