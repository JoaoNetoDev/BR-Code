# Ícone do Nó de Menção de Goal

## Contexto

O nó de menção de command estruturada `/goal` na caixa de entrada do chat ainda usa o ícone antigo no estilo de alvo, enquanto locais como o command chip após o envio da mensagem no chat, a goal tool e a verificação de goal já usam o `GoalIcon` do lucide. A mesma semântica de goal fica com ícones inconsistentes antes e depois da entrada.

## Objetivo

- Trocar o ícone do command mention node de `/goal` pelo ícone `goal` do lucide.
- Substituir apenas o caminho do ícone do nó de goal, sem alterar cor, tamanho, texto ou markdown serializado do command mention.
- Manter inalterados os ícones de `/compact` e dos slash commands comuns.

## Aceitação

- O SVG path renderizado pelo mention node de `/goal` é idêntico ao `GoalIcon` do lucide.
- `pnpm typecheck` e `pnpm lint` passam.