# Todo 31: consolidação da consistência dos controles de entrada do diálogo de configuração de modelo

> Estado: concluído
>
> Data: 2026-08-27
>
> Origem: feedback de experiência real na página de configurações de Provider
>
> Tarefas relacionadas: [`Todo 27`](./todo-27-provider-settings-dogfood-closeout.md),
> [`Todo 29`](./todo-29-model-config-resolution-and-idle-trigger-closure.md)

## 1. Problema

O campo JSON do diálogo de configuração de modelo usava inicialmente um card de campo externo combinado com
um `Textarea` interno, formando uma borda dupla; depois de remover o card externo, o fundo e a borda fracos do
`Textarea` compartilhado ficaram quase invisíveis no diálogo escuro, e o controle real parecia ter degenerado em
JSON puro. Os testes existentes verificavam apenas que o card externo havia sido removido, sem provar que a caixa
de texto mantida é tão distinguível quanto um input comum.

Além disso, os campos técnicos herdaram a verificação ortográfica de linguagem natural do navegador, e o
macOS/Electron exibe sublinhados vermelhos de erro de grafia abaixo do Model ID. Ao mesmo tempo, o Model ID, a
janela de contexto e o Maximum Output Token do diálogo de modelo interpretavam qualquer Enter como salvar, sem
distinguir o Enter gerado pela confirmação de candidatos do IME.

```text
IME está compondo
      |
      | Enter
      v
Texto do candidato entra + onCommit()
      |
      v
Diálogo salva sem querer
```

## 2. Caixa de texto de camada única para JSON

Cada campo JSON mantém apenas uma camada de caixa de texto multilinha comum:

```text
Título do campo
└─ Textarea (o único fundo e a única borda)
```

- Não adicionar card, fundo extra ou segunda camada de borda;
- Cor de fundo, cor de borda e estado de Focus iguais aos de uma caixa de texto comum, sem usar o estilo de
  destaque Personal Override do Checkbox;
- Sem valor Personal, o Effective JSON continua como placeholder; com valor Personal, exibe-se o texto comum
  de entrada;
- Altura fixa, com rolagem dentro da própria caixa quando o conteúdo exceder, sem permitir arrastar para mudar a
  altura;
- Manter fonte monoespaçada e quebra de linha do JSON, sem novo Effective Preview somente leitura;
- Quando o JSON é inválido, manter o estado de erro de input comum e a mensagem de erro em nível de campo.

## 3. Comportamento dos inputs técnicos

Model ID, campos técnicos de Provider, URL, API Key e JSON não participam da assistência de entrada em linguagem
natural:

- Desativar a verificação ortográfica;
- Desativar correção automática e capitalização automática;
- Desativar o autocompletar do navegador;
- Não alterar visibilidade de senha, teclado numérico, placeholder ou semântica de salvamento.

## 4. Enter seguro para IME

Todas as entradas de configurações de Provider em que “Enter significa salvar/encerrar edição” reutilizam
uniformemente a 판단 de composição de IME já existente:

```text
Enter
├─ composition active
│  └─ apenas confirmação de candidato pelo IME; sem preventDefault, sem salvar, sem perder o foco
└─ ordinary keydown
   └─ executa o comportamento existente de salvar ou perder o foco
```

- Ler simultaneamente o estado `compositionstart/compositionend` mantido pelo componente e o `isComposing`
  nativo;
- O Model ID, a janela de contexto e o Maximum Output Token do diálogo de modelo usam o mesmo julgamento;
- Entradas existentes de Enter-to-save, como nome do Provider, Base URL e API Key, usam o mesmo helper;
- No Textarea de JSON, Enter sempre insere uma quebra de linha e nunca salva;
- O comportamento existente do botão explícito de salvar, do Enter comum, do blur e do idle save de 1200ms não
  muda.

## 5. Testes e critérios de conclusão

1. Os campos JSON continuam sendo dois `Textarea` de altura fixa, sem card externo e usando o estilo de input
   comum;
2. Effective JSON como placeholder e Personal JSON como value;
3. Model ID e outros inputs técnicos como JSON com verificação ortográfica e autocorreção desativadas;
4. `compositionstart -> Enter` não chama o salvamento e a confirmação de candidato não é bloqueada;
5. `compositionend -> Enter comum` salva exatamente uma vez;
6. Todos os inputs técnicos de Enter-to-save da página de Provider respeitam a mesma boundary de IME;
7. Enter no JSON não dispara salvamento;
8. Chinês/inglês, tema claro/escuro e operação por teclado continuam utilizáveis;
9. Testes de UI direcionados, typecheck, lint, verificação de formatação e `git diff --check` passam;
10. Atualizar o resultado da implementação e commitar um Conventional Commit.

Este Todo não altera o conteúdo do Model Config Rule, a ordem do Overlay, o Registry, os planos de conta ou a
capacidade de runtime do modelo.

## 6. Resultado da Implementação

- Os campos JSON foram consolidados em um único `Textarea` de altura fixa, com fundo, borda e estado de Focus
  iguais aos de um `Input` comum;
- O Personal JSON continua como `value` e o Effective JSON como `placeholder`, sem introduzir novo estado de
  preview;
- Nome do Provider, Base URL, API Key, Model ID, campos numéricos e JSON desligam uniformemente a verificação
  ortográfica e a reescrita automática;
- O salvamento por Enter do Base URL/API Key do Provider e do diálogo de modelo usa simultaneamente o estado
  local de composição e o `isComposing` nativo, e a confirmação de candidato em chinês não causa mais perda de
  foco nem salvamento;
- Novos testes de regressão provam primeiro que a implementação antiga salvava indevidamente e depois verificam que
  o Enter comum após o fim da composição ainda salva exatamente uma vez.

Resultados da verificação:

- Testes direcionados de UI de Provider/Model: 57 aprovados;
- Testes unitários afetados elevados à suíte completa: 12.477 aprovados, 25 ignorados;
- `pnpm typecheck` aprovado;
- `pnpm lint` aprovado (0 erros, 34 warnings existentes);
- Verificação de formatação dos arquivos alterados nesta rodada e `git diff --check` aprovados.

O `pnpm fmt:check` do repositório inteiro continua bloqueado pelo HTML inválido já presente nos documentos de
Electron e por problemas de leitura em `apps/zcode-cli/tests/gb2312.js`; os arquivos desta rodada passaram
individualmente em `oxfmt --check`.