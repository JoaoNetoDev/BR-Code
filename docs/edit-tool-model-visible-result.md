# Contrato do Resultado Visível ao Modelo na Ferramenta Edit

## Contexto

O `tool_result` provider-visible da ferramenta Edit é a base para o modelo 판단 se a edição teve efeito e se é preciso reler o arquivo.
Este documento restringe o texto visível ao modelo quando o Edit tem sucesso ou falha, a correspondência com escape de `old_string` e a determinação do estado de leitura do read-before-edit.

## Comportamento

- O texto visível ao modelo de um Edit bem-sucedido precisa trazer o freshness suffix:
  ` (file state is current in your context — no need to Read it back)`.
- Quando um erro de execução do Edit entra no contexto do modelo, ele precisa ser envolvido como
  `<tool_use_error>...</tool_use_error>`, mas a mensagem de erro original usada na UI/logs continua em texto puro.
- O escape `\uXXXX` em `old_string` deve conseguir corresponder ao caractere real no arquivo, por exemplo
  `<tag>` correspondendo a `<tag>`.
- Um partial view read state já lido e inalterado pode servir de base para o read-before-edit do Edit;
  depois que o arquivo muda, o stale guard ainda precisa ser respeitado.

## Objetivos

1. O texto visível ao modelo de success/error do Edit usa a forma fixa acima.
2. O tipo de erro estruturado do Edit e a mensagem exibida na UI não são contaminados pelo wrapper `<tool_use_error>`.
3. Suportar a correspondência de `old_string` com fallback de unicode escape.
4. Manter a proteção contra arquivos stale, sem afrouxar a proteção de escrita de arquivos já alterados por causa da permissão de partial read state.

## Não objetivos

- Não modificar o desktop, a Web ou o caminho de controle remoto do celular.
- Não modificar o formato de erro visível ao modelo de outras tools como Read/Bash/WebSearch.

## Verificação

- `apps/zcode-cli/packages/core/tests/edit-tool-contract.test.ts`
- `pnpm typecheck`
- `pnpm lint`