# Diretório de runtime de desenvolvimento do Desktop

## Regras e responsável

- O script de inicialização de desenvolvimento no macOS `packages/desktop/scripts/dev.mjs` define `.zcode-runtime/desktop-dev`, na raiz do repositório, como o diretório da cópia de desenvolvimento do Electron.
- `prepareDevElectronAppBundle` recebe o diretório pelo parâmetro `runtimeRoot` já existente e é responsável por criar, validar e reutilizar `<Versão do Electron>-<Arquitetura>/ZCode Dev.app`.
- A cópia preserva a identidade atual do aplicativo e a declaração do protocolo `zcode`; a lógica de inicialização no Windows, no Linux e nas versões empacotadas não muda.
- `.zcode-runtime/` é um artefato local reconstruível e deve ser ignorado pelo `.gitignore`.

## Trocas e limites de falha

O script de inicialização usa apenas o novo diretório e não migra nem remove caches antigos automaticamente. Quando o novo diretório não existe, a função de preparação existente cria a cópia; se a criação falhar, mantém-se o comportamento existente de propagação do erro, sem recorrer ao diretório antigo.

## Aceitação

1. O diretório informado pelo script de inicialização é o mesmo que está no `.gitignore`.
2. Os caminhos continuam isolados por versão do Electron e arquitetura, e a lógica de reutilização de cache e de declaração de protocolo da função de preparação permanece inalterada.
3. Aprovado na verificação de sintaxe do script, na verificação de tipos, no lint e na verificação de arquitetura.