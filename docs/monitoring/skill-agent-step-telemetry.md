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
| `skill_name`           | Nome da skill em todos os steps de Skill, independentemente da origem de plugin | Apenas o `SkillContent.metadata.name` já resolvido; `unknown` quando não resolvido ou quando a validação falha |
| `skill_qualified_name` | Nome de skill normalizado, por exemplo `document-skills:pptx` | `SkillContent.metadata.qualifiedName` |
| `skill_plugin_id`      | plugin id completo, por exemplo `document-skills@zcode-plugins-official` | `LoadedPlugin.id`                     |
| `skill_source`         | Valor do enum `SkillSource` existente                         | `SkillContent.metadata.source`        |

`skill_name` é sempre preenchido no step com `tool_name=Skill`, mas aceita apenas o nome de metadata já
resolvido. O `input.skill/name` do despacho ou do stream de compatibilidade não é lido; falhas antes da carga,
recusas, paradas e eventos antigos sem nome resolvido preenchem `unknown`, mesmo que a string da requisição
pareça um nome válido — não há fallback.

O nome tem de 1 a 64 letras ASCII, dígitos, sublinhados ou hifens, começando por letra ou dígito; não há trim
nem truncamento. Separadores de caminho, dois-pontos, espaços em branco, quebras de linha, URLs, e-mails,
caracteres não ASCII e valores longos demais são substituídos integralmente por `unknown`. As regras de limpeza
de credenciais já existentes na telemetry são reaproveitadas; nomes reconhecidos como credenciais também são
substituídos integralmente, sem manter trechos. A validação de formato não prova que qualquer texto é seguro,
portanto a origem real de resolução e a validação de formato precisam ser satisfeitas juntas.

A mesma função pura é usada no fact de estado final da CLI, no metadata/step de compatibilidade da UI e na
limpeza final do `/report`; o schema V4 valida a restrição do nome. O `skillName` de um fact de despacho antigo
não conta como metadata resolvido; o nome só é aceito no estado final e quando há source, evitando reintroduzir o
fallback de parâmetro de requisição ao misturar CLIs antigos. As entradas e as regras de carga de Skill de
negócio não mudam. Os outros três campos de plugin continuam opcionais, preservando a semântica existente; a
origem não é adivinhada a partir do nome. Dados antigos não são preenchidos retroativamente.

## Cadeia de dados

```text
ToolCallScheduled(Skill, sem extrair o nome da requisição)
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

O fact de despacho não carrega o nome; o estado final aceita apenas metadata resolvido e em conformidade com as
restrições; o nome é guardado junto com o owner de step existente, sem novo cache nem fila. O desktop continuous
e o mobile replayable usam o mesmo campo de fato e os seus respectivos limites de entrega.

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
`tool_name=Skill`; o campo novo do protocolo é opcional e os novos clientes são compatíveis com eventos antigos. Os
campos novos são reportados pelo CLI/App correspondente, e os eventos históricos não são preenchidos retroativamente.

## Aceitação

- As origens `zcode`, `agents`, `bundled`, `remote` e `plugin` reportam o `skill_name` resolvido que esteja de
  acordo com as regras de telemetry; nomes não conformes são `unknown`.
- O nome de requisição qualificado por plugin passa a ser o nome original da skill após a resolução bem-sucedida,
  e os campos de plugin existentes não mudam.
- Falha antes da resolução, recusa e parada produzem sempre `unknown`, sem conservar nenhum nome de requisição.
- Compatibilidade com o antigo `input.name`, com eventos que chegam apenas ao estado final e com metadata antigo; a
  falta do nome resolvido resulta em `unknown`, e ferramentas que não são Skill não carregam `skill_name`.
- Caminhos, URLs, quebras de linha, credenciais simuladas e nomes de 65/5000 caracteres não podem entrar no fact
  nem no corpo final da requisição `/report`; a cobertura inclui falha, recusa, parada e retentativa HTTP, e nomes
  comuns/de plugin normalmente resolvidos continuam sendo contabilizados.
- O strict schema App ↔ CLI aceita o `skillName` opcional; a contagem de steps, o status e os tokens existentes não
  mudam.
