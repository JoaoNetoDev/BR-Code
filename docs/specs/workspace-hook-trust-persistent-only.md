# Especificação de simplificação da confiança persistente em Workspace Hook

> Status: em 2026-08-13 a semântica de produto foi confirmada, e este documento passa a ser a fonte de fatos mais recente para a interação e o modelo de estado do Workspace Hook Trust. `Allow once`, `Keep blocked`, `trust_all`, o catch-up de SessionStart e os badges de múltiplos estados nos documentos antigos foram substituídos por este texto.

## 1. Objetivo

O Workspace Hook mantém apenas uma forma de autorização do usuário: estabelecer confiança persistente em uma declaração de Hook exata do workspace atual.

- O interruptor de configuração controla apenas se o Hook está habilitado.
- O botão "Confiar" apenas estabelece Trust persistente e não alterna a configuração; sua visibilidade vem do snapshot estático de Trust das Settings e não depende de já existir um fluxo de review em Runtime.
- Quando já confiável, não se exibe o botão nem um badge de "já confiável".
- Quando não confiável, não se exibe "precisa de revisão", "não confiável persistentemente", "vai/não vai rodar" nem outros estados derivados.
- Não há operação de autorização pontual, confiar em tudo ou bloquear nesta sessão específica de Workspace Hook.
- O `Allow once` das permissões gerais de ferramentas não faz parte desta funcionalidade e não é afetado.

## 2. Impact Brief

### 2.1 Camadas alteradas

| Camada         | Mudança desta rodada                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| presentation   | Remoção do painel de revisão independente e dos badges de estado na linha; a linha não confiável sempre exibe o botão "Confiar" à esquerda do interruptor de execução efetivo válido |
| validation     | Continua validando workspace identity, bundle digest, generation do fluxo de review, interaction e review item, e passa a validar o mesmo managed policy provider confiável antes de toda mutação de Trust das Settings |
| commit-effect  | O usuário só pode submeter mutações de Trust persistente de item único ou de itens explicitamente selecionados |
| persistence    | Continua usando o Trust store pertencente ao usuário, com chave `workspaceIdentity + hookDeclarationDigest`                                   |
| recovery       | continuous/replayable continuam projetando pending admission; timeout, desconexão e fechamento de página nunca escrevem Trust           |

### 2.2 Matriz de superfícies de UI

| Superfície                          | Exibição/estado local                                                                                                                        | Entrada de submissão                                                                                                                          | Estado autoritativo                                                                                             | Fronteira multiplataforma                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Settings / Hooks / linha de Workspace | A configuração do Hook e o snapshot do Trust store estático decidem a exibição do botão/interruptor; um review request ativo só oferece uma generation acionável | Com session command binding, reutiliza o review do Runtime; sem task/session, revalida o snapshot via Agent RPC de nível de workspace e, após passar pelo mesmo managed policy provider injetado pelo Host, submete o declaration digest exato | Runtime review controller / workspace pretrust authority + shared managed policy provider + user Trust store | Desktop e Web compartilham o componente; o remoto precisa carregar `workspaceIdentity` / `remoteSessionId`; é proibido criar uma task oculta só para confiar |
| Banner de pending na sessão         | `workspaceHookAdmission.pendingCount`                                                                                                        | `requestWorkspaceHookReview` e depois abrir as configurações de Hooks                                                                       | Runtime admission projection                                                                                   | Desktop continuous envia direto; Web remote replayable recupera a partir do snapshot    |
| Gate de dispatch do Runtime         | Avaliação do snapshot canônico                                                                                                                | Sem bypass de UI                                                                                                                              | Trust coordinator + security revision                                                                        | Todo SessionStart/tool dispatch compartilha o mesmo gate                                  |

### 2.3 Relações que precisam ser verificadas

- `must-inspect`: decision schema do protocolo compartilhado, review controller, Trust coordinator, componente de linha das Hooks Settings, i18n e testes relacionados.
- `should-inspect`: banner de pending, projeção continuous/replayable, Trust store, policy, revoke e mudanças de digest.
- `invariant-only`: `Allow once` das permissões comuns de ferramentas, boundary de execução do provider, fila do desktop e fila replayable do celular.
- `evidence-only`: painel de revisão antigo, testes de once-grant/session-family e textos de UAT; eles provam a limpeza completa e não definem mais o comportamento de produto.

O serviço de grafo de código não está disponível neste ambiente de trabalho; a superfície de impacto foi confirmada de forma cruzada pelo feature graph do repositório, pelo `dep:refs`, pelas cadeias de chamadas do protocolo e por referências de texto exatas. Esta rodada adicionou ao feature graph as relações que faltavam de capability do Workspace Hook Trust, surface de Settings, binding do renderer, controller do Runtime e Trust store.

