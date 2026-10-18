# Controle de Modelo dos Subagents Embutidos

O Settings exibe o controle de modelo na mesma linha para subagents embutidos e de plugin, mas os demais campos permanecem somente leitura.

- `general-purpose` herda por padrão o main model da sessão pai.
- `Explore` herda por padrão o main model da sessão pai.
- Depois que o usuário seleciona um modelo concreto, isso é gravado como built-in model override.
- Ao limpar o override, o comportamento padrão embutido é restaurado.
- O nível de raciocínio e o Draft passam a ler a Selection View do Environment alvo; não se usa mais o duplo preenchimento a partir de App metadata/catalog.
- Falha de carregamento é separada de indisponibilidade explícita; a mensagem "selecionar modelo" aparece somente quando o candidato atual está pronto mas sem o modelo original, e a intenção persistida não é limpa.
- Agents embutidos não exibem edit, delete, enabled switch, prompt editor nem tools editor.
- user subagent continua usando a exibição do resumo de modelo existente.
- "Herdar padrão" de um plugin subagent significa remover o override do usuário, voltando à declaração de modelo do Markdown do plugin; apenas quando não há declaração é que o modelo pai é herdado.
  O badge do modelo não é exibido novamente na linha, a linha não é clicável para edição e o override não é gravado no diretório do plugin.

```text
目标 Environment Selection View
                  |
                  +--> ready --> 同一候选与档位来源
                  |
                  `--> loading / error --> 保留意图，区分加载与失败
```

A escolha ativa de um novo modelo usa o nível mais alto dele; lacunas históricas de nível não são preenchidas automaticamente. Overrides embutidos e de plugin gravam um ModelSelection completo de uma vez; se o salvamento falhar, a combinação é revertida, e uma falha de atualização após o salvamento bem-sucedido não é revertida. O contrato completo está em `docs/subagents-built-in-model-overrides.md`.