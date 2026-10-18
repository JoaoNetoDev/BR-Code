# Todo154 Pesquisa: Limitações Atuais do Provider Start Independente

> Data da investigação: 2026-09-16.
> Baseline de código da investigação: `c9f959050b8b17e0815f1680d674f09355649da0`.
> O workspace posterior já foi advanced para staging `2772217134`; esta investigação e as evidências dos 17 testes unitários ainda pertencem ao baseline original, e os números de linha e pontos de integração precisam ser revisados antes da implementação. O Todo153 upstream já estava ocupado; esta entry foi postergada pelo Todo153 para Todo154.
> Este documento preserva a investigação pré-implementação e não representa o estado atual do código; em 2026-09-16 a implementação foi autorizada, e a implementação final e a verificação Pro estão no Todo154 §8.
> Destino das conclusões: [Todo154](../steps/todo-154-start-plan-independent-provider.md); o design alvo segue o [Design V2](../design-v2/design.md).
> Este documento registra apenas fatos de código, diferenças em relação aos materiais existentes e limitações de evidência; ele não define candidatos de implementação como arquitetura.

## 1. Código real correspondente à demanda

| Fato | Entrada de código | Impacto nesta demanda |
| --- | --- | --- |
| Ambas as empresas têm um Start Provider ID fixo, com Access estático zhipu-account/start-plan | `packages/shared/src/model-provider-types.ts`, `model-provider-family.ts` | O objeto já existe; o que o usuário quer adicionar é uma entrada de exibição/uso independente, não uma nova conta de login |
| O serviço carrega o perfil/token OAuth por marca | `loadAccountIdentity` e a injeção de auth em `packages/services/src/node.ts` | O Start pode continuar usando o login atual; não há evidência de que esta demanda exija um segundo conjunto OAuth |
| A consulta de saldo do Start é independente do plano pessoal; o saldo determina os direitos e o conjunto dinâmico de modelos | `packages/services/src/model-provider/codingPlanProviderAvailability.ts` | Cancelar a conexão manual não pode cancelar o pending, o conjunto vazio de modelos nem a verificação de direitos |
| `current` é calculado pelo brand atual junto com `selection.kind` | `packages/services/src/model-provider/accountProviderConnectionResolver.ts` | Mesmo tendo direitos, sem Start selecionado não é a conexão de execução corrente |
| O Registry participa de `providerExecutable` por meio de `current !== false` | `packages/provider/src/resolver.ts` | Exibir o Start separadamente na UI não faz a execução real passar |
| Todos os pacotes de conta embutidos são classificados como account-plan; a seleção válida exige exatamente um `current` mapeado a `providerId` | `packages/provider-node/src/model-selection-facade.ts`, `packages/provider/src/effective-model-selection.ts` | Fazer Start e Team serem `current` ao mesmo tempo quebra a seleção de modelo; é preciso fechar uma política comum de seleção |
| A identidade do período da requisição exige que a selection atual corresponda a `access.mode` | `resolveCurrentAccountAccess` | Só abrir o Registry ainda seria rejeitado antes da autenticação |
| As credenciais do Start são lidas do `tokenSet.zcodeJwtToken` do login | `packages/services/src/model-provider/accountProviderRequestAuthService.ts` | Não é preciso adicionar cópias de token na Provider Config ou na UI |
| Os sub_itens de family são colapsados numa side key que usa o Start ID, e o detalhe é localizado pelo plano atual | `packages/ui/src/settings/model-provider-section/useModelProviderNavigation.ts` | Um Start independente exige ajustar a identidade de navegação e a resolução de detalhes juntas |
| Clicar em Start gera `kind:start-plan` e salva a family selection | `resolveConnectionSelectionForNavItem` / `persistProviderFamilyModeForNavItem` em `packages/ui/src/settings/ModelProviderSection.tsx` | Navegar na página hoje tem efeito colateral sobre a conexão de execução |
| O handler de desconexão chama o logout OAuth | `handleCodingPlanDisconnect` no mesmo arquivo | A desconexão do Start exige remover a ação correspondente, não apenas trocar o texto |
| A inicialização de login ainda pode escolher o Start, e o caminho de restart protege a antiga Start selection | `packages/ui/src/root/oauthProviderFamilySelectionRefresh.ts`, `packages/ui/src/lib/modelProviderFamilyConnectionSelection.ts` | A inicialização e o tratamento de registros antigos precisam ser planejados juntos |
| A observação de invalidação na raiz usa apenas o primeiro `current`, e o Toast guarda só um notice | `accountConnectionRefreshObserver.ts`, `useAccountConnectionLossNotification.ts` | Com coexistência, podem faltar avisos ou sobrescrever um ao outro; decidir se `current` é reaproveitado precisa incluir esses consumidores |

