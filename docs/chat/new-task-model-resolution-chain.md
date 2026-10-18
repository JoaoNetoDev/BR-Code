# Cadeia de Resolução do Modelo Atual ao Criar uma Nova Task

Data de atualização: 2026-07-16

No V4, "criar task" começa se manifestando como um painel de rascunho sem sessão vinculada. Os fatos sobre o modelo vêm da intenção de rascunho do renderer e das sementes de configuração `last-selected`; só após o primeiro envio é que a projeção de sessão da CLI se torna autoritativa. O antigo `createTaskWithSessionControl` e a cadeia de primeiro envio legada `runtimeModel` já não são o caminho principal da UI.

## Origem da Configuração do Rascunho

A configuração do rascunho é mantida por `useDraftConfigControl`:

1. O mode é lido da preferência de draft mode do renderer, sem usar o catálogo do workspace como fato persistente.
2. Modelo e thought são lidos preferencialmente da tupla global de configuração `last-selected` sob a identidade daquele workspace.
3. `configOptions` do workspace fornece o catálogo opcional e valida a seleção; quando o catálogo ainda não foi carregado, `prepareWorkspaceWithZCodeSessionService` é responsável pela hidratação.
4. A escolha explícita do usuário nesta interação é gravada na intenção reativa do rascunho, com prioridade sobre as sementes iniciais e a resposta assíncrona do catálogo.
5. `followupMode` vem das configurações do app e é repassado com a create config.

O model e o thought de `last-selected` formam uma tupla inseparável:

- O thought precisa ser filtrado pelas capacidades daquele modelo; não se pode aplicar um thought global independente a outro modelo;
- Em uma intenção entre modelos, o thought é limpo primeiro, e o runtime de destino decide o padrão/compatibilidade efetivo;
- Enquanto o último modelo de um custom provider externo continuar disponível, a memória de conexão da família Z.ai/BigModel não pode sobrescrevê-lo;
- Quando o último modelo pertence à família atual, Coding/Team Plan restringe apenas os providers e modelos disponíveis dentro daquela família;
- Quando o provider do Plan atual está temporariamente indisponível, não há retorno à conexão antiga da mesma família.

Todo isolamento em nível de workspace usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`; a execução de arquivos e comandos continua usando `workspacePath`.

## Escolha Explícita e Confirmação de Preferência

A troca no rascunho atualiza primeiro a intenção; quando há sessão de prewarm, envia-se um CAS do V4 para o `targetSessionId` explícito. A gravação da preferência obedece a:

```text
draft intent: { model: B, thought: null }
  -> switchModelConfig(target prewarm session)
  -> accepted/noop: last-selected = { B, null }
  -> state.updated: last-selected = { B, actualThought }

synthetic empty thought ----------------X
failed/stale/superseded ----------------X
历史 session snapshot -----------------X
```

A intenção pendente fica vinculada à sessão que a iniciou; um ACK tardio ou uma projeção não pode sobrescrever uma escolha mais recente do usuário. Quando o usuário escolhe explicitamente um thought não vazio, `accepted/noop` confirma a tupla completa `{ model, thoughtLevel }`. Fallback automático, abertura de sessão histórica, reinício do app e migração de selected-key em segundo plano não constituem escolha do usuário.

A troca da conexão de família em Model Settings também não equivale a escolher o modelo na barra de ferramentas do chat: quando o rascunho atual usa um modelo fora da família e ainda disponível, a sessão de rascunho original é mantida; somente quando o rascunho pertence à família que mudou, ou quando o modelo atual já não pode ser resolvido, é que a sessão deferida não usada é fechada e recriada conforme a conexão de destino. Os modelos concretos que continuam disponíveis dentro do Plan de destino são preservados.

## Caminho de Prewarm

Após o painel de rascunho, é criada em segundo plano uma draft session apenas em memória, deferida:

```text
draft pane mount
  -> createSession { workspaceId, config: initialDraftConfig }
  -> CLI cria deferred session (sem gravar no SQLite, sem entrar no sessions-index)
  -> conversation snapshot chega
  -> se a draft intent tiver sido atualizada, alinhar o config com CAS
  -> primeiro sendText
  -> promote, o pane vincula o sessionId no lugar
