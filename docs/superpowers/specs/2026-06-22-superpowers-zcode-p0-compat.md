# Especificação de Compatibilidade P0 Superpowers/ZCode

## Contexto

O ZCode já oferece plugins integrados, descoberta de manifestos Claude/Codex, hooks de plugin, ferramenta
Skill e ferramenta de subagent Agent, mas o Superpowers ainda tem duas lacunas de compatibilidade P0:

- A documentação e os testes do Superpowers chamam as skills por `superpowers:<skill>`, enquanto o agent runtime
  do ZCode só faz correspondência exata por `skill.name` sem prefixo, o que torna impossível carregar nomes
  como `superpowers:test-driven-development`.
- O bootstrap `SessionStart` do Superpowers injeta `using-superpowers`, mas seus documentos de skill vêm do
  ecossistema Claude Code e referenciam diretamente nomes de ferramentas do Claude Code, como `Task`; o ZCode
  não pode traduzir nomes de ferramentas apenas anexando texto ao hook do Superpowers — é preciso oferecer
  compatibilidade estruturada nas camadas de registro de ferramentas e hook matcher.

O objetivo é, sem modificar o cache externo de plugins Claude do usuário, fazer com que o Superpowers
integrado e o Superpowers completo em forma `.claude-plugin` alcancem, no mínimo: skills carregáveis por
`superpowers:*` após a habilitação, bootstrap efetivo e execução direta na superfície de ferramentas do ZCode
do agendamento de subagents `Task` mencionado nos documentos de plugins do Claude Code.

## Regra de Skill Alias

Quando o skill root vem de `source: "plugin"`, o agent runtime do ZCode deve deduzir o nome do plugin a partir
do manifest na raiz do plugin e gerar, para cada skill, um alias fully qualified opcional:

```text
<plugin manifest name>:<skill frontmatter name>
```

Por exemplo, para `skills/test-driven-development/SKILL.md` no plugin Superpowers:

- O nome sem prefixo continua sendo `test-driven-development`, preservando a compatibilidade existente.
- O qualified name é `superpowers:test-driven-development`, exposto ao modelo como nome de chamada recomendado.

A ordem de busca do manifest permanece compatível com a descoberta de plugins:

1. `.zcode-plugin/plugin.json`
2. `.claude-plugin/plugin.json`
3. `.codex-plugin/plugin.json`
4. `.cursor-plugin/plugin.json`

A busca sobe de forma limitada a partir do skill root para os diretórios pais, cobrindo o padrão
`plugin/skills/<skill>/SKILL.md` e subpastas de skills customizadas. Quando o manifest não pode ser lido ou
está sem um `name` válido, isso não bloqueia o carregamento da skill: apenas nenhum alias qualified é gerado.

O carregamento de skills deve aceitar tanto o nome sem prefixo quanto o qualified name. A lista de contexto de
skills deve priorizar a exibição do qualified name e observar que o nome sem prefixo continua carregável,
evitando que o modelo, ao ver a documentação do Superpowers, chame um nome inexistente misturando forma com e
sem prefixo.

## Filtro de Skills de Subagent

Se um perfil de subagent customizado declara uma allowlist `skills`, a lógica de filtragem deve reconhecer
tanto o nome sem prefixo quanto o qualified name. Caso contrário, quando o perfil escreve nomes exatos de skill
como `superpowers:*`, o runtime pai consegue carregar a skill, mas o runtime filho é rejeitado pela allowlist.

## Compatibilidade de Ferramentas do Claude Code

O ZCode não deve exigir que o usuário reescreva os documentos de skill ou o `hooks/session-start` de plugins
Claude externos. A camada de compatibilidade fica em dois pontos: o registro de ferramentas e o hook matcher:

- `Task` é registrada como nome de ferramenta compatível com Claude Code, delegando por baixo ao handler de
  subagent `Agent` já existente no ZCode. `Task` e `Agent` usam o mesmo schema de entrada/saída, as mesmas
  capacidades de permissão, o mesmo orçamento de resultado e a mesma semântica de recuperação de tarefas em
  background.
- Quando o runtime não tem subagent port configurado, nem `Agent` nem `Task` podem ser expostas; quando o
  runtime de subagent filho proíbe subagents recursivos, ambas devem ser filtradas.
- O stdin do tool hook continua recebendo o nome real da ferramenta que ocorreu, evitando nomes falsos nos
  rastros; o hook matcher aceita aliases de compatibilidade adicionais. Uma chamada de `Agent` deve atender ao
  matcher `Task`, e uma chamada de `Task` deve atender ao matcher `Agent`.
- Se `ApplyPatch` for reabilitada, o hook matcher pode ser compatível com matchers `Write`/`Edit` no estilo
  Claude Code, mas sem nunca alterar o toolName real.

Assim, a saída do hook `SessionStart` do Superpowers fica responsável apenas por injetar o próprio contexto
`using-superpowers`; o ZCode deixa de acrescentar texto de mapeamento de ferramentas específico do Superpowers.
Outros `.claude-plugin` também podem reutilizar a mesma camada de compatibilidade.

A boundary completa da compatibilidade de subagents está em `docs/subagent-compatibility.md`.

## Validação do Bootstrap SessionStart

Após habilitar o Superpowers, o hook `SessionStart`, ao casar com `startup|clear|compact`, deve:

- Executar o hook do plugin via `CLAUDE_PLUGIN_ROOT` / `ZCODE_PLUGIN_ROOT`.
- Fazer o parse de `hookSpecificOutput.additionalContext`, de `additionalContext` de nível superior ou do
  `additional_context` no estilo Cursor.
- Injetar `using-superpowers` no system reminder do `hook_context` do turno atual.

`resume` não está no matcher padrão do Superpowers, a menos que o manifest do plugin declare esse matcher no
futuro.

## Requisitos de verificação

- O plugin skill root consegue derivar o alias `superpowers:*` a partir de `.claude-plugin/plugin.json`.
- `Skill(skill="superpowers:test-driven-development")` carrega a skill correspondente.
- O contexto de Skills exibe `superpowers:*`.
- A allowlist de skills de subagent reconhece o qualified alias.
- A ferramenta `Task` consegue agendar um subagent do ZCode como alias compatível com Claude Code.
- Os aliases de hook matcher de `Task` e `Agent` interoperam, mas o hook input preserva o toolName real.
- O additional context do `SessionStart` do Superpowers não acrescenta mais o mapeamento de ferramentas ZCode
  específico do Superpowers.
- `pnpm typecheck`
- `pnpm lint`