# Especificação da Skill ZCode Feedback Tickets

## Objetivo

Adicionar a skill de workspace `zcode-feedback-tickets`, destinada a permitir que o Agent consulte, leia, atualize e feche tickets de feedback com segurança por meio da interface de Agent dos tickets de feedback do ZCode.

## Origem

O contrato da interface vem do documento do Feishu 《ZCode 反馈工单 Agent 接口 Skill》, cujo endereço é:

`https://internal-docs.example.invalid/redacted`

## Local da Skill

Colocada no diretório de skills de nível de projeto:

`/.agents/skills/zcode-feedback-tickets`

O diretório de nível de projeto foi escolhido em vez do global porque esta skill está ligada ao domínio dos tickets de feedback do ZCode, ao fluxo de estados e ao processo de tratamento do projeto, e portanto deve ser carregada junto com o workspace z-code.

## Escopo de disparo

Dispara quando o usuário pede para tratar tickets de feedback do ZCode, a plataforma de feedback, um número de ticket `ZCT-...`, ler o contexto de um ticket, baixar o pacote de materiais, atualizar o progresso do ticket, resolver o ticket, transferência de ticket, ou fazer arquivamento/comentário/rejeição/fechamento em lote.

## Restrições principais

- Usar `ZCODE_FEEDBACK_BASE_URL` por padrão, com fallback para `https://feedback.example.invalid` quando não estiver definida.
- A autenticação das interfaces de gerenciamento usa `Authorization: Bearer $ZCODE_FEEDBACK_ADMIN_JWT`.
- Se o token não existir, usar o fluxo de autorização por dispositivo; não forjar token.
- Antes de uma operação de escrita, ler primeiro o contexto do ticket e confirmar número, status e intenção do usuário.
- A operação perigosa `delete` só pode ser executada mediante solicitação explícita do usuário.
- Após o retorno das interfaces em lote, é obrigatório verificar `skipped`, e não apenas `affected`.
- Ao concluir o desenvolvimento, usar `已解决` ("Resolvido"), e não o status antigo `等待上线` ("Aguardando lançamento").
- Não vazar na resposta final o JWT, o código do dispositivo ou o conteúdo de anexos sensíveis.

## Estrutura de conteúdo

- `SKILL.md`: fluxo principal, pré-requisitos de autenticação, limites de segurança e entrada dos comandos mais usados.
- `references/api.md`: lista de interfaces, parâmetros, status e exemplos de curl organizados a partir do documento do Feishu.

## Verificação

Após a criação, executar o script de validação de skills:

```bash
python3 /Users/dev/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/zcode-feedback-tickets
```