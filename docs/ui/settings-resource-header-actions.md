# Ações do cabeçalho de recursos em Settings

Os grupos de lista de Memory, Subagents, Plugins, MCPs, Skills, Commands e Hooks exibem uniformemente as seguintes ações no canto superior direito:

```text
[ … ]     [↻]      [New]
 outline   outline   default
  ├─ Import
  └─ Export
```

- Refresh é sempre um botão de ícone `size="icon-md"` com Tooltip e nome acessível.
- Import e Export ficam recolhidos em um menu de mais ações `size="icon-md"`.
- Ações não implementadas (sem callback passado) não são renderizadas; quando Import e Export não estão implementadas, o botão de mais ações não é renderizado.
- Ações implementadas, mas restritas pelo Scope ou ambiente atual, aparecem como disabled por meio do atributo `*Disabled`.
- New usa sempre `size="default"` e `rounded-lg`, e sua ordem não pode ser alterada.
- As capacidades já existentes continuam chamando o service/store próprio de cada recurso, sem compartilhar lógica de submissão de dados.
- Capacidades ainda não implementadas devem ser ocultadas; é proibido vincular `onClick` vazio.
- Implementações posteriores só precisam passar o callback correspondente ao grupo de botões compartilhado para habilitar a ação.
- Os botões guiados de grande tamanho do estado vazio não fazem parte desta especificação e podem continuar sendo exibidos conforme a semântica do recurso.
- Desktop, Web e largura de celular usam a mesma ordem de botões; o contêiner permite quebra de linha.

## Matriz de capacidades atual

| Recurso   | Refresh                     | Import  | Export  | New      |
| --------- | --------------------------- | ------- | ------- | -------- |
| Memory    | Implementado                | Placeholder | Placeholder | Placeholder |
| Subagents | Já existe entrada de recarregar dados | Placeholder | Placeholder | Implementado |
| Plugins   | Já existe entrada de recarregar | Placeholder | Placeholder | Implementado |
| MCPs      | Implementado                | Implementado | Placeholder | Implementado |
| Skills    | Já existe entrada de recarregar dados | Implementado | Placeholder | Implementado |
| Commands  | Já existe entrada de recarregar dados | Implementado | Placeholder | Implementado |
| Hooks     | Já existe entrada de recarregar | Placeholder | Placeholder | Implementado |