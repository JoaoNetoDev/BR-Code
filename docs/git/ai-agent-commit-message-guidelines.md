# Convenções de Commit Message para AI Agent

Data de atualização: 2026-09-15

## Escopo de aplicação

Esta convenção se aplica a todas as mensagens de commit e títulos de PR deste projeto que são gerados ou_auxiliados por um AI Agent.

O objetivo é manter a consistência com `Conventional Commits` e tomar como referência o Conventional Commit da documentação do Electron, reduzindo o custo de rastreabilidade histórica e de distribuição de releases.

## Formato básico

O título do commit (primeira linha) precisa usar um prefixo semântico:

```text
<type>(<scope>): <subject>
```

Explicação:

- `<type>`: tipo do commit, obrigatório
- `<scope>`: escopo de impacto, recomendado (como `ui`, `services`, `agent`, `git`)
- `<subject>`: descrição curta do resultado desta mudança, começando em minúscula

Exemplos:

```text
fix(ui): avoid stale workspace path in git pane
feat(services): add provider config file resolver
docs(git): add ai agent commit message guidelines
```

## Convenção de tipos (alinhada aos prefixos semânticos do Electron)

- `fix`: correção de defeito
- `feat`: nova funcionalidade
- `docs`: alteração de documentação
- `test`: acréscimo ou correção de testes
- `build`: alterações relacionadas ao sistema de build
- `ci`: alterações de configuração ou scripts de CI
- `perf`: otimização de performance (sem mudança semântica de funcionalidade)
- `refactor`: refatoração (sem nova funcionalidade e sem correção de defeito)
- `style`: estilo/formatação de código (sem afetar a semântica do código)
- `chore`: manutenção diverse (dependências, scaffolding, limpeza não funcional)

## Regras de título e corpo

Seguindo a convenção do Electron, a mensagem de commit deve atender a:

1. A primeira linha deve ter no máximo cerca de 50 caracteres e nunca mais de 72
2. Deve haver uma linha em branco após a primeira linha
3. O corpo deve quebrar em cerca de 72 colunas
4. A mensagem de commit descreve **o que foi feito + por quê**, e não apenas “quais arquivos foram alterados”

Estrutura de corpo recomendada:

```text
<type>(<scope>): <subject>

Why:
- contexto/problema
- condição de disparo ou impacto no usuário

What:
- solução-chave 1
- solução-chave 2

Risk:
- risco de compatibilidade ou regressão
- validações já feitas (typecheck/lint/test)
```

## Regras específicas para AI Agent

Para garantir que o histórico de commits continue manutenível, o AI Agent precisa obedecer ainda às regras abaixo:

1. Não escrever ruído de processo: não escrever “alterado conforme a instrução”, “corrigido com base na conversa” ou “gerado automaticamente por IA” na commit message.
2. Não escrever um log de ferramentas: não listar “quais comandos foram executados”, a menos que isso constitua valor da mudança (como um script de migração).
3. Um commit expressa apenas uma intenção: evitar misturar “refatoração + nova funcionalidade + ajuste de estilo” em um mesmo commit.
4. Correções de bug devem deixar claros a causa raiz e a estratégia de correção; causas raiz não óbvias devem ficar consistentes com os comentários em chinês dentro do código, sem adicionar comentários duplicados para mudanças óbvias.
5. Tanto o título do PR quanto o título do squash commit final devem usar prefixo semântico

## Regra de Breaking Change

Se for introduzida uma mudança incompatível, use no corpo ou no footer:

```text
BREAKING CHANGE: <impact>
```

Exemplo:

```text
feat(agent): remove legacy provider handshake

BREAKING CHANGE: legacy agent providers before v2 can no longer connect.
```

## Escritas não recomendadas

As escritas abaixo reduzem a legibilidade do histórico e são proibidas:

- `update code`
- `fix bug`
- `修改一下`
- `wip`
- `try fix`

## Checklist antes do commit

Antes de criar o commit, o AI Agent precisa confirmar:

- O título do commit está de acordo com `Conventional Commits`
- O título e o corpo explicam “por que mudar”
- O escopo da mudança é consistente com o `scope`
- As validações necessárias aplicáveis a esta mudança, definidas no [AGENTS.md da raiz](../../AGENTS.md), já passaram; documentação pura segue a checagem de documentação, código segue a checagem de código, e CLI/E2E seguem a validação do seu próprio escopo
- Quando uma validação necessária é bloqueante ou falha, manter as alterações no workspace e não commitar automaticamente; falhas preexistentes e problemas introduzidos nesta rodada devem ser reportados separadamente

## Referências

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Electron Commit Message Guidelines](../electron/docs/development/pull-requests.md#commit-message-guidelines)
- Regras do projeto: [AGENTS.md](../../AGENTS.md)