## 3. Modelo de estado

O estado de confiança do usuário mantém apenas duas semânticas de produto:

```text
                         Hook declaration digest 变化
                    ┌──────────────────────────────────┐
                    │                                  v
               ┌──────────┐      点击“信任”      ┌──────────┐
               │ untrusted│ ────────────────────> │ trusted  │
               └──────────┘   精确校验 + 原子落盘 └──────────┘
                    ^                                  │
                    └──────────── exact revoke ────────┘
```

O estado de configuração é ortogonal ao estado de confiança:

| configured | trusted | Ação na linha          | Resultado no Runtime                          |
| ---------- | ------- | ---------------------- | --------------------------------------------- |
| off        | no      | Exibe "Confiar" e o interruptor efetivo travado em desligado | Não executa                        |
| on         | no      | Exibe "Confiar" e o interruptor efetivo travado em desligado, sem reescrever a configuração original | Pula e reporta pending   |
| off        | yes     | Mostra apenas o interruptor de configuração desligado | Não executa                        |
| on         | yes     | Mostra apenas o interruptor de configuração ligado     | Executa após passar pelos demais gates de policy/snapshot |

Quando não há confiança, o interruptor exibe "se está permitido rodar agora", e por isso é uniformemente desligado e não operável; o `configuredEnabled` original continua preservado na configuração do workspace. Se ele já era `on`, o Trust persistente bem-sucedido e a atualização das Settings fazem o interruptor voltar naturalmente para ligado; se era `off`, ele continua desligado após confiar, mas passa a ser operável. Abrir as Settings, exibir o interruptor travado ou iniciar um Trust não pode reescrever silenciosamente a configuração do workspace por efeito visual.

`blocked_policy`, Trust store corrompido etc. continuam sendo motivos de segurança do Runtime, mas deixam de se passar por uma escolha de confiança do usuário e deixam de empilhar badges de produto na linha do Hook. Quando a política não permite que o usuário escreva Trust, a operação "Confiar" precisa ser rejeitada pelo servidor e exibir um erro legível.

## 4. Interação do usuário

```text
会话发现 enabled + untrusted Hook，或 Settings 静态发现任意 untrusted Hook
  -> Runtime 自然事件仍跳过 Hook，turn 继续
  -> 用户通过 pending banner 或自行进入 Hooks 设置
  -> 静态 Trust 状态立即显示“信任”与锁定关闭的有效运行开关
  -> 点击后优先复用当前 session review flow
  -> 当前没有 task/session 时，经 workspace 级只读 Agent RPC 重新发现 canonical snapshot
  -> 使用与 session Runtime 相同的受信 managed policy provider 校验 mutation authority
  -> 仅 user_decides 可继续；deny / allow_trusted_only 返回稳定 reason code 且不写 store
  -> 同时匹配 workspaceIdentity + bundleDigest + hookDeclarationDigest 后提交该行
  -> Runtime 校验 immutable generation 与当前 bundle
  -> Trust store 原子落盘，security revision 递增
  -> 列表刷新；该行“信任”按钮消失
  -> 其他未信任行保持按钮可用
```

O botão precisa estar desabilitado enquanto a mutação está em andamento, para impedir envio duplicado por clique duplo; em caso de falha, o botão permanece e exibe um erro localizado. A linha em si continua editável, e o clique no botão precisa impedir a propagação, para não abrir o formulário de edição por engano.
Quando não há session command binding ativo, o botão ainda precisa aparecer e ser operável; o Hooks service só pode encaminhar a requisição à autoridade de Trust do Agent de nível de workspace, e não pode escrever no Trust Store por conta própria. Essa entrada não pode criar task oculta nem tratar o snapshot estático das Settings como base de autorização; o Agent precisa redescobrir e comparar com precisão o bundle canônico antes de submeter.

## 5. Tempo e ciclo de vida

- A confiança só vale para eventos de Hook que acontecerem naturalmente no futuro e não executa retroativamente eventos já pulados.
- Um `SessionStart` pulado não é reexecutado no segundo ou terceiro prompt da task atual; ele roda no máximo no próximo SessionStart real (nova task/session).
- O deadline de review apenas torna a requisição imutável expirada e fecha o snapshot de operação atual; não escreve uma decisão negativa nem limpa a pending admission.
- Fechamento de página, saída das Settings, desconexão do attachment e dismiss do banner não alteram o Trust.
- Após um trust parcial, o botão dos itens bem-sucedidos desaparece; se ainda houver itens pendentes, o Runtime publica uma nova generation e os demais botões continuam operáveis.

