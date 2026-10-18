# Especificação do botão principal do diálogo de confirmação secundária

## Contexto

O diálogo de confirmação secundária protege a operação que o usuário está prestes a executar. Antes, negócios distintos renderizavam o botão de confirmação como primary, warning ou destructive, fazendo com que o mesmo botão de "confirmar e continuar" mudasse de cor entre diálogos.

## Especificação

- O botão de confirmação do diálogo de confirmação secundária usa uniformemente o estilo de botão principal.
- O botão de cancelar continua usando o estilo de botão secundário, mantendo clara a hierarquia das ações.
- Semânticas de risco como excluir, parar, sair ou atualizar links inválidos são expressas pelo título, pela descrição e pelo texto do botão, e não mais pela cor do botão de confirmação.
- `ConfirmDialogRequest` não oferece configuração de cor ou de variant do botão; o chamador não pode sobrescrever o estilo do botão de confirmação pela requisição do diálogo.
- Diálogos de confirmação que usam `AlertDialogAction` de forma independente também devem manter o botão de confirmação como botão principal, a menos que uma especificação de design posterior introduza explicitamente um novo nível hierárquico semântico para o botão de confirmação.

## Superfície afetada atualmente

- O botão de confirmação do `ConfirmDialogHost` global.
- Os `AlertDialogAction` independentes usados pelos diálogos de confirmação próprios de cada negócio.