# Cadeia atual do modelo da caixa de entrada, Provider e Team Plan

Data de atualização：2026-07-15

> **Nota sobre a cadeia histórica, substituída pelo Provider Refactor.** As descrições de App
> Provider Snapshot, `modelProviderService` e do envio do Registry para o workspace não são mais
> fatos atuais. A UI atual consome a Model Selection View do Environment alvo; Provider e Account
> Overlay são resolvidos dentro desse Environment. O design atual está em
> `docs/working-memory/provider-refactor/design/`.

## Conclusão

A caixa de entrada não é a fonte de verdade do provider registry nem do session config. A cadeia atual
se divide em três fronteiras:

```text
App modelProviderService + entitlement + family settings
  -> V4ComposerToolbar constrói o catálogo visível de modelos
  -> seleção do usuário
      draft: draftConfigRef + workspace default + session CAS pré-aquecida
      session: V4 switchModelConfig CAS
  -> CLI runtime config (autoridade da sessão)
  -> ConversationSnapshot.config (valor atual da barra)
```

- o app provider snapshot determina "quais providers/modelos podem ser exibidos e selecionados";
- `ConversationSnapshot.config` determina qual é o modelo "atualmente real" de uma session existente;
- o draft não tem fato de session histórico, então o valor inicial é estabelecido a partir da última
  seleção global, do catálogo do workspace e da seleção explícita deste draft;
- Team Plan é uma identidade de conexão da família BigModel, não um novo tipo de modelo; o runtime
  provider continua sendo `builtin:bigmodel-coding-plan`, e a organização/projeto do time apenas
  determina as credenciais e o contexto da requisição.

## Entradas de código atuais