Sequência:

```text
Renderer              V4/Bootstrap                 Core / Trust Store
   │ 未信任行点击“信任”      │                              │
   ├─ session 存在: request review ─> open/reuse flow      │
   ├─ 无 session: workspace grant ─> rediscover snapshot   │
   ├─ exact item decision ─>│ validate identity/bundle/flow│
   │                        ├─────────────────────────────>│ atomic grant
   │                        │<─────────────────────────────┤ revision + evaluation
   │<─ settled old flow ────┤                              │
   │<─ requested next flow ─┤ (仅仍有 pending 时)          │
   │ refresh Hooks list     │                              │
   │ 按钮按 persistent Trust 消失                           │
```

## 6. Convergência de protocolo e domínio

`WorkspaceHookReviewDecision` mantém apenas:

```ts
{
  action: "trust_selected";
  reviewItemIds: string[];
}
```

Esta rodada remove do Workspace Hook:

- decisions `allow_once` / `trust_all` / `keep_blocked`;
- `WorkspaceHookOnceGrant`, o mapa de once grant e `trusted_once`;
- bloqueio de usuário por session-family e `blocked_user`;
- decisão automática de usuário por timeout;
- catch-up lazy de SessionStart;
- painel de revisão independente, controles de selecionar tudo/múltipla escolha, badges de múltiplos estados e os respectivos ramos de i18n/test-id/telemetry.

O exact revoke é mantido como capacidade de baixo nível e das outras entradas já existentes; a lista de Hooks atual não exibe botão de revogação.

## 7. Invariantes

1. Uma declaração sem confiança persistente não é executada em nenhuma entrada de dispatch.
2. Uma mutação de Trust precisa estar vinculada a `workspaceKey = workspaceIdentity?.trim() || workspacePath` e ao declaration digest exato.
3. Um workspace remoto não pode degradar para uma verificação baseada apenas em `workspacePath`.
4. generation vencida, mudança de bundle, item fora do snapshot e rejeição de política falham de forma fechada (fail closed).
   O pretrust das Settings sem session e o review de session precisam ler o mesmo `WorkspaceHookPolicyProvider` injetado pelo Host: `deny` retorna `workspace_hooks_blocked_by_policy`, `allow_trusted_only` retorna `workspace_hooks_policy_requires_pretrust`, e nenhum dos dois pode chamar mutação do Trust store. A UI ou a configuração de workspace/projeto não pode fornecer nem sobrescrever esse provider.
5. O Trust store fica no armazenamento pertencente ao usuário; um arquivo de workspace não pode se autoconceder confiança.
6. O continuous do Desktop não concatena mensagens de recuperação replayable do celular; o replayable do celular não contorna as fronteiras de snapshot/gap/owner.
7. A UI não chama o Repo diretamente; as Settings submetem pela fronteira de command/service já existente.

## 8. Planejamento de casos e podas

### Confirmados

