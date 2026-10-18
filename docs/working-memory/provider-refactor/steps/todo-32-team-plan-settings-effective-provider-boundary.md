# Todo 32: fechamento da fronteira entre a página de configurações do Team Plan e o Effective Provider

> Status: concluído
>
> Data: 2026-08-27
>
> Origem: experiência prática da página de configurações do Team Plan e revisão de fronteiras do Provider Refactor
>
> Tarefas relacionadas: [`Todo 27`](./todo-27-provider-settings-dogfood-closeout.md),
> [`Todo 17`](./todo-17-provider-registry-settings-authority-boundary-closure.md)

## 1. Problema

A página de configurações do Team Plan comprime hoje identidade de navegação, Effective Provider, conexão de conta, direitos do plano, consulta de cota e exibição de erros no mesmo `ModelProviderNavItem`. A página de detalhes usa então o `status` do plano para decidir se renderiza toda a área de configuração de Provider:

```text
Fatos de configuração do Provider
Status de conexão da conta
Status de compra do plano
Consulta de cota do Team
Status da Team Project API Key
Informações de navegação da página
        |
        v
ModelProviderNavItem.status
        |
        +-- purchased -> card do plano + configuração de Provider/modelo
        `-- outros status  -> apenas o card do plano, ocultando a configuração de Provider/modelo
```

O gate real exige `dedicatedProvider !== null && status === "purchased"`. Portanto, enquanto a cota está carregando, quando a requisição falha, quando a Project Key está indisponível ou quando o servidor afirma explicitamente que não há alocação, o Effective Provider já existente, a lista de modelos e o ponto de entrada de edição do Personal Model Config desaparecem juntos.

A implementação atual também infere "plano do time não alocado" a partir de `statusLabelId` e combina várias causas em `unavailable`:

```text
Servidor afirma explicitamente que não alocou ─────────────┐
Team Project Key indisponível ─────────────────────────┤
Falha na requisição de quota / estado desconhecido ──────┼─> unavailable / teamUnavailable
Quota em carregamento e sem snapshot ────────────────────┘
```

Isso faz com que "o que o card de status do plano mostra" se torne erroneamente a autoridade sobre "a configuração de Provider existe", e também reporta um desconhecido temporário como se o servidor tivesse decidido explicitamente que não há alocação.

## 2. Fronteiras de autoridade já decididas

### 2.1 O significado de ProviderSettingsView

`ProviderSettingsView` não é uma nova camada de configuração nem uma segunda autoridade de configuração. É uma projeção somente leitura do resultado do mesmo Resolver oficial, voltada à página de configurações:

```text
ZCode Built-in Provider Config
             |
             v
Account Provider Config
             |
             v
Personal Provider Config
             |
             v
Effective Provider Config
             |
             +-------------------------+
             |                         |
             v                         v
ProviderSettingsView              Provider Registry
projeção completa de configuração   apenas membros completos e executáveis
```

`ProviderSettingsView.providers[].effectiveConfig` e `models[].effectiveConfig` são o resultado final que a página de configurações usa para exibir Provider/Model. `effectiveBuiltinConfig`, `personalConfig`, `personalExactConfig` e `issues` apenas complementam as informações necessárias para fontes de edição, restaurar padrões, gravação esparsa e reparo de configurações incompletas; não participam de um segundo Overlay.

A página de configurações não pode ler apenas o Registry, porque Providers/Modelos desabilitados ou incompletos são excluídos pelo Registry, mas ainda precisam permanecer na página para o usuário visualizar e reparar.

### 2.2 O Renderer não entende o Account Overlay

O Account Provider Config participa da geração do Effective Provider Config apenas a montante do Resolver:

```text
Built-in -> Account -> Personal -> Effective
```

A página de configurações de Provider não pode reler, reaplicar ou inferir o `enabled`, os membros de modelo ou o Access do Account Overlay. A página lê uniformemente o `effectiveConfig`, `models`, `enabled`, `executable` e `issues` finais do `ProviderSettingsView`.

O Access estático de conta necessário para as requisições de entitlement/usage do Team é obtido igualmente do `effectiveConfig.access` do Effective Provider selecionado; o `productId / organizationId / projectId` da conexão atual do Team vêm da seleção de navegação e servem apenas como contexto da requisição de entitlement/cota, sem serem gravados de volta no Provider Config, no Account Overlay, no Personal Config ou no Registry.

### 2.3 O status do plano não possui a visibilidade da configuração de Provider

A página do Team Plan é composta de forma fixa por duas projeções independentes:

```text
ProviderSettingsView
└─ selected providerId
   ├─ effectiveConfig
   ├─ effective models
   ├─ enabled / executable
   └─ fontes de edição Personal
             |
             v
      área de configuração de Provider

