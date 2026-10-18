# Migração Multi-alvo OSS/CDN

## Contexto

A versão atual do repositório já é `3.1.2`, portanto a versão ponte da migração de CDN/OSS começa em `3.1.3`. Versões antigas já instaladas leem sempre o generic stable feed gravado no `app-update.yml` dentro do pacote, então o stable feed do CDN antigo não pode ser desativado antes da versão ponte.

## Modelo de Variáveis no CI

A troca da migração é feita somente por variáveis de ambiente do CI:

```bash
CDN_DOMAIN=cdn-zcode.z.ai,cdn.zcode-ai.com,cdn.codegeex.cn
OSS_BUCKET=new-bucket,old-bucket-a,old-bucket-b
OSS_PATH_PREFIX=zcode/electron/releases
OSS_CONFIG_FILE=/etc/ossutil/new,/etc/ossutil/old-a,/etc/ossutil/old-b
```

- `CDN_DOMAIN` aceita uma lista separada por vírgulas; o primeiro item é o domínio principal gravado no cliente no build e usado pela release API.
- `OSS_BUCKET` aceita uma lista separada por vírgulas; precisa ser um único valor ou ter a mesma quantidade de `CDN_DOMAIN`.
- `OSS_PATH_PREFIX` aceita reuso de valor único; se houver vários valores, também precisa ter a mesma quantidade de `CDN_DOMAIN`.
- `OSS_CONFIG_FILE` é opcional, aceita reuso de valor único ou a mesma quantidade de `CDN_DOMAIN`; quando configurado, cada grupo de upload OSS usa o arquivo de configuração ossutil correspondente, o que facilita o uso de AK/SK e region diferentes entre OSS antigo e novo.
- Quando as quantidades não batem, o CI precisa falhar, para evitar gravar no bucket ou caminho errados.

## Fluxo de Versões

### 3.1.2

Versão já publicada, sem novas alterações. O CDN/OSS antigo continua mantendo o stable feed, os instaladores, o blockmap, o `manifest-*.json` e o `components/**`.

### 3.1.3 versão ponte

Configura três grupos de alvos:

```bash
CDN_DOMAIN=cdn-zcode.z.ai,cdn.zcode-ai.com,cdn.codegeex.cn
OSS_BUCKET=new-bucket,old-bucket-a,old-bucket-b
OSS_CONFIG_FILE=/etc/ossutil/new,/etc/ossutil/old-a,/etc/ossutil/old-b
```

O CI envia os artefatos completos da `3.1.3` para os três grupos de OSS/CDN e, após o publish bem-sucedido, sobrescreve os três stable feeds. O cliente antigo `3.1.2` continua atualizando do feed antigo para a `3.1.3`; o cliente `3.1.3` já atualizado traz embutido o domínio principal `cdn-zcode.z.ai` e passa a usar o novo CDN.

### 3.1.4 troca para o novo

Configura um único grupo de alvos:

```bash
CDN_DOMAIN=cdn-zcode.z.ai
OSS_BUCKET=new-bucket
OSS_CONFIG_FILE=/etc/ossutil/new
```

A partir da `3.1.4` só o novo OSS/CDN recebe upload. O CDN antigo mantém o stable feed da `3.1.3` por um período, como rede de segurança para usuários da `3.1.2` que não iniciam o app há muito tempo.

## Conteúdo Enviado por Alvo

Cada grupo `{domain, bucket, pathPrefix}` precisa ter os artefatos completos:

```text
oss://<bucket>/<pathPrefix>/<version>/
  ZCode-...
  latest.yml
  manifest-*.json

oss://<bucket>/<pathPrefix>/components/**

oss://<bucket>/<pathPrefix>/update/<platform>/<arch>/
  updater package
  *.blockmap
```

O manifesto de atualização dentro dos diretórios de plataforma versionados é nomeado uniformemente `latest.yml`, e os logs multilíngue ficam em `releaseNotesByLocale`; o fluxo de publicação atual não sobrescreve mais o stable feed antigo. O `manifest-*.json` precisa entrar no diretório da versão.

## Verificação

- Os branches `ci*` validam primeiro o upload para os três alvos, o preheat e o publish.
- Validar manualmente a atualização `3.1.2 -> 3.1.3` a partir do feed antigo.
- Validar manualmente a atualização `3.1.3 -> 3.1.4` a partir do novo feed.
- Validar que o remote runtime consegue baixar o `manifest-*.json` e o `components/**` nos três CDNs.