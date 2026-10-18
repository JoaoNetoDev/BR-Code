# Descrições em chinês e inglês dos skills integrados nos painéis `/` e `$`

## Contexto

Os skills integrados oficiais do ZCode são empacotados com a CLI por meio do plugin oficial. O usuário os descobre
principalmente por duas entradas na caixa de entrada:

- Painel `/`: o painel de slash command também lista os skills habilitados como candidatos e, ao selecionar um, insere `$skill`.
- Painel `$`: o painel de skill mention exibe diretamente os candidatos de skill.

Atualmente, as descrições dos skills integrados oficiais são em parte em chinês e em parte em inglês; ao trocar o idioma
da UI, as descrições dos painéis de candidatos `/` e `$` não acompanham a mudança de idioma.

## Objetivo

- Fornecer descrições em chinês / inglês para os skills integrados oficiais apenas nos painéis de candidatos `/` e `$`.
- Manter como estão os skills definidos pelo usuário, os skills de terceiros, as injeções do Agent runtime e a saída de `zcode skills` na CLI.
- O mesmo helper de localização é reutilizado pelos candidatos de skill do `/` e pelos candidatos de skill mention do `$`, evitando divergência de texto entre os dois pontos.
- Skills não cobertos continuam usando o `description` retornado pelo servidor.

## Não objetivos

- Não modificar o corpo de `SKILL.md` nem o formato de parsing do frontmatter.
- Não alterar `@zcode/protocol`, `@zcode/contracts` nem a assinatura de `ISkillsService`.
- Não afetar o skill selection metadata visível ao modelo.
- Não alterar nome, caminho, estado de habilitação, ordenação ou regras de filtro dos skills.

## Design

Novo helper do lado da UI:

- Entrada: `name`, `description`, `path`, `scope`, `pluginName` opcional e o `Locale` atual.
- A localização só é tentada quando o skill é considerado um skill de plugin oficial integrado: `scope === "plugin"` e `pluginName` pertence ao conjunto de plugins oficiais integrados, ou o path está no caminho de cache dos plugins oficiais.
- A tabela de textos armazena duas descrições por skill `name`, `zh-CN` / `en-US`.
- Fallback: sem texto no idioma atual, usa o `description` original; sem descrição, segue o fallback de scope já existente.

Pontos de integração:

- `buildSkillSuggestions()` em `packages/ui/src/slashCommandHelpers.ts` recebe o locale atual e usa o helper para gerar as descrições dos candidatos de skill do painel `/`.
- `packages/ui/src/mentions/providers/skillsMentionProvider.ts` lê o locale de `useZCodeIntl()` e usa o mesmo helper para gerar as descrições dos candidatos de skill do painel `$` e o source label.

## Verificação

- Complementar os testes unitários de `slashCommandHelpers` e `skillsMentionProvider`, cobrindo a descrição dos skills integrados oficiais nos locales em chinês e inglês.
- Executar `pnpm typecheck` e `pnpm lint`, conforme exigido pelo repositório.