## 2. Cadeia de chamadas e state owner já conferidos

```text
OAuth profile/token + SettingService
                ↓
Account Connection Resolver → Account Source 状态/Overlay
                ↓
ProviderConfigResolver → Settings View / Registry
                ↓
Node ModelSelectionFacade → Effective Selection
                ↓
ModelFactory → Account Request Auth → Start JWT 请求
```

- `createNodeModelSelectionFacade` é usado tanto pelo providerRuntime dos services quanto pelo entrypoint do protocol do CLI.
- O Account Source revalida conta/config antes de publicar e rejeita resultados atrasados em caso de mudança; `resetPrevious` isola o LKG da conta antiga.
- Cada Environment de execução usa seu próprio Registry; a sincronização dos fatos de conta entre Host/Worker não pode virar sincronização da Registry inteira.
- O owner da navegação na página de configurações é a UI; o owner da persistência da conexão paga é o SettingService; a intenção original do modelo mantém o owner original em cada entrada.
- O `connectionKey` hoje inclui a selection; se o Start deixar de depender de conexão paga, vale avaliar a remoção dessa parte da identidade.

## 3. Diferenças em relação aos materiais antigos

| Material | Descrição/status atual | Tratamento nesta rodada |
| --- | --- | --- |
| [Todo101](../steps/todo-101-concurrent-account-providers-draft.md) | Draft de múltiplos Account Providers concretos coexistindo, explicitamente adiado | Nesta rodada o usuário só pede Start independente; não se restaura o方案 de múltiplos Team/instâncias dinárias/drawer |
| [Todo93](../steps/todo-93-account-plan-loss-manual-switch.md) | A invalidação só avisa uma vez, e o usuário precisa clicar para trocar | Mantém-se sem alvo de troca implícita; os efeitos colaterais do botão do Start independente precisam ser reconvergidos |
| `docs/testing/model-provider-restart-connection-e2e-cases.md` I27/MP-R03 | A matriz escreve Start→Team; o teste real injeta Recent e depois assere Configured Default | Drift entre matriz e código; não prova que uma Session normal mantém o Start antigo por muito tempo e não autoriza exigir migração total |
| `docs/testing/start-plan-manual-claim-e2e-coverage.md` | Ainda preserva o histórico de troca automática inicial e as decisões posteriores | Na implementação, atualizar a aceitação conforme o objetivo final; não reescrever o histórico como fato novo agora |
| plan-entitlements do feature graph | O seed `resolveLatestModelProviderFamilyConnectionSelection` não existe no arquivo atual; mantém-se a descrição antiga de fallback automático para o Start | Registrar o drift e convergir depois que a fase estabilizar; não alterar o grafo nesta rodada |

## 4. Correção da análise da cadeia de escrita e da decisão de não migrar

