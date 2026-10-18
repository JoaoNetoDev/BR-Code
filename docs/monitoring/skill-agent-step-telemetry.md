# Telemetry de `agent_step` para Skills

## Objetivo

Preservando a contagem, a cronologia e a atribuição de ferramentas existentes de `agent_step`, identificar qual skill
uma chamada de ferramenta `Skill` realmente carregou e de qual plugin/source ela veio.

Esta alteração não adiciona um step de descrição de skill nem grava o corpo do SKILL.md ou a description no evento de
alta frequência `agent_step`.

## Campos

Adicionados sob demanda apenas no `agent_step.event_extra_detail` dos `tool_name=Skill` existentes:

| Campo                 | Descrição                                                     | Origem                                |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `skill_qualified_name` | Nome de skill normalizado, por exemplo `document-skills:pptx` | `SkillContent.metadata.qualifiedName` |
| `skill_plugin_id`      | plugin id completo, por exemplo `document-skills@zcode-plugins-official` | `LoadedPlugin.id`                     |
| `skill_source`         | Valor do enum `SkillSource` existente                         | `SkillContent.metadata.source`        |

Os três campos são opcionais; quando falta metadata, o campo é omitido e a origem não é adivinhada a partir de
strings de nome.

## Cadeia de dados

```text
ToolCallScheduled(Skill)
        |
        v
SkillPort.loadSkill() -- resolved SkillMetadata --> ToolCallResult / ToolCallError
        |
        v
tool.lifecycle fact
        |
        v
existing agent_step finalization
```

O metadata de Skill se propaga como dado telemetry-only do session event, sem entrar no conteúdo de tool result visível
ao modelo nem no corpo de erros. Se a Skill já foi resolvida mas uma etapa posterior de serialize/post_hook falhar, o
metadata é preservado via `ToolCallError` até o `agent_step` de falha final.

## Limites e invariantes

- steps com `tool_name !== "Skill"` não podem conter nenhum campo `skill_*`.
- steps de Bash/MCP gerados por fluxos como document, CUA e BUA não herdam metadata de Skill.
- se um fluxo CUA/BUA chamar `Skill` por conta própria, apenas aquele step de `Skill` grava os campos correspondentes.
- como nenhum step novo é adicionado, `agent_step_cnt`, `loop_index`, duração e contagem de tokens permanecem
  inalterados.
- o plugin official bundled atualmente é exposto pelo plugin root; `skill_source` continua sendo reportado como
  `plugin`, e `skill_plugin_id` usa o marketplace id real; não é alterado arbitrariamente para `bundled`.

## Compatibilidade

Session events antigos e chamadas de Skill sem metadata resolvível continuam sendo consolidadas pela lógica existente de
`tool_name=Skill`; todos os campos novos são opcionais e consumidores antigos não precisam migrar.
