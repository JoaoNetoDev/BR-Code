# Importação de Providers no Settings Sync

Ao importar a categoria `providers`, o `settings-sync` escreve em dois encadeamentos ao mesmo tempo:

1. Espelho de configuração de runtime
2. A fonte de dados de `模型供应商` (fornecedores de modelo) da página de Settings, `~/.zcode/v2/model-providers.json`

## Estratégia de importação

- Importar apenas o que estiver ausente, sem sobrescrever providers existentes.
- A configuração de runtime continua sendo gravada no formato nativo de cada agent, nos respectivos diretórios de config de cada workspace.
- Só são importados para a página de Settings os providers “personalizados atualmente reconhecíveis”.

## Escopo de mapeamento atual

### Claude Code

- Lido de `settings.json`:
  - `env.ANTHROPIC_BASE_URL`
  - `env.ANTHROPIC_AUTH_TOKEN` / `env.ANTHROPIC_API_KEY`
  - `model`
  - envs relacionados ao mapeamento dos slots do Claude
- Se faltar um endpoint ou uma apiKey customizada, nenhum provider é gerado na página de Settings.

### Codex

- Lê-se o `model_provider` atual de `config.toml`.
- Só a provider table atualmente selecionada é importada.
- Lê-se `OPENAI_API_KEY` de `auth.json`.

### OpenCode

- O provider key é deduzido a partir do `model` atual de `opencode.json`.
- Só o provider atualmente selecionado é importado.
- O provider da página de Settings é gerado a partir de `options.baseURL` / `options.apiKey` e de `models` do provider.

## Regras de deduplicação

Basta que qualquer um dos casos abaixo seja atendido para considerar que o item já existe:

- id de provider igual
- configuração central (endpoint / apiKey / models / mapping / supportedFormats) totalmente idêntica

Dessa forma evita-se a importação duplicada e também evita sobrescrever providers que o usuário já ajustou manualmente na página de Settings.