| Entrada | Fato atual do código | Evidência |
| --- | --- | --- |
| Session normal | `applySubmissionExecutionState` executa `setSessionModelSelection` e `persistRuntimeModelSelection` quando uma submissão normal começa de fato a executar; modelos temporários de escopo execution ficam de fora | `apps/zcode-cli/packages/core/src/runtime/methods/turn-model.ts:40`, `turn.ts:284` |
| Composer | `useDraftConfigControl` deriva `effectiveSelection`; `captureAcceptedModelSelection` escreve de volta no callback accepted, preservando o escopo original e a proteção de troca do usuário | `packages/ui/src/v4/composer/useDraftConfigControl.ts:172`, `:242`, `SessionPane.tsx:1493` |
| Automation | O primeiro despacho resolve a seleção de longo prazo pelo Host alvo e grava o resultado no run; o `automation.model_selection` de longo prazo não é atualizado por essa resolução | `packages/desktop/src/host/automationModelSelection.ts:5`, `host/index.ts:869`, `fixRunModelSelection` em `packages/services/src/session/automationRepo.ts` |
| Bot | A sessão é criada após resolver a primeira submissão do draft; após o binding, lê a seleção da Session, resolve e submete, passando pelo caminho de escrita da Session | `packages/services/src/bots/botsService.ts:4878`, `:4994` |
| Wiki | A nova geração resolve uma vez, e `RepoWikiDraftSummary` salva `modelConfig.modelSelection`; a página de falha preenche com a identidade de geração fixa já existente | `packages/services/src/repo-wiki/repoWikiModelClient.ts:98`, `repoWikiService.ts:369` |
| Subagent explícito | A seleção do profile é clonada e resolvida para esta execução sem modificar o profile; na herança usa o modelo pai | `apps/zcode-cli/packages/core/src/runtime/helpers/subagent-selection.ts:15`, `runtime/methods/subagent.ts:100` |

O fato de a função read-only de effective-selection não escrever na entrada original não permite concluir que toda a cadeia de submissão não escreve de volta. A partir daí foram derivados antes uma migração total de Session/draft, um snapshot de conexão de upgrade e uma versão de semântica por armazenamento — isso foi falta de investigação do assistente e foi retirado depois que o usuário apontou os fatos de escrita.

Evidência real de I27/MP-R03: `packages/desktop/test/e2e/helpers/model-provider-restart.ts:133` injeta a seleção em `localStorage` Recent; `conversation-session-model-provider-restart-recovery.test.ts:134` assere a recuperação para DeepSeek Configured Default. Não injeta o `runtime/model_selection` da Session nem prova que existe uma proporção residual de usuários reais.

O formato atual já consegue salvar o Provider ID completo do Start das duas empresas. Não há evidência de nível de formato que exija nova migração de dados; o usuário confirmou que a seleção anterior é mantida e interpretada pelas novas regras. Ainda pode haver configurações de longo prazo salvas com Start que dependiam do mapeamento pago; sob as novas regras elas usam o Start e, sem direitos, exigem uma nova escolha. Esse é um limite de produto já confirmado, e não o fato de que "todas as configurações já foram corrigidas automaticamente".

## 5. Investigação das entradas de submissão candidatas à recomendação

| Entrada | Fato atual de submissão | Limites em relação à recomendação |
| --- | --- | --- |
| Conversa | `createSubmissionFromComposer`/`dispatchSendText` do SessionPane formam uma nova submissão e escrevem de volta após o accepted | Botões, atalhos, anexos e novas submissões por fila/onboarding precisam compartilhar a checagem; não se pode enviar primeiro e recomendar depois |
| Formulário de tarefa agendada | `AutomationEditView.submitAutomation` chama `onSubmit` após validar, e salvar-e-executar também o reutiliza | Pode-se提示ar uma vez antes de criar/modificar o modelo salvo |
| Execução imediata de tarefa agendada | O management store chama apenas `runAutomationNow` com `automationId`, sem parâmetro de seleção desta vez | O usuário excluiu essa entrada; não se expande o protocolo |
| Wiki | `RepoWikiPane.generate` forma uma nova requisição; `regenerateFailedPages` é outro caminho com identidade de geração fixa | A geração manual nova entra; a complementação de páginas com falha e a atualização automática ficam de fora |
| Subagent customizado | `SubagentForm.handleSubmit` chama `onSave` após validar | Pode ser ligado na criação/modificação de modelo explícito; modificações em outros campos nãochemy:notificam |
| Subagent embutido/de plugin | Compartilham `SubagentModelOverrideControl`; `handleValueChange` → `persistConfig` salva na hora | A seleção de modelo é a própria submissão; ficam de fora apenas ajuste de intensidade de pensamento, herança/padrão e activate/desativação |
| Bot / execução em background / idle | Cada um já tem owner próprio de semântica de submissão e execução | O usuário excluiu a recomendação; os caminhos de execução atuais não mudam |

