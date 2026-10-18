# Agrupamento de Tool Calls de Changes

## Status de lançamento

Funcionalidade implementada e desabilitada por padrão nas configurações do usuário. O “Agrupar alterações de
arquivos” nas Settings é persistido como `toolGroupingChangesEnabled` no nível da aplicação; quando ausente,
usa-se o fallback `ENABLE_CHANGES_TOOL_CALL_GROUPING=false`. Quando desabilitado, a UI de produção mantém
linhas de ferramenta brutas Write/Edit/ApplyPatch consecutivas. O renderer de Changes, o summary responsivo e
os focused tests são mantidos, sem novos estados de session, protocolo ou runtime.

## Objetivo

`ToolCallRow`s consecutivas de escrita de arquivo são agregadas em um único grupo pai `Changes` na UI de
conversa. O grupo pai é apenas um nó de exibição que compartilha o renderer, sem novos estados de protocolo,
runtime, persistência ou replayable; os Write/Edit/ApplyPatch originais permanecem como children com diff,
erros e snapshot field notice completos.

## Estados e temporização

```text
Write/Edit ── Write/Edit ── Write/Edit ── linha de file-write não visível
     └──────── Changes: in_progress ────────┘
                                             └─ Changes: completed
```

- O estado de runtime do pai é determinado apenas pelas fronteiras de etapa visíveis: é `in_progress` quando
  está no último chunk visível do segmento de trabalho em execução, e `completed` caso contrário.
- Os estados running/completed/failed/stopped dos children não determinam inversamente o estado do pai; erros
  são exibidos apenas no child correspondente.
- Reasoning não inicial e oculto não constituem fronteira; reasoning visível, Explore, Terminal, Agent, texto
  e outras ferramentas visíveis encerram o Changes atual.
- A key/tool id do pai é ancorada na primeira linha real de file-write, e novos children não podem recriar o
  componente pai nem perder o estado de expansão.

## Contrato do Summary

| Estado do pai | Estado de expansão | Summary                                                                          |
| ------------ | ------------------ | -------------------------------------------------------------------------------- |
| Em progresso | Recolhido          | `Changes · N files · Editing/Writing <file chip> <diff count>`; snapshot mais recente rola verticalmente |
| Em progresso | Expandido           | `Changes · N files`                                                              |
| Concluído    | Expandido           | `Changes · N files`                                                              |
| Concluído    | Recolhido           | Múltiplos arquivos: `Changes · N files · <file chips>`; arquivo único: `Changes · <file chip>`      |

Quando um Write/Edit em execução já entrou no grupo, mas o JSON em streaming ainda não forneceu um caminho
de arquivo analisável, o summary do pai exibe `Changes · N tools`, onde N é a quantidade atual de children
do grupo. Nessa etapa não se deve exibir separador solto nem `0 files`; após expandir, os children originais
permanecem, mesmo que o caminho do arquivo ainda não tenha chegado e só seja possível exibir temporariamente
`Writing`/`Editing`. Quando o caminho chega, o summary do pai volta ao file summary normal.

- A contagem de arquivos é deduplicada pelo path completo normalizado, com a ordem da primeira aparição; um
  único Edit com vários file summaries é achatado antes de ser deduplicado junto com os demais children.
- No estado concluído e recolhido, havendo apenas um arquivo único, omite-se `1 file ·` e exibe-se
  diretamente o file chip; essa é a exceção compacta do summary de arquivo único.
- No estado concluído e recolhido, a lista completa de file chips é renderizada pela primeira vez e, em
  seguida, mantêm-se o máximo de chips iniciais possível conforme a largura realmente disponível no summary,
  com os restantes exibidos como `+N`; o `ResizeObserver` recalcula quando a largura da janela do desktop, da
  barra lateral ou do layout móvel muda, restaurando mais arquivos quando houver mais espaço. O contêiner não
  pode gerar overflow horizontal. Os chips reutilizam os ícones de arquivo, tooltips e o comportamento de
  clique na pré-visualização de código já existentes.
- No estado de execução recolhido, usa-se o child mais recente que tenha file summary; a ação é determinada
  pela semântica de operation desse child.
- No estado de execução, `N files` é deduplicado em tempo real pelos caminhos já resolvidos; ação, nome de
  arquivo, path e diff count pertencem ao mesmo nível de conteúdo dinâmico e ficam separados entre si apenas
  por espaçamento comum, sem inserir `·`. `·` separa somente Changes, o total de arquivos e o conteúdo
  dinâmico.
- O snapshot em rolagem no estado de execução deve salvar também o diff count daquele child. Após a troca do
  resumo de arquivo, o número de diff gira de forma independente no fim do mesmo snapshot, sem exibir
  antecipadamente as estatísticas do próximo child e sem esperar o child terminar para montar o valor final.
- Enquanto o grupo pai está expandido, o diff count dos Write/Edit filhos deve preservar a animação de entrada
  da primeira estatística em streaming; o agrupamento não pode degradar a execução para uma exibição estática
  da estatística final apenas porque o child foi montado com atraso.
- Expandir interrompe imediatamente a animação do summary pai e exibe a contagem única de arquivos; a ação
  atual é expressa pelo summary do child abaixo.
- O grupo pai Changes usa sempre o ícone de lápis de 16px; durante a execução permanece estático, sem trocar
  para loading spinner.
- O nome de arquivo no file chip compartilhado por Edit e Changes usa `text-foreground-subtle`; o diretório
  relativo continua usando um nível abaixo, `text-foreground-subtlest`.

## Boundaries multiplataforma

O agrupamento consome apenas as mesmas rows projetadas pelo continuous do desktop ou pelo replayable do
web-remote, sem alterar semântica de transport, snapshot, gap, queue ou owner. O renderer compartilhado é
usado tanto no desktop quanto no Web móvel; telas estreitas protegem o layout por meio de `min-w-0`,
truncamento e um limite fixo de chips.