Team Plan selection
├─ productId
├─ organizationId
└─ projectId
             |
             v
      entitlement / quota
             |
             v
        card de status do plano
```

As duas projeções só se combinam no layout de detalhes à direita. O resultado da consulta do plano pode afetar o card de status, a cota, o retry e as ações de compra/gerenciamento, mas não pode decidir se o Effective Provider, a lista de modelos ou o ponto de entrada de edição de modelos existe.

## 3. Estrutura de página desejada

Sempre que o `ProviderSettingsView` contiver o Team Provider atual, o lado direito mantém sempre a mesma página de Provider:

```text
┌─────────────────────────────────────┐
│ Título, status e modo de conexão do │
│ Provider                            │
├─────────────────────────────────────┤
│ Card de status do Team Plan         │
│ Organização / projeto / cota / erro │
│ / retry                             │
├─────────────────────────────────────┤
│ Lista de modelos efetivos           │
│ Model A                  [toggle][editar]│
│ Model B                  [toggle][editar]│
└─────────────────────────────────────┘
```

- A exibição, ordenação, ativação/desativação e a edição do Personal Model Config para modelos do Team Provider continuam usando o componente unificado de configurações de Provider;
- Os membros de modelo específicos da conta do Start Plan mantêm a fronteira somente leitura já existente, e este Todo não a altera;
- As páginas de Individual / Team Coding Plan ocultam completamente Endpoint e API Schema. Isso é apenas a projeção de produto da página de configurações: os campos continuam existindo no Effective Provider Config e são usados pelo Registry/Runtime; o Renderer não os duplica, não os limpa e não os sobrescreve;
- O Access de conta também não é exibido como campo de formulário editável;
- Quando o Provider está desabilitado, com configuração incompleta ou com plano indisponível, os modelos ainda podem ser exibidos e editados, mas o fato de não serem executáveis precisa ser exibido com precisão;
- Enquanto o Provider está carregando, exibe-se o estado de carregamento; quando o carregamento termina e o Provider realmente está ausente, exibe-se uma anomalia de configuração de Provider, sem se fingir não comprado ou não alocado.

## 4. Semântica de status

O status do Team Plan precisa preservar a causa explícita e não pode mais ser inferido ao contrário por um `statusLabelId` genérico:

| Status                     | Comportamento do card do plano                           | Área de configuração do Provider    |
| ------------------------ | ------------------------------------ | -------------------- |
| checking                 | Mostra carregando e limpa a cota do Team anterior       | Exibida se o Provider existir  |
| available                | Mostra a identidade do time e a cota                   | Exibida                 |
| explicitly-not-allocated | Mostra explicitamente "plano do time não alocado"             | Exibida                 |
| credential-unavailable   | Mostra o motivo da Project Key/credencial e as ações disponíveis  | Exibida                 |
| request-failed / unknown | Mostra a falha ao obter e permite retry, sem chamar de não alocado | Exibida                 |
| provider-loading         | Mostra o carregamento do Provider                   | O editor ainda não é exibido       |
| provider-missing         | Mostra uma anomalia de configuração independente                     | Não renderiza uma falsa página de compra de plano |

O tipo concreto pode reutilizar os resultados discriminados já existentes a montante ou estabelecer uma união discriminada local à página, mas só pode funcionar como View State do card do plano, nunca entrar no Provider Config nem se tornar um segundo estado de Account/Registry.

## 5. Plano de implementação

### 5.1 Primeiro fixar os testes de falha

1. Quando o Provider existe e a cota do Team está carregando, a lista de modelos ainda é renderizada;
2. Quando o Provider existe e a requisição de cota falha, a lista de modelos e o ponto de entrada de edição ainda são renderizados;
3. Quando o Provider existe e o servidor afirma explicitamente que não alocou, a mensagem de não alocado é exibida, mas a lista de modelos continua sendo renderizada;
4. Quando a Project Key está indisponível, o motivo real é exibido, sem chamar a cota de não alocada, e a configuração de Provider continua existente;
5. Provider ausente e plano indisponível usam estados de UI diferentes;
6. As permissões de edição de modelo de Team e de Start mantêm suas diferenças e não são unificadas por causa do componente compartilhado.
7. As páginas de Individual / Team Coding Plan não renderizam Endpoint nem API Schema; a ocultação não pode alterar o payload de gravação nem a configuração de runtime.

### 5.2 Remover o gate incorreto

- Remover o gate de renderização `status === "purchased"` para todo o `InlineEditableProviderCard`;
- Decidir a área de configuração apenas pelo fato de o `providerId` atual conseguir ser resolvido no `ProviderSettingsView`;
- `CodingPlanStatusPanel` permanece sempre como um `statusSection` independente dentro dos detalhes do Provider;
- A lista de modelos consome apenas os `models` da View do Provider atual e o `effectiveConfig` de cada item, sem construir membros de modelo a partir de dados de entitlement.
- Ao reutilizar o editor unificado de Provider nas páginas de Individual / Team Coding Plan, a seção de fatos de conexão fica permanentemente desabilitada; não se pode reexpor Endpoint ou API Schema para conseguir exibir a lista de modelos, nem criar um DTO de Account Provider com campos removidos.

### 5.3 Separar identidade de navegação e fatos da página

Restringir a responsabilidade de `ModelProviderNavItem` para que ela expresse principalmente navegação e seleção de conexão:

```text
Identidade de navegação
├─ key / type / label
├─ providerId
└─ Team productId / organizationId / projectId
```

Os detalhes do Provider são resolvidos de forma independente a partir do `ProviderSettingsView` pelo `providerId`; o status do card do plano é resolvido de forma independente a partir do entitlement hook pela seleção de Team. Um único DTO de navegação não pode continuar carregando e sobrescrevendo ao mesmo tempo Provider, cota, status de compra e status de erro.

Se restringir o tipo de uma vez ampliar as alterações em páginas Family sem relação, pode-se primeiro criar uma projeção de página unidirecional e migrar os chamadores; no fim, é obrigatório remover o ramo antigo que controla a existência dos detalhes do Provider via `status/statusLabelId`.

### 5.4 Limpar a inferência reversa de status

- Remover a comparação de `selectedTeamPlanUnassigned` com `statusLabelId`;
- Remover a lógica que combina `apiKeyStatus=unavailable` com `quota unavailable` e depois gera uniformemente `teamUnavailable`;
- Falha de requisição, loading e ausência de snapshot correspondente só podem expressar "desconhecido", nunca uma alocação autoritativa ausente;
- Só mostrar "plano do time não alocado" quando uma resposta autoritativa provar explicitamente que não há alocação/cota de Team;
- Os botões de ação do card de status decidem retry, reconexão ou gerenciamento do plano pela causa explícita, sem inferir o comportamento a partir do texto exibido.

## 6. Donos do estado e fronteira de gravação

| Fato                         | Owner autoritativo                        | Projeção na página                    | Persistido?         |
| ---------------------------- | --------------------------------- | --------------------------- | ------------------ |
| Effective Provider/Model     | Provider Config Resolver          | `ProviderSettingsView`      | Vem das fontes de Config oficiais |
| Edição de Personal Provider/Model | Personal Config Repository        | Settings Draft/Facade       | Sim                 |
| Executabilidade do Provider            | Resolver + integridade do Registry        | `enabled/executable/issues` | Não é um campo independente       |
| Identidade atual da conexão do Team            | Family connection selection       | Seleção de navegação                    | Configurações existentes           |
| Plano do Team, cota e erros        | Entitlement/Quota Service         | `CodingPlanStatusPanel`     | Apenas o cache existente         |
| Credencial durante a requisição                   | Host Account Request Auth Service | Não fica residente na página de configurações              | Não                 |

## 7. Invariantes e fora de escopo

Deve ser mantido:

- A ordem do Overlay continua sendo Built-in -> Account -> Personal;
- Os Model Rules continuam sendo Built-in + Personal, com Personal por último;
- O Renderer não reexecuta o Overlay, a validação de integridade nem o algoritmo de admissão do Registry;
- O Account Overlay ainda pode restringir o Built-in e o Provider da conta, mas só pode se refletir no resultado Efetivo através do Resolver;
- A UI de quota/entitlement do Team não modifica diretamente o `enabled` do Provider;
- Membros desabilitados/incompletos são visíveis em Settings, e o Registry continua mantendo apenas membros completos e executáveis;
- Escopo de Team não é gravado de volta no Config; o teste de conexão e as requisições reais continuam passando pelo Registry/ModelFactory oficiais;
- Ocultar Endpoint/API Schema nas páginas de Individual / Team só afeta a visibilidade na UI; o Effective Config e a montagem do ModelFactory permanecem inalterados;
- Desktop, Web e celular compartilham o comportamento da página de configurações; não muda o desktop continuous, o mobile replayable, o workspace remoto nem o ciclo de vida da seleção de modelos.

Este Todo não modifica:

- As regras de geração de negócio e as prioridades do Account Overlay;
- Os contratos de interface de servidor de entitlement, quota e billing do Team;
- A semântica da whitelist de modelos por conta do Start Plan;
- O Request Auth, os Runtime Headers e o protocolo de rede dos modelos;
- O Remote Provisioning, os artefatos de release ou a validação com contas reais.

## 8. Matriz de verificação

| Provider View   | Status do Team                | Área de configuração esperada                           | Card de status esperado           |
| --------------- | ------------------------ | ------------------------------------ | -------------------- |
| Existe e enabled  | available                | Exibida por completo, com edição dos campos Personal permitidos | Cota normal             |
| Existe mas disabled | available/unknown        | Exibida e marcada com precisão como não executável               | Status correspondente             |
| Existe            | checking                 | Exibida, sem flashing da lista de modelos                 | Carregando                 |
| Existe            | request-failed           | Exibida                                 | Falha ao obter + retry      |
| Existe            | explicitly-not-allocated | Exibida                                 | Não alocada explicitamente           |
| Existe            | credential-unavailable   | Exibida                                 | Motivo da credencial             |
| Carregando          | Qualquer                     | Provider loading                     | O status não pode se passar por não comprado |
| Realmente ausente        | Qualquer                     | Anomalia de configuração                             | Pode preservar fatos conhecidos do plano   |

A automação deve cobrir pelo menos:

- O Effective Provider/Model gerado pelo Resolver chega à página de configurações sem alterações através do `ProviderSettingsFacade`;
- `enabled/models/access` de Account não sofre uma segunda mesclagem no Renderer;
- A sobreposição final de Personal ainda se reflete no resultado Efetivo, e a gravação continua gerando um Overlay esparso;
- Uma mudança de status do Team apenas re-renderiza o card do plano, sem desmontar a lista de modelos nem perder o Draft de edição de modelos;
- Ordenação, toggle, edição, teste de conexão e feedback de gravação de Provider/modelo não regridem;
- Zh/en, temas claro/escuro e layouts de desktop e tela estreita funcionam;
- Testes unitários direcionados da UI de Provider, `pnpm typecheck`, `pnpm lint`, a verificação de formatação dos arquivos desta rodada e `git diff --check` passam.

## 9. Critérios de conclusão

- Nenhum status de consulta de plano do Team Plan controla mais a existência da área de configuração do Effective Provider;
- A página de configurações consome o Effective Provider/Model final apenas via `ProviderSettingsView` e não entende o Account Overlay;
- Identidade de navegação, fatos de configuração de Provider e status do plano formam pelo menos três caminhos independentes no nível da projeção de página;
- "Plano do time não alocado" só é produzido por um fato autoritativo de não alocação, e nunca mais por inferência a partir de erro, loading, problema de credencial ou label de i18n;
- A lista de modelos está sempre visível quando o Provider existe, com suporte a ordenação, ativação/desativação e edição do Personal Model Config conforme as permissões já existentes;
- As páginas de Individual / Team Coding Plan não mostram Endpoint nem API Schema, mas o runtime continua usando o Effective Provider Config;
- Não se cria um segundo conjunto de autoridade de Config, Overlay, Registry, plano ou Account Access.

## 10. Resultado da implementação

- Os detalhes de Provider de Team / Individual passaram a ser resolvidos com precisão por `providerId` a partir do `ProviderSettingsView`, sem mais usar a cópia possivelmente desatualizada do Provider no item de navegação como fato de página; quando a View já terminou o carregamento e o Provider alvo está ausente, exibe-se uma anomalia independente de configuração.
- O card de status do plano foi desacoplado da área de configuração de Provider quanto ao gate de renderização. No carregamento de quota do Team, na falha, na não alocação explícita e quando a Project Key está indisponível, o Effective Provider já existente e a lista de modelos continuam sendo exibidos.
- `not-allocated` e `credential-unavailable` passaram a ser causas explícitas de estado da página; o card de status não infere mais comportamento de negócio a partir de labels de i18n, e, quando a quota se recupera, o estado antigo de "plano do time não alocado" é removido junto.
- As páginas de Team / Individual continuam reutilizando o editor unificado de Provider, mas com a seção de configuração de conexão e a seção de API Key permanentemente ocultas, de modo que Endpoint e API Schema não aparecem na página; os dados do Effective Provider Config, do Registry e do ModelFactory não foram reduzidos.
- O Start Plan mantém os modelos somente leitura e o gate de compra já existentes; desta vez a semântica da whitelist de modelos por conta não foi alterada.

Resultado da verificação: 220 testes direcionados da UI de Provider passaram; a suíte completa de unit com 1470 arquivos de teste e 12480 testes passou (além de itens já ignorados pelo repositório);
o `typecheck`, o `lint` na raiz, a verificação de formatação dos arquivos desta rodada e o `git diff --check` passaram. O `fmt:check` de todo o repositório continua sendo bloqueado pela sintaxe de HTML de exemplo do Electron já existente no repositório e por um fixture em GB2312; os arquivos modificados nesta rodada passaram individualmente na verificação de formatação.