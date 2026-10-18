# Agent Tool Call Renderer

O `packages/ui` adicionou um `AgentToolCallBlock` independente para as ferramentas de delegação a subagentes.

Convenção atual:

- A linha de resumo exibe `agentName + primaryText + status` e não numera mais os subagentes
- As linhas Agent/Task do v4 são sempre um resumo de uma única linha e não expandem Prompt, saída, atividade ou subferramentas
- Quando a linha recebe `rootSessionId + parentSessionId + childSessionId` e o callback de abertura, a linha de resumo é uma ação de detalhe: clicar ou pressionar Enter/Space abre no desktop/Web comum uma tab somente leitura à direita, e no `/remote` do celular abre a gaveta existente à direita
- Enquanto o child ainda não foi projetado ou falha antes de iniciar, o resumo permanece estático e não clicável; depois que o alvo do child chega, ele passa apenas a ser clicável, sem abrir os detalhes automaticamente
- `agentName` prioriza o nome real do agente já pareado, como `subagentRow.subagentType`, `output.agentType`, `input.subagent_type` / `input.agent_type`, e não usa o nome de implementação do protocolo `Agent`
- `subagent_type` tem exibição em três estados: exibe imediatamente quando um tipo explícito foi resolvido; fica vazio quando `raw.inputPreviewComplete !== true` e o tipo autoritativo ainda não chegou; exibe o valor padrão real `general-purpose` somente quando a prévia de entrada está claramente completa e ainda omite o tipo
- `primaryText` ignora nomes de implementação como `Agent` / `Task` / `spawn_agent` e prioriza nickname, title, description ou agent type
- foreground/background afeta apenas o ciclo de vida do runtime, não o ponto de entrada de detalhes
- O ciclo de vida de ferramentas do child ainda pode ser espelhado no runtime pai com `source: "subagent"` para consumidores compatíveis e diagnóstico, mas a ProductProjection V4 pai não pode materializar esses espelhos como `ToolCallRow`; caso contrário, o Read/Bash do child seria desenhado como uma chamada de ferramenta do próprio main. O topic da session do child continua materializando o histórico completo de ferramentas, e o desktop `desktop-continuous` e o celular `web-remote-replayable` usam a mesma regra de isolamento
- A sessão pai mantém apenas o resumo Agent/Task, o status de execução do subagente, o trabalho em background e as interações bloqueantes com `origin.kind: "subagent"`; esperar um child em foreground continua fazendo parte do estado de execução real do main turn e não depende de uma tool row do child para se manter
- O `snapshot.control.lastError` atual do child é exibido nos detalhes somente leitura, sem novos fallbacks inline na linha pai, sem timeline row e sem campos persistidos
- `Task` é um alias de compatibilidade com o histórico do Claude Code e usa o mesmo renderer de `Agent`; Workflow não está incluído nesta regra
- Não reutiliza a semântica de `Explore` nem usa o `ToolCallBody` genérico

Condições de correspondência:

- `raw._meta.claudeCode.toolName === "Agent"`
- `raw._meta.zcode.toolName === "Agent"`
- `raw._meta.zcode.toolName === "spawn_agent"` / `raw.name === "spawn_agent"` / `kind === "spawn_agent"` (Codex)
- `kind === "think"` e `title === "Agent"` (GLM/ZCode Agent)
- ou `kind === "think"` e `input.subagent_type` existe

## Limites de exibição do tipo durante o streaming

`inputText` é um JSON incremental. Um JSON pela metade ainda não contém `subagent_type` e não pode ser tratado como se o modelo tivesse omitido o campo; caso contrário, o primeiro frame de `tool_input_start` exibiria brevemente `general-purpose` e depois saltaria para o tipo real.

```text
tool_input_start / row.inputText 增量
                 |
                 v
       +----------------------+
       | já tem tipo auto-     |
       | ritativo/ explícito? |
       +----------------------+
          | sim            | não
          v                v
      exibe o tipo real  inputPreviewComplete === true ?
                            | sim              | não
                            v                   v
                    exibe general-purpose    fica vazio

quando subagentRow.subagentType chega -------> exibe esse tipo autoritativo
```

Aqui se preserva a semântica de runtime da ferramenta Agent de que a entrada completa sem `subagent_type` assume `general-purpose` por padrão; apenas o fallback da UI é adiado. Não é permitido adivinhar se o campo ainda vai chegar escaneando uma lista de permissões do JSON pela metade.