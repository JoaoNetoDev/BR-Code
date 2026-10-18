# OpenRouter Attribution Headers

## Contexto

As requisições de modelo do ZCode e as requisições de negócio do lado do serviço já carregam headers de origem como `X-Title`. A atribuição de apps do OpenRouter exige que o aplicativo forneça simultaneamente os campos title e category específicos do OpenRouter, para que as requisições sejam atribuídas corretamente quando passam pelo OpenRouter ou por um gateway compatível.

## Objetivos

- Preservar o `X-Title` existente, sem alterar o comportamento de compatibilidade atual com upstream.
- O header de origem padrão do provider OpenRouter carrega simultaneamente:
  - `X-OpenRouter-Title: ZCode`
  - `X-OpenRouter-Categories: programming-app`
- A determination reutiliza de forma unificada `isOpenRouterBaseUrl()` de `@zcode/shared`: analisa o `baseURL` de runtime do provider e exige que o protocolo seja `https:` e que o host seja `openrouter.ai` ou um subdomínio dele.
- Cobrir as verificações de conectividade de modelos, as requisições de modelo das mensagens de commit do Repo Wiki/Git, assim como os provider headers gerados por zcode-cli/bootstrap.

## Não objetivos

- Não adicionar novos campos de protocolo nem modificar `@zcode/protocol`.
- Não alterar a semântica da sobrescrita explícita de `X-Title` pelo usuário; quando o usuário sobrescreve o campo antigo, os campos de atribuição padrão do provider OpenRouter permanecem.
- Não adicionar headers específicos do OpenRouter a providers que não são OpenRouter nem a requisições de API de negócio comuns do backend do ZCode.
- Não modificar artefatos gerados nem bundles empacotados anteriormente; as mudanças no código fonte entrarão nos artefatos em builds subsequentes.

## Verificação

- Atualizar as expectativas dos testes unitários de source header e de bootstrap provider header.
- Executar os vitests direcionados relevantes.
- Executar `pnpm typecheck` e `pnpm lint` conforme exigido pelo repositório.