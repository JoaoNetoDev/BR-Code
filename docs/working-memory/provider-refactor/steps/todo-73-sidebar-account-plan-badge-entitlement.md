# Todo 73: Desacoplar o rótulo de plano da conta na barra lateral dos direitos de pessoa física／equipe

> Atualização de atribuição de verificação (2026-09-09): as lacunas de teste, falhas e promoções manuais remanescentes neste documento foram transferidas para [Todo102](todo-102-verification-debt-closeout.md), que encerra o cronograma de verificação independente definido aqui; as evidências históricas são mantidas, e a transferência não significa que os testes passaram.

> As lacunas de E2E gráfico da barra lateral foram transferidas de forma unificada para o Todo 78; este Todo mantém a implementação funcional e os registros de teste unitário.

> Status: concluído (os testes unitários relacionados, a verificação de tipos e o lint passaram; o E2E gráfico do desktop aguarda uma nova execução no ambiente Mac).
>
> Origem: retorno do mundo real de um MacBook Air em 2026-09-03, com o rótulo de nível individual／Team ao lado do nome de usuário no canto inferior esquerdo desaparecendo.
>
> Relação: encerramento dos consumidores de Provider Account Access; não depende da implementação dos Todos 68–72 e não altera código nesta entrega.

## 1. Problemas confirmados e evidências

O componente de rótulo ainda existe; não foi o branch `fix/model-settings-ui-polish` da designer que removeu o rótulo, nem é um problema de CSS descoberto agora.

O `~/.zcode/v2/logs/2026-09-03.log` do Air registra às 15:51:36.836 o resultado da sincronização de conta:

- `account:bigmodel-individual-coding-plan.access.entitled = false`;
- `account:bigmodel-team-coding-plan.access.entitled = true`.

A consulta de cota da equipe teve sucesso no mesmo período. Isso mostra que a conta realmente tem o direito da equipe, portanto o desaparecimento do rótulo não pode ser explicado como ausência de plano. As evidências desta rodada são log e código; a verificação no Air após a correção ainda não foi concluída, nem foi obtido um snapshot CDP do estado atual do componente em memória.

`WorkspaceSidebarFooterUsageSummary.tsx` chama `resolveEntitledAccountProviderAccessFingerprint()` com o Individual Provider, mas usa esse fingerprint como pré-condição de `enabled` para `useEnterpriseCodingPlanProducts()`. Sem o direito individual, a função devolve string vazia e a consulta da equipe é desligada. Em seguida, `subscribedTeamProducts` fica vazio e o badge do avatar retorna null. O Z.ai tem o problema simétrico.

```text
没有个人套餐权益
        |
        v
Individual fingerprint 为空
        |
        v
Team pricing 查询被禁用
        |
        v
Team 标签的数据为空，即使 Team Provider.entitled = true
```

Historicamente foi mantida uma trava na consulta do Provider individual; quando a refatoração de Provider separou as identidades individual／equipe, esse desacoplamento não foi feito junto. `bec05c983c` voltou a restringir a interface de leitura à semântica de entitled, e a dependência errada continua existindo. Não se trata de afrouxar `resolveEntitledAccountProviderAccess()`, mas de fazer o chamador ler o fato do produto correto.

## 2. Comportamento confirmado e atribuição de estado

```text
当前账号 Family + Ready ProviderSettingsView
        |
        +--> Individual access.entitled + 个人等级查询 --> 个人等级标签
        |
        `--> Team access.entitled --------------------> Team 标签候选

