# Limite de Computer Use Indisponível para Subagent

## Objetivo

Agentes filhos não devem usar o Computer Use oficial `zcode-cua`. A restrição se vincula apenas ao servidor CUA oficial
já verificado pela Host authority, sem adivinhar por nome de ferramenta ou display name, de modo que MCPs de terceiros
não sejam afetados.

O Agente principal continua usando o canonical `mcp__computer-use__*` e os aliases compatíveis; o
`desktop-continuous` do desktop, o `web-remote-replayable` do controle remoto Web, o Host, a UI e o schema de protocolo
permanecem inalterados.

## Duas camadas de limite

```text
child spawn
  ├─ authority = computeOfficialCuaServerNames(parent config, trusted names)
  ├─ wildcard profile -> remove official server/tools from borrowed snapshot
  ├─ explicit CUA server/tool/selector/skill -> config error before startup
  └─ child SkillPort -> hide official computer-use

child MCP call (runtime_scope=subagent)
  └─ zcode-cua preflight -> return error, do not enter kill-switch/Broker/handler
```

O código de erro é `SUBAGENT_COMPUTER_USE_UNAVAILABLE` e o texto do erro é
`Computer Use is not available in subagent`. O producer só confia no campo namespaced
`com.zcode/request-context.runtime_scope`; ausente, malformado ou igual a `main` mantém a compatibilidade, e o campo
de mesmo nome no nível superior não é confiável.

## Semântica dos Agentes filhos

- sem configuração explícita de CUA, subagentes wildcard, Explore, general-purpose, custom, background e resume não
  veem o servidor CUA oficial, seu descriptor, as ferramentas canonical/raw/alias nem Skills.
- ao declarar explicitamente servidor oficial, ferramenta canonical/raw/alias, seletor de servidor MCP ou Skill
  oficial, o runtime filho falha antes da primeira requisição de modelo, sem remover silenciosamente a configuração
  do usuário.
- a filtragem usa o catálogo congelado de plugins oficiais, plugin id, root path e qualified name; Skills de terceiros
  com o mesmo nome não são afetados.
- o snapshot do pai, o ciclo de vida MCP do pai e o registry do Agente principal não são modificados.

## Semântica do Producer

As 30 ferramentas de `zcode-cua` compartilham o mesmo preflight. Com `runtime_scope=subagent`, o `isError` é retornado
antes da verificação de kill-switch, do acesso ao Broker e do handler; ferramentas como request access, stop, wait e
clipboard também não podem contornar esse limite. Nomes de ferramenta, schema, annotations, grupos de permissão e
protocolo de resultado permanecem inalterados.

## Aceitação

- a superfície de tools/Skills visível ao provider do subagente não contém o CUA oficial, e MCPs/Skills não oficiais
  continuam disponíveis.
- chamadas de CUA que contornam diretamente a superfície não disparam o Broker.
- o comportamento das chamadas de CUA oficial do Agente principal permanece inalterado.
- cobre testes unitários do z-code, testes unitários do producer zcode-cua e um caso de
  conversation manual-review/replay.
