# Treemapping

Treemapping é o mapa de atividade de arquivos das tool calls do turno atual no Side Pane direito. Ele deriva dados dos `toolCalls` da assistant message da task atual e não consome Git Pane, Git status nem Git diff.

## Dados e escopo

- O menu `+` do Side Pane abre o mapa ao vivo do turno atual.
- O botão Treemapping ao lado do polegar para cima/para baixo da assistant message abre o snapshot daquele turno.
- Na v1 só se considera o turno individual; não há acúmulo entre turnos.
- Na v1, para `bash/shell/exec`, consome apenas `changes` estruturados e metadados de path/diff, sem adivinhar caminhos a partir de stdout comum ou de strings de comandos complexos.

## Regras visuais

- Diretórios são caixas aninhadas neutras, expressando apenas hierarquia, diff agregado e views de diretório; a área do diretório referencia o `diffCount` agregado da subárvore.
- Arquivos são caixas folha: verde para adicionado, amarelo para modificado, vermelho para removido, azul para somente visualizado.
- O tamanho do arquivo vem principalmente de `diffCount = added + removed`.
- Mudanças sem diff usam o peso mínimo de mudança; somente visualizado usa um peso ainda menor.
- Arquivos removidos mantêm a folha histórica vermelha, mesmo que o arquivo real já não exista.

## Mesclagem de atividade

O mesmo arquivo aparece em apenas uma caixa dentro de um turno, e o fluxo de eventos fica preservado na área de detalhes. A prioridade de status é:

1. deleted
2. created
3. modified
4. viewed

Modificar após criar continua exibindo verde e acumulando o diff; modificar após visualizar é exibido com a cor de mudança e preserva as views.