# Desacoplamento dos pontos de entrada do upgrade do Coding Plan

## Contexto

Historicamente, vários pontos de entrada que clicavam em "Fazer upgrade do Coding Plan" levavam à página de configurações de Model Provider e, por meio do campo de upgrade no target do Model Provider, faziam `ModelProviderSection` selecionar o provider correspondente e abrir o painel de compra. Isso atrelava o fluxo de compra ao estado de navegação da página de configuração de modelos, fazendo com que os pontos de entrada externos de upgrade dependessem da selected key da família de providers, do fallback do modo de conexão e da temporização de hidratação da página de configurações.

## Objetivos

- O ponto de entrada "Fazer upgrade do Coding Plan" é carregado por uma capacidade de diálogo em nível de UI, sem se apoiar em intenções de navegação externa de `SettingsPage`, `App`, do shell do workspace ou de `ModelProviderSection`.
- O ponto de entrada de upgrade deixa de usar a settings intent `codingPlanUpgrade*`; o componente de entrada chama diretamente `useCodingPlanUpgradeDialog().openCodingPlanUpgrade(target)`.
- Os antigos campos de redirecionamento de upgrade de Model Provider / Settings não são mantidos por compatibilidade; o comportamento de upgrade deve ser invocado diretamente pelo próprio ponto de entrada.
- A página de configurações de Model Provider continua responsável apenas pela configuração de providers, pela troca do modo de conexão e pela exibição dos cartões de status; o Subscribe / Upgrade dentro do cartão de status é apenas um ponto de entrada local e não hospeda pontos de entrada externos.
- Pontos de entrada externos não abrem mais Settings; ao fechar o painel de upgrade, permanecem naturalmente no workspace atual.

## Cadeia de interação

Ponto de entrada unificado:

```text
Sidebar / Chat quota / Input toolbar / Settings model provider status card
  -> useCodingPlanUpgradeDialog().openCodingPlanUpgrade({ providerId })
  -> CodingPlanUpgradeDialog
```

## Restrições de implementação

- `SettingsPage` não reconhece `codingPlanUpgradeProviderId` / `codingPlanUpgradeReturnTarget` / `codingPlanUpgradeFunnelContext` como pontos de entrada de upgrade.
- `ModelProviderSection` recebe apenas a intenção de posicionamento normal `modelProviderId` e não recebe mais intenções de compra por upgrade.
- O host de upgrade independente usa o provider id para resolver o provider OAuth, o provider de origem do produto, o estado do plano atual e o estado do token de compra.
- Quando o Start Plan abre o upgrade, a lista de produtos deve ser mapeada para o provider de Coding Plan pago da mesma família.
- Após a compra, a lista de providers e o estado de benefícios são recarregados, evitando que Settings / Usage continuem exibindo o plano antigo depois do fechamento do painel.
- Pontos de entrada externos de Workspace não devem trocar para Settings para abrir o painel de upgrade; a entrada apenas chama a capacidade de diálogo e, ao fechar, permanece naturalmente no contexto atual.
- O Subscribe / Upgrade do cartão de status dentro de Settings chama diretamente a capacidade de diálogo, não mantém estado do diálogo de compra e não passa props de compra para camadas superiores.

## Limites de integração do Todo103

- Mantém-se a direção de remover o painel de compra nativo em staging e usar uniformemente o WebView do site oficial; a seleção nativa de SKU, o polling de pagamento e a telemetria exclusiva deixam de ser restaurados como funcionalidades do cliente.
- Mantêm-se a resolução da origem do produto, a exibição das faixas empresariais, a telemetria dos pontos de entrada e a recarga após a compra, que continuam em uso; o upgrade a partir do Start aponta para um Individual Provider concreto do mesmo domínio, sem restaurar a identidade antiga do Coding Plan.
- A página de configurações usa ProviderSettingsView e a interface de escrita de Personal; a criação de templates, a edição/ordenação dinâmica de modelos e a troca manual de conexões inválidas não regridem por causa da remoção da interface de compra.
- Quando o cartão de status de Team inicia um upgrade, a audiência team continua sendo especificada; o cartão de status comum usa personal por padrão. A Team key passada pelos pontos de entrada de compra de equipe existentes continua sendo preservada. Remover o painel nativo não pode transformar silenciosamente um upgrade de Team em uma compra pessoal.
- A validação é feita conjuntamente por ponto de entrada, host de compra e recarga pós-compra; os testes exclusivos dos componentes nativos são aposentados junto com a funcionalidade correspondente, e os testes ainda usados pelos pontos de entrada atuais são mantidos.
- As estatísticas de planos para todas as conexões reutilizam o ProviderSettingsView da Environment raiz e a consulta somente-leitura de planos, sem ler o antigo `Provider.apiKey` e sem exigir current/executable. Start e o Individual concreto são consultados separadamente, e Team usa o pricing autenticado existente; a primeira falha de leitura em Settings não libera uma lista vazia, e a nova tentativa continua carregando apenas os dados.