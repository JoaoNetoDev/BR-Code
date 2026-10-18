# Estilo da Pílula de Permissão na Lista de Tarefas

## Contexto

O estado "aguardando confirmação" da TaskList comum é renderizado com o componente `Badge`, que por padrão usa a pílula `rounded-full`. Na grouped task row, o mesmo estado usa um `span rounded-sm` escrito à mão, deixando o mesmo status de tarefa visualmente inconsistente entre as diferentes visões de lista.

## Objetivo

- Reutilizar o componente `Badge` para "aguardando confirmação" na grouped task row.
- Manter inalteradas a semântica da cor de sucesso e o comportamento de ocultar no hover.
- Não modificar a lógica de seleção de tarefas, arrastar, arquivamento ou verificação do estado de permissão.

## Restrições de Compatibilidade

- Barra lateral do desktop, visão global de grouped task e temas claro/escuro usam um estilo de pílula consistente.
- Apenas a aparência do rótulo de UI é ajustada; o fluxo de mensagens realtime de sessão/tarefa do ZCode não muda.