Fontes concretas: `packages/ui/src/v4/SessionPane.tsx`, `settings/AutomationEditView.tsx:1769`, `store/automationManagementStore.ts:424`, `repo-wiki/RepoWikiPane.tsx:795`, `settings/SubagentsSection.tsx:588`.

A origem do saldo já tem `UsageEntitlementSnapshot` e `startPlanQuotaBuckets.ts`: múltiplos buckets válidos casados por modelo, e unknown não é tratado como 0 nem como saldo positivo. Hoje a query `enabled` de `useV4SessionQuotaBanner` depende do Start já selecionado, portanto esse hook não pode ser usado diretamente como fonte de dados para a recomendação de modelo pago sem ajustar a condição de leitura.nem `Registry` executável com `entitlement=true` provam isoladamente que existe saldo disponível.

O nó model-selection do grafo descreve várias entradas compartilhando a leitura da seleção efetiva, mas não tem aresta nova de recomendação de submissão e preferência persistida desta rodada; a nova aresta fica temporariamente como um graph delta a ser extraído depois da estabilização, e o grafo não é reescrito nesta investigação somente-leitura. O fato de o observer global ainda encontrar o primeiro `current` continua válido; a solução final observa apenas a conexão paga e não adota a implementação candidata de múltiplas notificações globais.

## 6. Verificação e limitações

Em 2026-09-16, para conferir o comportamento existente, executou-se:

```sh
pnpm exec vitest run packages/desktop/test/automationModelSelection.test.ts packages/provider/test/facades.test.ts
```

Resultado: 2 arquivos, 17 testes aprovados. O teste de Automation verifica explicitamente que a seleção efetiva pode mudar o Provider, mas o `providerId` da config original não muda; o teste de Facade verifica que o resultado da resolução não escreve na entrada original. Isso, junto com a escrita da Session/Composer, forma evidência por entrada e não se substituem entre si.

- Não havia codegraph chamável; a conferência foi feita por busca precisa, imports e leitura dos principais chamadores, sem alegar exhaustividade sobre todos os caminhos dinâmicos nem sobre dados reais de usuários.
- Nenhum comportamento novo foi implementado; não se executou E2E de funcionalidade nova, requisição com conta real nem auditoria de dados de produção; credenciais e dados de tarefas reais não foram modificados.
- O ambiente da primeira rodada não tinha typescript; quando a preparação de implementação foi iniciada por engano, a instalação de dependências falhou na fase de compilação local de cpu-features/node-pty; depois disso os testes unitários puros acima passaram, e `architecture:check --changed` já passou uma vez. A afirmação antiga de que "todas as ferramentas ainda faltam dependências" está invalidada; na implementação, execute as verificações necessárias conforme o ambiente real.
- Dois rascunhos de teste escritos por mau-entendimento da expressão do usuário foram apagados; nenhuma implementação de negócio ou alteração de teste foi mantida, e eles não devem ser tratados como cases entregues.
- Não migrar é uma solução sustentada tanto pelos fatos do formato atual quanto pela regra final do usuário; não se garante que o efeito de execução de todas as configurações de longo prazo que dependiam do mapeamento antigo permaneça igual, e nenhuma lógica de correção automática foi adicionada por causa disso.

O objetivo e a aceitação atuais são mantidos por [Todo154](../steps/todo-154-start-plan-independent-provider.md); a pesquisa não estabelece um segundo plano de implementação pendente.