| Caso  | Setup                                                                                                        | Ação                          | Asserções                                                                                                                        | Evidência                        |
| ----- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| WHT01 | enabled + untrusted                                                                                          | abrir as configurações de Hooks | Mostram-se apenas "Confiar" e o interruptor, sem badges de estado                                                      | UI + item de request do Runtime   |
| WHT02 | disabled + untrusted, com um review immutable atual existente                                                 | clicar em "Confiar"           | É possível pré-confiar persistentemente; a configuração continua desligada; o botão desaparece                            | UI + Trust store                  |
| WHT03 | múltiplas não confiáveis                                                                                     | confiar em uma delas           | Apenas aquela é persistida/desaparece; as demais seguem operáveis pela generation seguinte                                      | Protocol + store + UI             |
| WHT04 | um SessionStart confiável já foi pulado                                                                      | enviar novo prompt na task atual | Não há catch-up; só o SessionStart natural da próxima nova task pode rodar                                              | Ciclo de vida do Runtime          |
| WHT05 | review pendente                                                                                              | timeout/fechamento/desconexão  | O Trust não muda, a pending admission não muda e o review pode ser solicitado de novo                                          | Projeção de protocolo + store     |
| WHT06 | uma declaração confiável sofre mudança semântica                                                            | refresh/avaliação seguinte      | O novo digest não está confiável, o botão reaparece e o registro antigo não autoriza a nova declaração                     | Digest + UI + gate do Runtime     |
| WHT07 | tab local e remoto com o mesmo `workspacePath`, o remoto com identity própria                                  | procurar review/command binding nas Settings locais | Atinge apenas o binding local; a identity remota não pode virar canal de submissão local por fallback de path        | UI store                          |
| WHT08 | config explícita de projeto e auto-discovery apontando para o mesmo arquivo, ou candidatos com JSON corrompido | Runtime e Settings constroem snapshots separadamente | A mesma source canônica aparece uma única vez; candidatos com falha ainda ocupam a ordem de discovery e os digests coincidem | adapters + shared discovery      |
| WHT09 | banner de pending visível                                                                                     | clicar em "Ignorar"; em seguida o bundle digest muda | O bundle atual é ocultado imediatamente; o novo é reexibido; o reject do comando só gera log normativo em services/UI    | Interação de UI                   |
| WHT10 | pedidos de revisão consecutivos do mesmo snapshot ou dois envios concorrentes da mesma decisão              | `requestReview` / `respond`     | O flow é criado e supervisionado uma única vez; o Trust é persistido uma única vez e o segundo envio é superseded            | controller do bootstrap           |
| WHT11 | Trust já persistido atomicamente, mas o deadline encerra primeiro o flow antigo                               | controller conclui o resultado do envio | Reporta como aceito e emite um único Settled resolvido; não pode reportar como falha uma autorização bem-sucedida         | controller do bootstrap + store   |
| WHT12 | revoke do Trust store recebe lista de digests vazia; no Windows o rename encontra uso temporário             | revoke / escrita atômica        | Lista vazia é rejeitada como entrada inválida; `undefined` continua significando revogar tudo do workspace; EPERM/EBUSY/EACCES têm retentativa limitada | persistência de adapters |
| WHT13 | snapshot estático das Settings é untrusted, não há interaction de review, mas existe session command binding do mesmo workspace | abrir Workspace Hooks; clicar em "Confiar" | O botão aparece imediatamente; o interruptor exibe desligado e travado; primeiro solicita review e, ao receber a requisição immutable do mesmo bundle contendo o item, submete o Trust persistente | UI store + controller do bootstrap |
| WHT14 | existe apenas Hook configured-disabled + untrusted, ou não há session command binding | solicitar review / abrir as Settings | O controller permite criar flow para item pending disabled; sem command binding o botão ainda é clicável e a confiança é persistida via workspace grant; nenhuma exibição reescreve a configuração do workspace | UI + controller do bootstrap + services/Agent RPC |
| WHT15 | não há task/session e o snapshot das Settings expirou antes do clique, ou o Trust store está corrompido        | clicar em "Confiar"             | O Agent redescobre o snapshot; bundle/digest incompatível ou store corrompido falha de forma fechada, sem escrever Trust e sem criar task | protocolo compartilhado + pretrust do bootstrap + UI |
| WHT16 | não há task/session e o managed policy do Host é `user_decides` / `deny` / `allow_trusted_only`             | clicar em "Confiar" nas Settings | Só `user_decides` entra no grant exato; `deny` retorna `workspace_hooks_blocked_by_policy`; `allow_trusted_only` retorna `workspace_hooks_policy_requires_pretrust`; os dois últimos não chamam o grant do store nem deixam registro que passe a valer quando a política for flexibilizada | servidor de protocolo + shared policy provider + spy do Trust store |

### Podas

- `allow once × session family × restart`: o produto já removeu isso; não enumerar.
- `keep blocked × timeout × dismiss`: os três normalizam para "sem mutação de Trust"; não fazer arranjo de decisões negativas.
- `trust all × configured enabled`: a ação independente foi removida; seleção em lote não pertence à UI mínima atual.
- `trusted badge × will run badge × configured badge`: eliminar a exibição derivada evita explosão combinatória e promessas erradas.
- theme/locale/client mode não formam produto cartesiano completo com os estados de segurança; os testes unitários de UI cobrem PT/EN e tokens de tema, e os testes de projeção compartilhada cobrem a fronteira continuous/replayable.

## 9. Verificação

- Shared/contracts: o decision schema aceita apenas `trust_selected`; as actions antigas são rejeitadas.
- Core: admission apenas por Trust persistente; sem estados de once/user-block/catch-up.
- Bootstrap: após um trust único, o flow antigo é settled, e uma nova generation é publicada para os pendentes restantes; timeout não escreve estado.
- UI: a visibilidade do botão é determinada pelo estado estático não confiável; com session, solicita sob demanda e aguarda a requisição immutable exata,
  sem session, revalida via workspace Agent RPC e persiste a confiança;
  o interruptor não confiável fica desligado e travado conforme o estado de execução efetivo; desaparece após o sucesso; badges de estado e o painel antigo não são renderizados.
