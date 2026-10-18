# Limite de Carregamento da Skill Visualize no CLI

## Comportamento

O plugin embutido `visualize@zcode-plugins-official` oferece visualizações interativas dentro da conversa; um terminal comum não tem o host correspondente.
Entradas que não sejam `--stdio` (TUI, `-p` / `--prompt` / `--target`, `skills list/inspect`) não injetam por padrão a raiz de skills desse plugin, e o diretório de skills disponível para o modelo e o carregamento do corpo da Skill usam o mesmo resultado de descoberta.
Mesmo que `-p` use `--surface desktop` para simular a superfície de apresentação, a skill não é habilitada automaticamente.

A entrada de protocolo `--stdio` passa explicitamente `includeVisualize: true` ao criar o App e ao varrer os diretórios de skills draft.
Essa é uma opção de montagem interna do bootstrap, e não um campo de configuração do usuário, variável de ambiente ou requisição de protocolo; o padrão é desligado.
Ela é independente do rollout da presentation surface do Desktop context e preserva o comportamento de carregamento do lado de protocolo já existente.
Se o usuário desabilitar o plugin, desabilitar a skill ou desinstalar o plugin embutido, a skill continua sem poder ser carregada, e essa opção não pode sobrescrever a configuração do usuário.

## Cadeia única de descoberta

```text
CLI comum ── includeVisualize ausente ──┐
                                        ├─ filtro da raiz de skills do plugin oficial → descoberta de skills / carregamento de Skill
host de protocolo ─ includeVisualize=true ─┘                              ├─ diretório da sessão principal
                                                                  └─ herdado pelo workflow child
diretório de drafts do protocolo ─ includeVisualize=true → mesmo filtro → diretórios referenciados
```

A filtragem é feita apenas pela identidade do plugin oficial, preservando outros plugins e skills customizadas de usuário/projeto com o mesmo nome.
O diretório do marketplace de plugins, o seed de cache, os registros de instalação e a configuração de enable/disable não mudam; `plugins list` continua podendo gerenciar esse plugin.
A filtragem acontece quando o App resolve a raiz de skills do plugin na inicialização, e a sessão principal e o workflow child usam o mesmo resultado;
subagents comuns continuam herdando a porta de skills da sessão pai. Sessões restauradas são remontadas igualmente conforme a entrada de inicialização atual.

Workspaces locais do Desktop e workspaces SSH/WSL/Docker anexados continuam passando pelo protocolo stdio; o `/remote` do celular
reutiliza o mesmo shared host. Esta mudança não altera workspace identity, owner/lease, filas, fluxo de eventos,
snapshot ou lógica de restauração; os limites de desktop continuous e mobile replayable permanecem iguais.

## Verificação

- Com o padrão ou desligamento explícito, o diretório oficial de skills não tem o visualize embutido, e tanto o carregamento por nome quanto por nome qualificado reporta inexistente.
- Com o protocolo habilitado, a skill pode ser descoberta e lida por completo; a configuração de desativação do usuário continua valendo.
- A inicialização da sessão principal e o workflow child compartilham a raiz filtrada, e as outras skills embutidas continuam disponíveis.
- A montagem do App por protocolo e o diretório de drafts preservam o visualize; skills de mesmo nome em projetos comuns não são afetadas.
- Compilar o CLI de verdade e verificar o list/inspect fora do stdio e as requisições de diretório de skills via stdio.
- Nenhuma mudança na interação do Renderer nem no schema de protocolo; o limite de carregamento é verificado com integração de CLI/protocolo, sem novo E2E de UI.