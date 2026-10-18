# Plano de Paridade de Background do Bash - Substituído

Este plano inicial foi substituído pelo novo plano de refatoração:

- `docs/superpowers/plans/2026-07-01-bash-background-refactor.md`

Direção final:

- O timeout auto-background do Bash é um caminho de execução próprio do Bash.
- O `run_in_background: true` explícito e o timeout auto-background reutilizam a completion / notification / runtime command queue de background já existente.
- O execution contract público mantém apenas as fronteiras existentes `run`, `start`, `getBackgroundTask`, `cancelBackgroundTask`.
- Não se adiciona nova entrada de operação manual de background, control tool, aviso de 2 segundos na UI nem um segundo mecanismo de wake/notification.