- Regressão: build real do desktop-agent da CLI, `pnpm typecheck`, `pnpm lint`, testes direcionados de Trust e testes da refatoração de provider.

## 10. Invariantes das correções de review

Esta seção registra as restrições de implementação após o review de 2026-08-13; elas corrigem apenas problemas de isolamento, determinismo e confiabilidade, e não ampliam o estado de produto.

1. Ao procurar review/command binding, o Renderer calcula primeiro o `workspaceKey` atual. Quando o binding traz `workspaceIdentity` não vazia, ele só pode ser estritamente igual a essa key; apenas um binding local sem identity própria pode usar fallback por `workspacePath`. Uma tab remota com o mesmo caminho nunca pode ser o canal de submissão do botão local "Confiar".
2. Runtime e Settings precisam compartilhar a numeração de candidatos e o resultado de deduplicação por caminho canônico de `discoverWorkspaceHookConfigPaths`. Um path explícito não pode contornar essa função e acrescentar algo por conta própria; candidatos que falham ao carregar continuam ocupando a ordem de discovery, evitando que os digests das declarações seguintes fiquem deslocados.
3. O dismiss do banner de pending é estado local do renderer e não persistente, mas o clique precisa disparar imediatamente um rerender do componente;
   a key continua sendo `sessionId + bundleDigest`, de modo que a dica reaparece naturalmente após uma mudança de bundle.
4. A única entrada de produção do controller é `requestReview`. Requisições repetidas do mesmo flow pendente precisam reutilizar o flow e o
   supervisor; mutações concorrentes são serializadas pela fila do controller. Depois que o Trust store já foi gravado, mesmo que o deadline impeça o flow antigo de resolver de novo, o fechamento precisa relatar sucesso de autorização, e o Settled resolvido só é enviado uma vez.
5. O parâmetro de revoke do Trust store mantém três estados estritos: `undefined` significa revogar todos os registros daquele workspace; array não vazio significa revogar digests exatos; array vazio é erro de chamada e precisa ser rejeitado antes de qualquer IO. O rename atômico faz retentativa assíncrona limitada para uso temporário com `EPERM` / `EBUSY` / `EACCES` no Windows, e retorna imediatamente para os demais erros.
6. O review de Workspace Hook não se integra mais ao broker de interactions genérico nem à cadeia de falha de dual-ACK de parked-turn.
   O protocolo compartilhado mantém apenas os schema/tipos ainda realmente consumidos pelo command envelope, pelo flow do core e pelo realtime de tasks.
7. O estado estático de Trust das Settings decide apenas a exibição e não pode servir de autoridade de mutação. Com session binding,
   o Trust em linha precisa aguardar uma requisição immutable com a mesma workspace identity, o mesmo bundle digest e que contenha o reviewItemId alvo; sem session binding, é preciso redescobrir o snapshot canônico via workspace Agent RPC e casar a mesma workspace identity, bundle digest e declaration digest. Timeout, desconexão ou mudança de bundle nas duas caminhos falham de forma fechada.
8. O "há itens pendentes" de `requestReview` não pode ser filtrado por `configuredEnabled`. O interruptor de configuração é ortogonal ao Trust: uma
   declaration disabled permite pré-confiança, mas ainda assim não roda; a exibição travada do interruptor não confiável não pode reescrever o arquivo de configuração.
9. O `reasonCode` do protocolo de pretrust do workspace é uma enumeração explícita e não pode carregar um `Error.message` de baixo nível. Reason codes de domínio públicos e conhecidos são repassados com precisão; exceções que contenham caminho absoluto, nome de usuário, conteúdo de configuração ou qualquer texto desconhecido são mapeadas uniformemente para
   `workspace_hooks_config_unreadable`. Exceções de baixo nível não podem retornar pela fronteira de protocolo Agent/Host/UI.
10. O Host do protocolo precisa criar ou receber um único `WorkspaceHookPolicyProvider` confiável e injetar a mesma instância no
    Runtime da session e no pretrust das Settings sem session. O pretrust precisa ler a policy antes da discovery e de qualquer IO/mutação do Trust store: só `user_decides` pode escrever; `deny` e `allow_trusted_only` retornam, respectivamente,
    `workspace_hooks_blocked_by_policy` e `workspace_hooks_policy_requires_pretrust`. Uma CLI local de administrador que mantiver a capacidade de pré-revisão precisa continuar usando uma entrada explícita diferente da RPC das Settings, sem reutilizar a autoridade comum da UI.