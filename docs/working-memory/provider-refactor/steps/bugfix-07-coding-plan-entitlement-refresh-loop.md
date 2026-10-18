# Bugfix 07: refresh de entitlement do Coding Plan dispara loop de renderização na página de configurações do Provider

> Status: concluído
>
> Data: 2026-08-28
>
> Origem: React #185 (Maximum update depth exceeded) observado em máquina real, no macOS, nas Provider Settings

## 1. Problema

Após o usuário entrar em Coding Plan / Team Plan nas configurações de modelo, toda a área de configurações do Provider pode ser substituída pela página de erro React #185 pelo Scoped Error Boundary. A pilha de componentes de produção cai em `ModelProviderSection`, sem nenhuma cadeia de chamada de SQLite, requisição de modelo ou `reasoningLevel`.

Não se trata de corrupção de banco de dados, nem é causado pelo mapeamento de persistência de uso de `reasoningLevel -> variant`. `ControlHintTooltip` aparece no topo da pilha de componentes porque o botão de refresh do layout de configurações do Provider usa esse componente; uma reprodução independente com a mesma estrutura de Tooltip/Select não formou o loop.

## 2. Causa raiz

Após a refatoração da orquestração de entitlements de Family, `useProviderFamilyEntitlements` retorna um novo objeto simples a cada render; o `useMemo` final de `useCodingPlanEntitlements` por sua vez usa o objeto inteiro `zaiFamily` / `bigmodelFamily` como dependência, fazendo com que fatos de entitlement equivalentes também percam a estabilidade de referência.

A navegação do Provider é projetada a partir do resultado de entitlements. Cada alteração no objeto de entitlements recria os itens de navegação e `selectedNavItem`. O effect de refresh de acesso ao plano depende do `selectedNavItem` inteiro, e assim interpreta a "atualização de exibição de loading/snapshot do mesmo plano" como "o usuário reabriu o plano".

```text
Family Hook 每次返回新对象
        |
        v
权益结果每次返回新对象
        |
        v
导航重新投影 selectedNavItem
        |
        v
套餐访问 effect 再次 refresh
        |
        v
权益 setState 再次 render
        |
        `------------------------> React #185
```

O Hook de entitlements genérico ainda produz um objeto de state equivalente quando a freshness window é atingida, o que amplifica a dependência incorreta, mas não é a causa raiz deste caso; este Bugfix não mascara a semântica de disparo incorreta da página de configurações do Provider com uma defesa genérica de setState.

## 3. Princípios da correção

### 3.1 Resultados de entitlement de Family permanecem estáveis conforme os fatos reais

- O objeto retornado por `useProviderFamilyEntitlements` tem como dependências o id real do provider, fingerprint, enabled e os quatro campos de resultado de entitlement;
- Quando as entradas e os fatos de entitlement não mudam, o resultado de Family e o resultado final de `useCodingPlanEntitlements` mantêm a estabilidade de referência;
- Preserva-se a orquestração unificada de Family, sem voltar às duas implementações duplicadas de Z.ai / BigModel.

### 3.2 O refresh de acesso ao plano responde apenas a mudanças de identidade de seleção

```text
selectedPlanKey: null -> plan A  --> 刷新一次
selectedPlanKey: plan A -> plan A --> 不刷新
plan A 的 loading/snapshot 变化  --> 不刷新
selectedPlanKey: plan A -> plan B --> 刷新一次
```

- O effect depende apenas de `selectedPlanKey` e da função de refresh estável;
- Não depende do `selectedNavItem` inteiro, que contém campos voláteis como cota, status e projeção do Provider;
- Não se adiciona contagem máxima de refresh, trava booleana, timer ou engolimento de exceções.

## 4. Testes

Escrever primeiro o teste que falha e só então implementar a correção:

- Ao re-renderizar a mesma Provider Settings View com uma seleção de conexão equivalente, o Hook de entitlement retorna a mesma referência;
- Quando o Coding Plan é selecionado pela primeira vez, dispara um access refresh;
- Quando o mesmo objeto de plano é reprojetado e o loading/snapshot de entitlement é atualizado, não dispara novamente;
- Ao trocar Coding Plan para Team Plan ou para outro Family, dispara exatamente mais um refresh;
- API Key / Personal Provider não dispara access refresh de entitlement de plano;
- Os testes existentes de consulta de entitlement e de identidade de cache de Z.ai, BigModel, Start Plan e Team Plan continuam passando.

## 5. Critérios de conclusão

- A página de configurações do Provider não apresenta mais React #185 causado pelo refresh de entitlement de plano;
- A semântica de refresh de acesso ao plano é consolidada de "mudança de objeto" para "mudança de identidade de seleção";
- Os valores de retorno dos Hooks após a refatoração de Family têm referência estável;
- Não se modificam SQLite, `reasoningLevel`, Provider Registry ou a cadeia de execução de modelo;
- Os testes direcionados de UI, `pnpm typecheck`, `pnpm lint` e a verificação de formatação passam;
- O runtime de desenvolvimento no macOS não entra mais em crash ao abrir as páginas Individual/Team Plan de BigModel/Z.ai.

## 6. Resultado da implementação

- O Hook de entitlement de Family agora só produz uma nova referência quando o Provider real, a identidade de acesso ou o fato de entitlement mudam;
- O refresh de acesso ao plano foi consolidado do objeto de navegação inteiro para o `selectedPlanKey` estável;
- API Key / Personal Provider não dispara access refresh de plano, e atualizações de cota e loading do mesmo plano também não causam refresh repetido;
- Foram preservados a orquestração unificada de Family, o Provider Registry, o SQLite e os limites existentes de `reasoningLevel`, sem adicionar trava de contagem de loops nem fallback de exceções;
- Os 4 arquivos de teste relacionados passaram com 242 testes no total; `pnpm typecheck` e `pnpm lint` na raiz passaram;
- A suíte completa de testes unitários passou com 12,717 testes; há ainda 2 falhas preexistentes, respectivamente no script de notarização do macOS e na admissão de draft prewarm do SessionPane, sem interseção de arquivos ou cadeia de chamadas com a alteração deste Hook de entitlement do Provider;
- O `pnpm fmt:check` do repositório inteiro continua bloqueado pela sintaxe HTML do Electron fiddle e por um fixture GB2312 preexistentes; os arquivos alterados nesta mudança passaram individualmente na verificação de formatação.
- O E2E `CTP-02` existente cobre exatamente a abertura da página de configurações e a troca para Team Plan; o build de produção passou na máquina local, mas no Linux falta `xvfb-run`, e a sessão do Chrome encerra antes de executar o caso; a validação de execução no macOS ainda precisa ser refeita em um ambiente capaz de iniciar o aplicativo de desktop.