| Módulo                                                                                      | Responsabilidade                                                            |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`                                       | combina config do V4, provider snapshot, family settings e entitlement e monta o menu |
| `packages/ui/src/ModelConfigSelect.tsx`                                                   | exibição pura, seleção, dica de bloqueio e entrada de "gerenciar modelos"     |
| `packages/ui/src/lib/modelSelectionGroups.ts`                                             | agrupamento e ordenação de provider/modelo e mapeamento de runtime id        |
| `packages/ui/src/chat-input-toolbar/modelSelection.ts`                                    | funções puras de normalização de valor válido, visibilidade de family/Plan e fallback de modelo indisponível |
| `packages/ui/src/v4/composer/useDraftConfigControl.ts`                                    | hidratação do draft, eco otimista, workspace default e config de primeiro envio |
| `packages/ui/src/v4/SessionPane.tsx`                                                      | command de config do V4, restauração automática do provider registry e barreira de envio |
| `packages/ui/src/hooks/useModelProviders.ts`                                              | hidratação e atualização compartilhada do app provider snapshot              |
| `packages/ui/src/lib/modelProviderRuntimeSync.ts`                                         | sincroniza o app registry em uma direção para os workspaces já abertos       |
| `packages/services/src/model-provider/modelProviderService.ts`                            | provider registry, domínio de family e projeção de runtime do Team Plan      |
| `packages/services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts` | pré-aquecimento de produtos, projetos e key do Team Plan                    |

## Fontes de dados do menu de modelos

### Catálogo de providers

`useModelProviders` lê primeiro `getAllCached()` e depois `getAll()` em segundo plano; após salvar na
página de configurações o snapshot compartilhado é atualizado imediatamente, e alterações em campos
críticos de runtime são sincronizadas com todos os workspaces já abertos. O menu do ZCode Agent usa
apenas o app provider registry para construir os grupos de provider/modelo e não mistura de volta no
catálogo completo a native available list retornada pela CLI.

Para entrar no menu, um provider precisa no mínimo:

- estar enabled;
- ter modelos;
- ter credencial disponível ou ser permitido pelas regras de autenticação específicas de
  Coding/Start Plan;
- ter endpoint format utilizável pelo runtime do ZCode Agent;
- não ter sido filtrado pelo provider family, pela seleção de conexão atual ou pelo entitlement.

Enquanto o catálogo ainda está sendo hidratado por entitlement/provider, um modelo historicamente
visível que está temporariamente invisível não deve ser classificado imediatamente como indisponível.
Só depois de a hidratação terminar e de o modelo de fato não existir uma session existente pode
selecionar o primeiro fallback visível via `modelAutoPosition.ts` e gravar a seleção de volta na CLI.

### Valor atual da session

Para uma session existente, provider/modelo/thought lêem apenas `snapshot.config`. O
`configOptions` do workspace fornece o catálogo e o default do draft, e não mais sobrescreve uma
session já vinculada via `taskConfigOptionsByTaskId`, task meta ou last-selected.

O valor atual do draft é composto por `useDraftConfigControl`:

1. última seleção global sob a identidade de workspace atual;
2. catálogo de modelos do workspace;
3. seleção explícita do usuário neste draft (maior prioridade);
4. preferência de renderer draft mode e app follow-up setting.

## Family e modo de conexão

`providerFamilyDomain` é a primeira fronteira do family de login/execução atual e só permite
`zai | bigmodel`. Dentro do family:

- `modelProviderFamilyModes[family]` escolhe a grande classe OAuth/Plan ou API Key;
- `modelProviderFamilySelectedKeys[family]` escolhe o item específico Start, Individual, Team project
  ou API Key.

A caixa de entrada mostra apenas os modelos do modo de conexão atual e não troca o modo de conexão
dentro do menu. O modo de conexão é alterado na página de configurações de Model Provider, e o
family header da caixa de entrada mostra apenas um badge curto. Providers personalizados continuam
usando o submenu de providers; o controle remoto pelo celular oculta a entrada "gerenciar modelos".

Após selecionar um modelo:

- session existente: `SessionPane` envia `switchModelConfig`, e revision/CAS com a send barrier
  garantem a ordem;
- draft: primeiro atualiza `draftConfigRef` e o valor otimista do catálogo do workspace, e quando há
  session pré-aquecida envia o mesmo command do V4;
- quando a CLI retorna `provider.notInRegistry`, sincroniza o registry por `workspaceIdentity` /
  `remoteSessionId`, resolve `runtimeModel` e tenta novamente apenas uma vez;
- sucesso ou noop devem ao final ser confirmados pelo snapshot config; não se pode substituir o fato
  de runtime pelo valor local do dropdown.
- quando o modo de conexão do family sofre fallback automático por atualização de entitlement,
  `SessionPane` deve trocar via CAS `switchModelConfig` o runtime provider antigo do snapshot atual
  para o novo modo de conexão; não basta atualizar a selected key da página de configurações ou o
  provider registry, senão o modo de conexão e o modelo da caixa de entrada divergem.

Detalhes sobre a cadeia de modelos em `docs/chat/model-resolution-chain-audit.md`.

## Coding Plan e Start Plan

- Z.ai Coding Plan pode ser mantido quando authenticated ou enquanto o snapshot ainda não foi
  hidratado; BigModel Coding Plan exige entitlement válido, e a team selected key passa por uma
  verificação de contexto de time.
- quando o Coding Plan pago tem entitlement válido, o Start Plan da mesma family fica oculto; apenas
  um `no_plan` explícito permite o fallback para Start Plan. Consulta em andamento, falha de rede ou
  token expirado não podem se passar por `no_plan`.
- modelos do Start Plan são restritos por lista branca, evitando que modelos fora de linha continuem
  aparecendo a partir do cache.
- context usage lê apenas a plan identity do modelo atual; não pode reusar o consumo de outra
  conta/family da sidebar.

## Semântica atual do Team Plan

O Team Plan só está disponível na family BigModel. Uma conta pode ter várias organizations/projects; a
chave de conexão precisa conter simultaneamente `organizationId + projectId`. O nome visível prioriza
o `organizationName` real e, quando ausente, não se pode fazer o ID, o nome do projeto ou um "Team
Plan" genérico passar por nome de organização.

Cada projeto de time comprado pré-aquece de forma independente a API key de nível de projeto:

```text
GET /api/biz/v1/organization/{organizationId}/projects/{projectId}/api_keys
  -> reutiliza name=zcode-team-api-key com keyType=2
  -> se não existir, cria via POST
  -> apenas o projeto de time selecionado copia o secret sob demanda
  -> o runtime usa apiKey.secretKey
```

- a requisição deve carregar os headers `bigmodel-organization` e `bigmodel-project`;
- não se pode reutilizar o `zcode-api-key` do preset pessoal, nem uma key de mesmo nome com
  `keyType != 2`;
- ao pré-aquecer todos os projetos do time, garante-se apenas que a key existe, sem copiar secrets em
  massa; a falha em um projeto não bloqueia os demais;
- `apiKeyStatus=available | unavailable` é um estado do produto. Itens unavailable são mantidos na
  página de configurações com a explicação do motivo, mas a caixa de entrada e a seleção automática
  de conexão não podem tratá-los como conexão enviável;
- runtime/quota consomem apenas a organização/projeto apontada pelo
  `modelProviderFamilySelectedKeys.bigmodel` atual; é proibido misturar outras keys de time no registry
  atual do Agent.

## Fronteiras de múltiplos dispositivos e de identidade

A autoridade do provider registry está no app/desktop Local Host e é enviada em uma única direção para
o Local/Remote Host que hospeda o workspace alvo e para sua CLI `workspaceKey`. A sincronização de
workspaces remotos, a restauração de modelo do V4 e a resolução de runtime devem carregar
`workspaceIdentity` e `remoteSessionId`; a chave de cache não pode usar apenas `workspacePath`. O
`/remote` do celular se anexa a um host/session existente e não cria outra cópia do provider registry
nem do runtime do Agent.