显示优先级：已确认的个人等级优先，否则按既有加载规则显示 Team；都没有则不显示。
```

- O rótulo Team consome diretamente o Team Provider `effectiveConfig.access.entitled` da mesma Family; não exige plano individual, Team selecionado no momento, modelo executável, API Key, nem usa o sucesso de pricing como pré-condição da identidade de equipe da conta.
- O nível individual continua usando o snapshot de entitlement individual já existente e a formatação de nível já existente, sem nova inferência de nível nem texto substitutivo.
- Mantém-se a proteção de prioridade já existente durante o carregamento da consulta individual; Not Ready／falha de leitura não é tratado como ausência confirmada de direito.
- O isolamento por Family da conta atual permanece; os rótulos são derivados novamente ao trocar de Family, ao sair da conta e após a atualização de direitos, e o estado antigo de Team de outra Family não é exibido.
- O rótulo é apenas exibição: não grava no Account Overlay, não altera seleção de modelo／credenciais／cota e não adiciona estado persistido nem polling.
- O pricing de Team continua responsável por informações de organização, projetos, preços e entrada de upgrade; não se pode remover todas as consultas relacionadas só porque o avatar deixou de depender delas.

## 3. Superfície de impacto (Impact Brief)

Modo: planning; camada: presentation / validation. O escopo fica limitado ao rótulo de plano da conta e aos ajustes necessários no hook compartilhado.

| Entrada／prioridade | Implementação e dados compartilhados | Limite desta rodada |
| --- | --- | --- |
| Badge do avatar, must-inspect | `WorkspaceSidebarFooter` → `useWorkspaceSidebarFooterUsageSummaryState` → `resolveSidebarFooterProfilePlanBadge` | Ler separadamente os fatos individual／equipe, preservando o estilo atual e a internacionalização |
| Cota e upgrade do Footer, must-inspect | O mesmo hook de UsageSummary, `teamSources`, `currentUsageSource` | A consulta de Team não depende do direito individual; as origens de organização／projeto não regridem para a origem individual |
| Cartão de plano em Provider Settings, should-inspect | Helper de Account Access, hook de enterprise pricing | Manter o comportamento atual de conta e de cartão de plano, sem afrouxar globalmente o helper |
| Desktop／Web／mobile／remoto, invariant-only | Hooks existentes, injeção de serviço e limites de Family | Reaproveitar a origem atual dos fatos da conta, sem novo runtime nem conexão direta a API de plataforma; não alterar a cadeia continuous/replayable de tarefas |

Os fatos autoritativos vêm do serviço de conta, projetados por Account Overlay / ProviderSettingsView; níveis e preços mantêm seus próprios serviços e caches já existentes.
O rótulo não tem rascunho de Composer, herança de modelo padrão, comando de envio ou ponto de persistência. Entradas diferentes compartilham os dados, mas não compartilham todas as condições de exibição.

Não há ferramenta de codegraph disponível nesta rodada; as evidências foram obtidas por conferência direta do código-fonte, dos chamadores e do histórico git na rodada anterior; o escopo vai do Footer até as duas camadas de hooks/helper.
O teste existente `packages/ui/test/workspaceSidebarFooterWebRemoteControlTooltip.test.ts` já cobre as regras do rótulo, mas não substitui uma regressão de componente/hook para "quando há apenas o direito de equipe, a camada upstream realmente entrega o fato de Team".

Graph drift / proposed delta: `capability.plan-entitlements` deve incluir a entrada de rótulo do Footer e a invariante de que Team não depende de Individual.
O arquivo de grafo está sendo modificado por outra tarefa no momento, sem edição paralela por enquanto; na implementação, completar na mesma direção e executar a verificação de integridade do grafo.
As descrições antigas de Provider ID / enabled / apiKey no documento de fatos relacionado `docs/usage-stats-app-coding-plan-split.md` não são o contrato atual; não restaurar o design antigo com base nelas; este Todo não se expande para uma reescrita de todo o design de estatísticas de uso.

## 4. Lista de execução

- [ ] Primeiro adicionar a regressão: com ProviderSettingsView no formato real, individual false／equipe true, montar o Footer e afirmar que o rótulo Team aparece.
- [ ] Ler separadamente o Account Access individual／equipe da mesma Family, corrigir as entradas do badge e a trava da consulta de equipe, removendo variáveis／comentários enganosos.
- [ ] Verificar as dependências de memos como `teamSources`: a leitura do Team Access precisa assinar mudanças nos fatos de Team, não depender apenas do Individual Access.
- [ ] Preservar as consultas de pricing necessárias para a entrada de cota／upgrade; construir corretamente os projetos de equipe assinados mesmo sem direito individual, sem adicionar consultas duplicadas.
- [ ] Atualizar as specs／o grafo e os testes relacionados, deixando explícito que identidade da conta, nível e preço de projeto são fatos diferentes, sem criar um novo modelo de estado.
- [ ] Complementar o E2E de interação, executar os testes unitários afetados, `pnpm typecheck` e `pnpm lint`; validar no MacBook Air e registrar o número do commit, capturas de tela e logs anonimizados.

## 5. Casos de aceitação e passagem de bastão

As dimensões confirmadas são apenas Family, direitos individual／equipe e estados de carregamento／refresh; não são expandidas combinações não relacionadas de modelo, reasoning e fila de tarefas.

| Caso | Configuração e ação | Expectativa e evidência |
| --- | --- | --- |
| 73-01 | BigModel individual false, equipe true; partida a frio da barra lateral | Mostra Team; regressão de componente／hook + E2E + Air |
| 73-02 | Z.ai também apenas com direito de equipe | Mostra Team; regressão de componente／hook |
| 73-03 | Com nível individual, combinado com／sem direito de equipe | Em ambos os casos tem prioridade o nível individual; regressão das regras existentes |
| 73-04 | Sem nenhum direito, ou apenas Start Plan | Não fabrica nível individual／Team; teste unitário |
| 73-05 | Mudar de uma Family com Team para outra Family sem direitos, ou sair da conta | Não sobra rótulo antigo de Team; teste de componente |
| 73-06 | Consulta individual em carregamento, Provider View não Ready／com falha e depois recuperada; direito de equipe muda isoladamente | Desconhecido não é tratado como ausência confirmada de direito; após a recuperação exibe conforme os fatos mais recentes, sem depender de recarregar a página inteira |
| 73-07 | Com apenas Team, abrir a entrada de cota／upgrade do Footer; pricing falha | Em caso de sucesso mantém organização／projeto corretos; em caso de falha segue o tratamento de erro já existente, sem apagar a identidade de Team já confirmada |

Podas: sem requisições de modelo, sem novos fixtures de replay de provider; sem alteração de Session/Submission e sem extensão do espaço de estados de conversa.
O E2E controla a resposta de direitos sobre os fixtures de conta／Provider já existentes, aguardando um estado observável, sem usar sleep fixo.
Fazer verificações representativas em tema claro／escuro, português／inglês e tela estreita, sem refazer o design visual do rótulo. Cenários remotos mantêm o isolamento já existente das origens de conta.
Casos, coverage e estado do E2E estão como planned e serão arquivados conforme e2e-case-lifecycle na implementação; não se pode registrar a investigação de log desta rodada como verificação de correção aprovada.
No momento não há nada que exija nova decisão do usuário. O arquivo de teste detalhado e o horário de execução no Air serão definidos na implementação.