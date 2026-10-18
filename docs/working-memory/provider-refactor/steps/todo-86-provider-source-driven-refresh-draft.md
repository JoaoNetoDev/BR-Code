# Todo 86: Consolidação das Responsabilidades de Refresh do Provider e da Semântica de Espera (Rascunho)

> Status: a discutir, implementação não autorizada. Registro da sessão lateral de 2026-09-06.
> Arquivado em 2026-09-09: entrega retroativa deste rascunho histórico que não estava rastreado, o que não constitui autorização de implementação nem nova dívida nesta rodada. Os fatos abaixo são um snapshot de investigação de 09-06; já existem depois deles as correções parciais e a investigação dos Todo99/100 e a direção de adiamento do Todo101, portanto, ao retomar a discussão, é preciso primeiro deduplicar contra o código mais recente.
> Desta vez apenas registrar em disco; o esquema será confirmado na discussão seguinte; não interromper o trabalho de recuperação do Todo 85 nem modificar seu registro de execução.

## Problema e Fatos Verificados

Hoje o sucesso da atualização de assinatura é tratado pela página ativa chamando `providerSettingsService.refresh()`. Essa entrada não só atualiza a Account Source como também força a atualização do Built-in remoto e, em seguida, exige explicitamente que o Registry recalcule. Ao mesmo tempo, o Registry já assina as mudanças da Account Source / Config Source. Portanto existem duas formas de empurrar o fluxo a jusante; se isso produz cálculo duplicado depende do agendamento, e não se pode afirmar diretamente que tudo é calculado duas vezes.

Atualmente, `claimManualPlan()` em si apenas chama a interface de assinatura e retorna o resultado, sem notificar a Account Source. Não se pode simplesmente remover a chamada da página e com isso perder a atualização da conta após a assinatura.

Entradas de chamada em produção encontradas atualmente:

- Sucesso da assinatura: `ManualClaimPlanBanner.tsx`.
- Consulta do plano da conta após o login e na recuperação de inicialização: `oauthProviderFamilySelectionRefresh.ts`.
- Refresh público da raiz: `useRootProviderStateRefresh.ts`, usada no login, na recuperação de inicialização, no logout e em algumas verificações da orientação de login.
- Compra concluída: `CodingPlanUpgradeDialog.tsx`.
- Refresh manual na página de configurações: `useModelProviders.ts`.

Localização da cadeia de serviço: `packages/provider/src/facades.ts`, `packages/services/src/model-provider/providerRuntime.ts`, `packages/provider/src/account-provider-service.ts`, `packages/provider/src/registry-service.ts`. Antes de implementar, reconferir os pontos de chamada e o código após as modificações paralelas; esta lista não substitui a busca mais recente.

## Princípios Favoritos, Esquema Específico a Confirmar

```text
assinatura / compra / login 等账号变化 -> notificar a Account Source para obter o fato mais recente
salvamento de configuração             -> Config Source atualiza
                                 |
                                 v
                         Source publica um novo snapshot consistente
                                 |
                                 v
                         assinatura unificada dispara o recálculo do Provider
                                 |
                                 v
                         atualização da Settings / Selection View
```

A notificação de negócio deve ser consolidada em um ponto de orquestração de serviços / limite de injeção de dependência adequado. A UI não acessa diretamente a implementação concreta da Account Source, a Provider Store antiga não é restaurada, e não se exige que cada página atualize simultaneamente a Source e o Registry.

A maioria das chamadas só precisa disparar a atualização de forma confiável, sem esperar o fluxo a jusante; poucas chamadas realmente precisam da View mais recente e devem ser identificadas separadamente.

## Pontos Focais da Discussão de Amanhã

### 1. O refresh manual da página de configurações ainda é necessário?

Não decidir antecipadamente manter ou remover o botão. O reativo só consegue propagar mudanças que o cliente já descobriu, e não descobre sozinho mudanças no servidor. Verificar primeiro casos como assinatura/compra remota, expiração por tempo, recuperação de falha temporária e publicação do Built-in remoto, e conferir se eventos, polling e reconexão já cobrem esses casos.

Se a atualização automática for confiável o suficiente, pode-se considerar remover a entrada manual; se ainda houver um cenário de uso claro, descrever exatamente quais fontes o usuário está atualizando. Mesmo que o botão seja mantido, ele não deve se tornar uma segunda cadeia de cálculo a jusante.

### 2. Quais chamadas precisam esperar, e como esperar

Classificar cada entrada: apenas disparar, esperar a Source ou esperar a View derivada. Verificar com atenção a seleção de plano após o login, a consulta do resultado da assinatura e qualquer lógica que leia a View imediatamente após um `await refresh()`.

```text
Source finishes updating -> publishes the change -> downstream computation finishes -> latest View readable
       ^                           ^
  these two completion moments are not the same moment
```

Se for realmente necessária a View mais recente, estudar a reutilização do mecanismo existente de revision/snapshot para aguardar que o estado da fonte correspondente seja aplicado, em vez de um recálculo extra ou de sleep. Não se pode tomar uma View antiga como resultado novo nem esperar apenas "o próximo evento": quando o resultado do refresh não muda, pode não haver evento, e se deve confirmar imediatamente que o resultado existente já satisfaz o requisito. Verificar também como a espera termina em caso de atualização concorrente, falha ou destruição, sem introduzir previamente um framework de espera complexo e novo.

### 3. A consulta de entitlement da assinatura depende inutilmente do refresh completo do Provider?

A consulta de entitlement do staging fixo roda em paralelo ao refresh do Provider; atualmente a consulta é encadeada depois do refresh completo do Provider. Verificar de qual identidade de acesso da conta ela realmente depende, evitando que uma falha de atualização do Built-in não relacionado bloqueie a exibição do tempo de início de vigência. Não contornar as fronteiras corretas de credenciais, identidade da conta ou entitlement pendente só para ganhar paralelismo.

O sucesso da assinatura/compra é um fato do servidor e não deve virar falha de assinatura/compra por causa de uma falha de atualização posterior.

### 4. Escopo de consolidação das interfaces e dos negócios existentes

Determinar se `Settings.refresh()` deve ser removida, restringida ou alterada para solicitar o refresh das fontes e poder aguardar o resultado; revisar se as entradas de salvamento existentes, a inicialização de partida e o Provisioning remoto têm o mesmo problema de cálculo/espera, sem expandir este rascunho para uma reescrita da sincronização remota.

## Fronteiras com o Trabalho Existente e Verificação Posterior

- O Todo 83 / 85 é responsável por restaurar o comportamento correto de conta e assinatura; este rascunho discute as responsabilidades de refresh e não derruba estados de produto e arquitetura já confirmados.
- A proteção contra respostas antigas na pré-visualização de atividade, a nova consulta após mudança de login e o polling pertencem ao gerenciamento de requisições da UI de atividade, e devem ser mantidos; não devem ser confundidos com a atualização do Account Overlay.
- Por enquanto não há necessidade de mudança de estrutura persistente nem de migração de dados, e não se adiciona estado de conta duplicado.
- Após confirmar o esquema, adicionar primeiro testes com poder discriminante: mudança de conta é capaz de acionar o fluxo a jusante, a assinatura não força a atualização do Built-in, ausência de mudanças não gera espera eterna, fluxos que precisam de uma nova View não leem resultado antigo e falha posterior não reescreve o sucesso da assinatura. Envolvendo interação, validar no MacBook Air acordado; não empilhar testes sobre contagem de chamadas ou detalhes de implementação.
- Desta vez não foram feitas alterações de código, testes ou commit; o acima são fatos de investigação e direções pendentes de decisão, e não uma declaração de conclusão.