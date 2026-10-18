# Limite de quantidade de automações criadas

## Semântica de produto

- O índice local de tasks mantém no máximo `20` definições de automação agendada.
- O escopo da contagem é o mesmo de `listAllAutomations()` na página de gerenciamento, cobrindo todos os projetos; não são 20 por workspace.
- Todos os estados de ciclo de vida, como `active`, `paused`, `completed` e `failed`, ocupam vaga.
- Tarefas ociosas pertencem a um domínio independente e não contam para o limite de 20 automações agendadas.
- Atualizar, executar, pausar e retomar tarefas existentes não é limitado; apenas excluir a definição de uma automação agendada libera vaga.
- Todos os pontos de entrada de criação — formulário manual, templates, `CronCreate` da sessão, etc. — respeitam o mesmo limite.

## Limites e sequenciamento

A UI bloqueia a criação antecipadamente com base na lista completa já carregada e exibe uma mensagem localizada; essa
checagem serve apenas para feedback de interação e não é a fronteira final de consistência. Na camada de serviço, a criação
finalmente verifica a contagem total dentro de uma transação de escrita SQLite serializada, evitando que múltiplas janelas
do desktop ou criações concorrentes por tool de sessão passem simultaneamente pela contagem antiga.

```text
UI / CronCreate
      |
      v
AutomationService.create
      |
      v
BEGIN IMMEDIATE
      |
      +-- COUNT(all lifecycle states) >= 20 --> rollback + limit error
      |
      +-- COUNT < 20 --> INSERT --> commit
```

Ao atingir o limite, não se deve limpar automaticamente tarefas concluídas ou com falha, nem filtrar a contagem por
workspace, status ou habilitação.

## Limite de falha da tool de sessão

Quando o `CronCreate` bate no limite global, trata-se de uma restrição de produto que o Agent não pode recuperar sozinho,
e não de um erro comum de tool retryable:

- Esta criação não modifica nenhuma task.
- As chamadas de tool ainda não executadas no restante do turno atual do modelo devem ser canceladas.
- No turno atual do usuário, é permitida apenas mais uma resposta do modelo sem tools, informando diretamente, no idioma atual, que o limite foi atingido e orientando o usuário a excluir manualmente a task em "Automações" e tentar de novo.
- Nesta fase de resposta, não se deve expor novamente `CronList`, `CronDelete`, `CronCreate`, Bash ou outras entradas de contorno.
- O Agent não deve escolher, excluir nem sobrescrever tarefas existentes; mesmo que o `CronList` do workspace atual tenha menos de 20 itens, não pode inferir daí as vagas globais de outros workspaces nem executar limpeza.

```text
CronCreate limit error
       |
       +-- cancel remaining tool groups in this model step
       |
       +-- lock all tools for the rest of this user turn
       |
       +-- one text-only response: explain limit and manual next step
```