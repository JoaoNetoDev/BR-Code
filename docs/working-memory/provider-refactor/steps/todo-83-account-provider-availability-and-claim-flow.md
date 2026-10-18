# Todo 83：Consolidação do estado de direitos do Account Provider e do fluxo de resgate

> Verificação de atribuição atualizada (2026-09-09): os testes restantes/falhos/promoções manuais deste documento foram transferidos para [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente deste documento; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Status: implementado (primeira rodada de consolidação)
>
> Data: 2026-09-04
>
> Origem: revisão do Start Plan ainda aguardando efetivação após o resgate, do estado anormal na página de configurações de modelos e do comportamento de navegação da página de resgate

## 1. Objetivo

Corrigir a representação e o comportamento de navegação do Account Provider nos estados "resgatado mas ainda não efetivo", "efetivo mas temporariamente sem modelos disponíveis" e "atualmente não selecionado", evitando misturar em um único valor booleano os direitos da conta, a exibição na página de configurações, a conexão atual e a selecionabilidade de modelos.

Este Todo trata apenas da resolução de estado do Account Provider, do fluxo de UI após o resgate e da projeção em runtime, sem alterar a semântica de configuração já existente de Built-in Provider, Personal Provider ou Off-Peak.

## 2. Hierarquia de dados fixada

```text
ProviderFamilyConnectionSelectionSettings（persistido）
  └─ o método de conexão escolhido pelo usuário em cada Family

Account Provider State（runtime）
  └─ recalculado a cada atualização com base nas credenciais da conta, na API de direitos e no resultado de modelos/cota

Account Provider Config Overlay（projeção de configuração em runtime）
  └─ fornece apenas os fatos de configuração da conta necessários ao Provider Runtime
```

- `ProviderFamilyConnectionSelectionSettings` continua usando os campos existentes; não são adicionados campos persistidos `current`, `visible` ou `entitled` por Provider.
- `current` é derivado em runtime a partir da seleção de conexão da Family atual e só se aplica a Account Providers comutáveis (Start, Coding Plan pessoal, Team Coding Plan); Built-in comum, Personal Provider e Off-Peak não usam esse conceito.
- O Account Overlay carrega apenas a configuração de conta necessária à execução e os membros de modelo dinâmicos, não o estado de exibição da página de configurações.
- Este Todo não adiciona migração de persistência; os dados de seleção existentes continuam sendo interpretados conforme a semântica atual de seleção por Family.

## 3. Estado unificado do Account Provider

O Account Provider Resolver deve gerar centralmente o resultado de estado; UI, Registry e Model Selection não podem repetir a mesma verificação individualmente:

```ts
{
  availability, // available | pending | unavailable | unknown
  entitled,     // se os direitos da conta já podem ser usados neste momento
  effectiveAt,  // momento de efetivação pendente (vazio se não houver)
  current,      // se a Family atual tem este método de conexão selecionado
  models,       // membros de modelo retornados pela conta
  executable,   // se existe algum modelo executável
  selectable    // se é possível entrar no seletor de modelos atual
}
```

### 3.1 Mapeamento dos estados upstream

Reutilizar em prioridade a semântica já existente do serviço de direitos (`available`, `unavailable`, `unknown`), acrescentando apenas um `pending` explícito para representar a efetivação futura, sem voltar a adivinhar o estado em páginas diferentes.

```text
available
  -> entitled = true

pending（resgatado, effectiveAt no futuro）
  -> pode ser exibido na página de configurações
  -> entitled = false（ainda não pode ser usado）
  -> mantém effectiveAt

unavailable（o servidor indica explicitamente que não há direitos no momento ou a conta está indisponível）
  -> entitled = false

unknown（rede/servidor temporariamente unable de confirmar）
  -> mantém o último estado exibível, sem esconder abruptamente por causa de uma falha
```

Se o upstream retornar simultaneamente "plano já resgatado" e um `effective_at` futuro, não se deve reescrever silenciosamente o campo upstream com outro significado. Deve-se preservar o tempo e o estado de origem originais, deixando o mapeamento centralizado expressar explicitamente "resgatado mas ainda não efetivo", e acrescentar testes que descrevam esse mapeamento.

### 3.2 Limites de exibição, execução e seleção

- Se o Account Provider aparece na página de configurações é determinado pelo resultado de exibição da conexão de Account no estado unificado; não se mistura com o `visibility` estático do Built-in Provider Config.
- `entitled` indica somente se os direitos da conta já podem ser usados no momento.
- `executable` depende da existência de modelos executáveis; mesmo com `entitled=true`, sem modelos não há execução.
- `selectable` vale apenas para o Account Provider que é a conexão atual e possui modelos executáveis. Providers pendentes, não selecionados, sem modelos ou indisponíveis não podem entrar no Model Selection.
- A ausência de modelos significa apenas que não é possível formar um Model Selection válido; isso não permite classificar o Account Provider como não autorizado nem descartar seu estado ou snapshot de configuração. Se a casca do Provider permanece no Registry é tratado conforme as regras atuais de projeção de Runtime, mas jamais pode gerar requisições de modelo executáveis.
- Uma Family pode consultar simultaneamente o status de Start, Coding Plan pessoal e Team Coding Plan; não se pode marcar incorretamente as outras conexões como não autorizadas só porque uma delas está selecionada.
- Somente o Account Provider atualmente selecionado é projetado no Registry de runtime; "ter o plano" não é igual a "estar usando agora".

## 4. Resgate e navegação do Start Plan

### 4.1 Exibição após o resgate bem-sucedido

- O cartão de resgate bem-sucedido deve manter o estado do resultado e exibir `effectiveAt` (por exemplo, "efetivo amanhã às 09:00"); não pode mostrar apenas o sucesso ocultando o horário de efetivação.
- Enquanto pendente, manter as ações de resultado como "Entendi" e "Configurações de modelos"; não oferecer um caminho "Começar a usar" que troque imediatamente para o Start Plan.
- Quando já efetivo e com modelos executáveis, a troca da conexão atual ocorre apenas quando o usuário clicar ativamente em "Começar a usar"; antes do clique, ler o estado mais recente novamente, sem trocar com base no snapshot antigo do momento do resgate.
- O resgate bem-sucedido não altera automaticamente o método de conexão atual.
- "Começar a usar" só pode aparecer ou ter efeito quando o estado mais recente satisfizer simultaneamente "direitos disponíveis agora" e "existe modelo executável"; em caso de pendente, desconhecido, explicitamente indisponível ou sem modelos, não oferecer ações que causem a troca.

### 4.2 Entrada manual pela página de configurações

O usuário ainda pode ver manualmente na página de configurações de modelos o estado pendente do Start Plan e seu horário de efetivação, mas esse estado não pode aparecer no seletor de modelos atual nem gerar um Model Selection inválido.

### 4.3 Proteção contra navegação inválida

Toda navegação de Provider iniciada pela página de resgate ou por outra entrada deve validar o destino:

- o Provider de destino não existe;
- o Provider de destino não pode ser exibido;
- o Provider de destino não obteve os direitos atuais;
- o Provider de destino não tem modelos executáveis.

Em caso de destino inválido, deve-se exibir um erro claro e voltar a uma página estável, sem deixar a página de configurações presa em carregamento permanente ou em branco. Essa proteção fica centralizada no ponto de entrada da navegação, sem duplicar um conjunto de verificações em cada página.

## 5. Atualização do cartão de atividade

Restaurar o comportamento de atualização da pré-visualização de atividade já existente em staging: é possível atualizar ao recuperar o estado visível, após o login e após a conclusão do resgate; em caso de falha temporária de rede, manter o último resultado válido. A lógica de polling/atualização removida indevidamente no branch atual não deve ser removida como limpeza não relacionada a este Todo. O intervalo exato de polling não faz parte da abstração de Provider e pode manter a implementação existente.

## 6. Pontos de aceitação

- As cinco categorias de estado — não resgatado, resgatado e pendente, efetivo sem modelos, efetivo com modelos e consulta desconhecida — são exibidas e recuperadas corretamente.
- Ao usar o Coding Plan pessoal, os direitos de Team e Start continuam sendo consultados de forma independente; conexões já resgatadas mas não selecionadas não entram no Model Selection atual.
- Após o resgate do Start Plan é possível ver o horário de efetivação; enquanto pendente não há troca automática, e quando efetivo e executável a troca ocorre apenas pelo clique ativo em "Começar a usar".
- Quando não há modelos disponíveis não é produzida uma seleção de modelo válida; os resultados da página do Provider, do Registry e do Model Selection são consistentes.
- Navegação inválida de Provider não trava e não quebra a página atual do usuário.
- O cartão de resgate mantém o comportamento correto de atualização após login, reexibição, conclusão do resgate e falhas curtas de rede.
- Cobrir a exibição de estado e o comportamento das entradas tanto no desktop quanto no Web/remoto; E2E gráfico de desktop reexecutado em MacBook Pro; não alterar os limites da cadeia de mensagens entre continuous do desktop e replayable da Web.

## 7. Relação com os Todos existentes

- Todo 50/51 já definiu os limites existentes entre habilitação de configuração de Provider, direitos de conta e Off-Peak; este Todo não restaura o `enabled` de nível superior do Provider nem altera a configuração estática de ocultação do Off-Peak.
- Todo 69/70/71/72 cuida da compatibilidade de rollback, migração de dados antigos e restauração do Model Selection; este Todo não adiciona migração de seleção nem deixa o estado de Account sobrescrever a escolha do usuário já restaurada.
- Todo 76 cuida da estratificação do Built-in Config; este Todo apenas consome sua configuração unificada Provider/Model Effective e não escreve direitos dinâmicos no Built-in Template.
- Todo 78 cuida dos testes E2E de Provider do desktop ainda devidos; a matriz de estados e o fluxo de resgate deste Todo devem ser incorporados a essa consolidação de E2E, sem substituir a verificação de interface real por testes unitários.
- Todo 81 cuida da consolidação das mensagens de invalidação de seleção de modelo por cenário; este Todo define apenas o estado do Account Provider e os pré-requisitos de navegação, sem relatar erro de migração do Composer para direitos ainda pendentes.

## 8. Não objetivos

- Não achatar o Account Provider para um Personal Provider comum.
- Não remover a persistência da seleção de conexão por Family nem adicionar campo persistido `current` por Provider.
- Não usar o estado dinâmico do Account Provider para reescrever o `visibility` do Provider Config comum.
- Não forçar o usuário a mudar para o Start Plan só porque o plano foi resgatado.
- Não substituir o Account Provider sem modelos disponíveis pelo modelo padrão ou pelo primeiro item da lista de Providers.
- Não adicionar correção automática por sobrescrita para configurações históricas que já foram migradas incorretamente e gravadas em disco; esses casos continuam sendo tratados manualmente.

## 9. Registro da primeira implementação (2026-09-04)

Nesta rodada, primeiro concluímos o portão de navegação de resgate seguindo o princípio "só alterar quando houver risco de comportamento claro". O código existente já cobre os seguintes comportamentos previos:

- `CodingPlanAvailabilityResult` com `available / unavailable / unknown` é produzido de forma unificada pela camada de serviço; o tempo de efetivação futuro do Start Plan é resolvido a partir do `effectiveTime` do snapshot de direitos, exibido no diálogo de resultado do resgate e com o uso antecipado desabilitado.
- Após o resgate bem-sucedido, a pré-visualização de atividade, o snapshot de direitos e as Provider Settings continuam sendo atualizados em paralelo; em caso de falha de rede, o resultado de sucesso do resgate é mantido, sem rebaixar uma falha pontual para "não resgatado".
- A seleção por Family continua sendo a única seleção de conexão persistida, sem novos campos `current`, `visible` ou `entitled` de nível de Provider.

Correções determinísticas acrescentadas nesta rodada:

- `ManualClaimPlanBanner`, após o usuário clicar em "Começar a usar", executa uma verificação centralizada usando o `ProviderSettingsView` mais recente após o resgate.
- Quando a atualização do Provider falha, o Provider de destino não existe/não é executável, ou não há pelo menos um modelo que seja simultaneamente `executable` e `selectable`, nada é escrito em `providerFamilyConnectionSelections`; apenas se exibe "O Start Plan ainda não está disponível".
- Mesmo com o resgate bem-sucedido, se a consulta de direitos falhar, o diálogo de sucesso é mantido; a troca só é permitida quando o View mais recente do Provider passa pelo portão.

Verificação:

- Testes afetados: 7 arquivos, 94 tests passed.
- `pnpm typecheck`: passou.
- `pnpm lint`: passou (o repositório já tem 40 warnings, 0 error; esta rodada não adicionou nenhum error).

Nesta rodada não forcamos o merge do snapshot de direitos, do Provider Runtime e da exibição de Settings em um único DTO duplicado; hoje eles consomem respectivamente a disponibilidade de conta da camada de serviço, a Provider Settings View e o snapshot de exibição de direitos. Se mais adiante quisermos realmente unificar o contrato de dados dos três, devemos primeiro obter evidência de runtime do estado duplicado entre páginas e então abrir um Todo separado, evitando introduzir um segundo cache ou uma sincronização assíncrona mais complexa por causa da "unificação".