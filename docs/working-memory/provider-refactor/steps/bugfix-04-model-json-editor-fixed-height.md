# Bugfix 04: Altura fixa no editor JSON de Model

> Status: concluído

## Problema

O Option Spec dos níveis de raciocínio e o Reasoning Mapping no modal de configuração de Model usam texto JSON multilinha.
O `Textarea` compartilhado usa por padrão `field-sizing-content`, portanto, quando o valor Personal está vazio e o Effective JSON
é exibido como placeholder, a caixa de entrada cresce automaticamente junto com o placeholder multilinha. Um Mapping mais
longo estica o conteúdo inteiro do modal e faz o JSON parecer um texto comum espalhado pela página.

## Comportamento desejado

- Os três itens de configuração JSON continuam usando o `Textarea` nativo editável, sem introduzir um segundo estado JSON nem dependências de editor;
- As caixas de texto JSON usam uma altura fixa unificada, que não varia com a quantidade de linhas do value ou do placeholder;
- O JSON que excede a altura rola verticalmente dentro da própria caixa de texto; o modal é responsável apenas pelo scroll entre os campos;
- Quando o valor Personal está vazio, o Effective JSON continua sendo exibido apenas como placeholder e não é escrito no Personal Overlay;
- Manter fonte monoespaçada, marcação JSON, edição por teclado, tema e o comportamento compartilhado entre desktop/Web.

## Causa raiz e correção

A causa raiz não está no Config nem no Overlay, mas em `JsonSlotEditor`, que definia apenas altura mínima e resize
arrastável, sem cobrir o dimensionamento automático por conteúdo do `Textarea` compartilhado.

A correção é feita dentro dos limites visuais de `JsonSlotEditor`: sobrescrever para `field-sizing-fixed`, usar altura
fixa, desativar o resize manual e habilitar o scroll interno. Não é permitido alterar a análise do JSON, o Draft, o Effective Preview
ou a semântica de salvamento.

## Aceitação

- Valores JSON longos e placeholders Effective longos não alteram a altura da caixa de texto;
- As três caixas de texto JSON têm a mesma altura;
- A caixa de texto tem um limite de entrada claro e rola internamente quando o conteúdo transborda;
- Salvar e restaurar padrões continua com o mesmo comportamento;
- Testes unitários de UI, typecheck e lint passam.

## Resultado da implementação

- `JsonSlotEditor` passou a usar altura fixa e scroll vertical interno de forma unificada; values/placeholders longos não esticam mais o modal;
- Os três campos JSON continuam reutilizando o mesmo editor, sem alterar o Personal Overlay esparso, o placeholder Effective nem a semântica de restauração de padrões;
- Os testes direcionados afirmam explicitamente `field-sizing-fixed`, altura fixa e `resize-none`; o commit correspondente da implementação é `39cb217ca3`.