```

Se a sessão de prewarm não for usada e houver troca, `deleteSession` é chamado para limpar. Enquanto a criação ainda está em voo, após a chegada do ACK só é possível limpar condicionalmente a sessão `deferred`; depois que o primeiro envio já foi promovido para `immediate`, ela não pode ser removida por uma limpeza tardia. Antes de enviar o resultado do prepare, é preciso reconferir o vínculo pane/sessão, evitando que uma resposta antiga de workspace sobrescreva uma task já criada.

## Caminho do Primeiro Envio

O primeiro envio é executado pela seguinte prioridade:

1. Com sessão de prewarm: aguardar a barreira de configuração e então executar `sendText` sobre a sessão de prewarm; após o `accepted`, promover e vincular.
2. Sem prewarm e sem anexos: executar `createSession { workspaceId, config, firstInput: { text } }`; a configuração precisa ser aplicada antes do `firstInput`.
3. Sem prewarm e com anexos prontos: criar primeiro uma sessão vazia e então enviar a referência dos anexos via `sendText`; o upload não é iniciado no clique de envio.
4. Slash commands de rascunho que exigem sessão, como `/goal`: reutilizar a sessão de prewarm, ou criar uma sessão vazia, e então despachar o comando.

`buildDraftCreateConfigPayload` combina a intenção atual, as configurações de follow-up do app e a configuração inicial legível de forma síncrona. Valores de rascunho escritos explicitamente pelo usuário têm prioridade, evitando a reversão para o modelo builtin quando a hidratação do catálogo chega mais tarde que o primeiro envio imediato. O primeiro envio passa pela mesma barreira de configuração e não pode ultrapassar os comandos mais recentes de model/mode/thought.

## Semântica de Criação na CLI

Após criar a deferred session, `commands/handlers/session-mgmt.ts` chama `applyRequestedSessionConfig` antes da primeira entrada:

- A config solicitada sobrescreve os padrões do runtime;
- Entre modelos, instala/resolve o client do provider e adota o thought efetivamente suportado pelo modelo de destino;
- O mode só aceita `build | edit | plan | yolo`;
- Follow-up mode não padrão é gravado no runtime;
- Eventos como `ModelSelected` / `SessionModeChanged` permitem a recuperação a frio da projeção.

Quando a aplicação da configuração falha, o ACK de create ainda pode ter sucesso, a sessão mantém os padrões do runtime e um warn é registrado. Por isso as barreiras de prewarm e de primeiro envio da UI continuam precisam checar o ACK de configuração e a projeção final, sem confiar apenas no seletor local.

Se a tupla de `last-selected` não puder mais ser resolvida no registry atual, o renderer não escreve um fallback adicional baseado no primeiro item do menu. O `createSession` usa os padrões disponíveis do runtime; quando o registry muda depois da criação da sessão, o Agent executa o mesmo conjunto de fallback no limite seguro de idle/next-turn, calibrando a projeção do rascunho com um `ModelSelected` do thought efetivo do modelo de destino.

## Limites Multicliente

Desktop e celular se anexam aos mesmos fatos de shared-host/sessão da CLI. A diferença está apenas na entrega por tópico: desktop é continuous, e o controle remoto do celular é replayable recovery. relay/main não cria outra draft runtime nem salva modelo de rascunho ou fila de sessão. A cadeia remota precisa atravessar `workspaceIdentity` e `remoteSessionId`.

## Entradas de Código Atuais

- `packages/ui/src/v4/composer/useDraftConfigControl.ts`
- `packages/ui/src/v4/composer/useDraftSessionPrewarm.ts`
- `packages/ui/src/v4/composer/draftGlobalModelSeed.ts`
- `packages/ui/src/v4/composer/modelConfigPreferenceConfirmation.ts`
- `packages/ui/src/hooks/workspacePrepareModelPreference.ts`
- `packages/ui/src/v4/SessionPane.tsx`
- `packages/ui/src/lib/zcodeModelPreference.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-mgmt.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts`