# Fusão do Runtime de Sessão com MCP de Plugin

## Contexto

A página de configurações do ZCode Dev exibe, via `zcode/mcp/list`, o resultado da combinação dos MCPs de plugin e dos MCPs do usuário, mas no desktop, ao criar ou restaurar uma sessão, o `mcpServers` que a UI passa para o protocol vem apenas da configuração do usuário com `source === "zcodeagentmcp"`.

## Problema

`resolveAppRuntimeConfig` tratava `runtimeConfig.mcp.servers` como uma configuração de sobrescrita completa. Assim que o protocol passava os MCPs do usuário, os MCPs de plugin deixavam de ser combinados com a configuração de runtime, fazendo com que o lado do modelo enxergasse apenas os servidores de MCP do usuário que conectaram com sucesso; por exemplo, os MCPs do usuário `context7`, `exa` e `playwright` eram preservados, mas MCPs de plugin como `plugin:chrome-devtools-mcp:chrome-devtools` e `plugin:ios-simulator:ios-simulator` eram perdidos.

## Correção

Ao resolver a configuração de runtime da sessão, os MCPs de plugin são sempre injetados primeiro e, em seguida, os MCPs explícitos do usuário são combined:

```ts
{
  ...pluginMcpServers,
  ...(options.runtimeConfig?.mcp?.servers ?? configResult.config.mcp.servers),
}
```

Dessa forma, mantém-se a prioridade da configuração do usuário para sobrescrever MCPs com o mesmo nome, ao mesmo tempo em que se garante que os MCPs registrados por plugins entrem no runtime da nova sessão.