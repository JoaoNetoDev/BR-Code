# Cadeia de decisão atual da troca manual de modelo

Data de atualização: 2026-08-24

> **Auditoria histórica de cadeia, substituída pelo Provider Refactor.** O workspace catalog, a
> sincronização do App Registry e a restauração de `runtimeModel` descritos aqui não são mais a
> implementação atual. Os candidatos atuais são fornecidos pela Model Selection View do Environment
> alvo e, após a troca, o Active Model é criado pelo Registry/ModelFactory do mesmo Environment. O
> desenho atual está em `docs/working-memory/provider-refactor/design/`.

Este documento descreve a implementação atual na cadeia principal de conversa do V4. O antigo
`ChatInputToolbar`, `useToolbarModelChange`, `session/setModel` e a cadeia de task stream foram
removidos e não servem mais como base de implementação.

## Limites de autoridade

- O valor exibido na barra da sessão já vinculada vem de `ConversationSnapshot.config`, e o catálogo
  de modelos vem do `configOptions` do workspace. As regras de texto do modelo para a barra da
  desktop, o toast de troca de modelo e o marker na área de chat são: fornecedores embutidos
  Z.ai / BigModel exibem apenas o nome do modelo, evitando repetir o nome da conexão embutida do
  produto; outros fornecedores (incluindo os personalizados) exibem `provider.name/modelId` no
  composer largo, preservando a identidade do fornecedor. O gatilho da barra é sempre recortado
  pela largura do contêiner do composer: em largura muito estreita mostra apenas o ícone, em
  largura média apenas `modelId`, em tela larga mostra a identidade completa; o menu de modelos
  continua agrupado por fornecedor, e o toast, o marker e a comparação de identidade de modelo não
  são afetados por esse recorte de exibição.
- A escolha do usuário é gravada na sessão do CLI pelo V4 `switchModelConfig`; o renderer não
  modifica diretamente os fatos da conversa.
- A próxima requisição real usa a configuração atual do runtime do CLI; o snapshot apenas projeta o
  resultado autoritativo de volta para a UI.
- A tupla last-selected `{ model, thoughtLevel }` do renderer existe apenas para semear rascunhos
  posteriores e não sobrescreve uma sessão existente.
- `setDefault*` do workspace é mantido apenas por compatibilidade e não é a segunda autoridade de
  escolha para rascunhos V4 nem para sessão já vinculada.

## Contexto de execução atômica do Turn

Um Turn já iniciado fixa simultaneamente o modelo de execução e o prefixo de contexto estável.
Atualizar o model, language ou outputStyle da sessão durante a execução só muda a configuração do
próximo Turn; o Turn atual continua usando a combinação model/context do início. O assistant, os
tool results, o steering e os runtime reminders gerados dentro do Turn ainda podem ser anexados ao
final das mensagens dinâmicas pelo fluxo existente e não fazem parte do prefixo de contexto
estável.

```text
Entrada do Turn N
  └─ captura model + stable context configuration A
       ├─ requisição atual / tool follow-up / Compact retry -> A + context A
       └─ atualização de config durante a execução -> future config B, sem reescrever context A

Entrada do Turn N+1
  └─ detecta context configuration A != B
       └─ reconstrói context B e só então faz a primeira requisição com model B
```

Aqui não mantemos pending flags separados para model, language e outputStyle; o runtime guarda
apenas um snapshot de configuração correspondente ao context materializado atual, usado para decidir
se o próximo Turn precisa reconstruir. Manual Compact e o Turn comum usam o mesmo limite de
ciclo de vida.

## Troca dentro da sessão

```text
V4ComposerToolbar
  -> SessionPane.handleSelectModel
  -> configCommandBarrier (serializado com sendText na ordem das ações do usuário)
  -> switchModelConfig { provider, model, thought, baseRevision }
  -> CLI commands/handlers/model-config.ts
  -> região crítica serial do model-config da sessão
  -> app.setModel / app.setThoughtLevel
  -> ModelSelected { modelRef, supportedThoughtLevels, contextWindow, origin? }
  -> ConversationSnapshot.config + usage.contextWindow.maxTokens
  -> fechamento da barra e da semente de preferência
```

Regras principais:

1. `provider` e `model` devem ter valor; valores vazios não são enviados.
2. Trocas entre modelos não herdam o thought do modelo de origem. O CLI deixa o modelo alvo
   escolher uma faixa compatível e publica em seguida o valor real final.
3. Só quando provider/model não mudam, `thought` representa troca explícita da profundidade de
   reflexão; quadros antigos da barra não podem escrever o thought do modelo antigo no novo modelo.
4. Troca para o mesmo valor retorna `noop / config.unchanged`, não uma falsa mudança aceita.
5. Comandos de configuração carregam a revision do snapshot; quando estão stale, `SessionPane`
   faz um número limitado de tentativas conforme `revisionAtDecision`, sem replay infinito.
6. Model e thought usam um scheduler latest-wins e compartilham a barreira de envio com os
   comandos de mode; em "trocar modelo → enviar", `sendText` não ultrapassa uma configuração ainda
   não fechada.
7. O aviso de desempenho só aparece quando há troca explícita da identidade `provider + model` em
   sessão já vinculada; no estado de rascunho não se mostra toast de troca de modelo. Uma sessão já
   vinculada não avisa apenas quando a tupla provider/model é idêntica; a comparação de identidade
   do toast sempre usa a tupla completa provider/model, e na exibição os fornecedores embutidos
   Z.ai / BigModel mostram apenas modelId, enquanto outros fornecedores mostram
   `provider.name/modelId`. O fallback automático do Agent usa o mesmo texto changed + warning,
   mas só é exibido quando o pane em foco atual observa pela primeira vez, em um quadro `online`
   ao vivo, a transição autoritativa A→B com origem de fallback; prewarm de rascunho,
   initial/recovery, snapshots históricos, deltas repetidos e panes em segundo plano não avisam.
   O marker de mudança de modelo continua sendo gerado apenas pela CLI na projeção autoritativa de
   turns subsequentes de uma sessão existente; a UI não insere linhas na timeline por conta própria.
   O marker já carrega os IDs provider/model de origem e destino; o renderer usa as mesmas regras de
   exibição, com fallback para `providerId/modelId` quando a configuração de outros fornecedores
   está ausente; o marker deve assinar o snapshot de providers, para atualizar o nome no lugar
   quando o catálogo hidratar mais tarde ou um fornecedor for renomeado.
8. create/resume/fork, compatibilidade legada, registry fallback e provider runtime refresh também
   devem passar pela mesma região crítica da sessão; `runtimeModel` é apenas um cache derivado de
   provider/header e não pode sobrescrever a troca do usuário quando model ou thought divergem do
   runtime atual.
9. O Service só reconstrói o cache de runtimeModel conforme o alvo após um `accepted/noop` desta
   chamada; `duplicate` não significa que o comando antigo ainda é a configuração atual, portanto não
   grava cache. Reconstruções de cache de ACKs concorrentes são confirmadas na ordem de decisão do
   Agent, e requisições anteriores, mesmo que terminem por último, são descartadas.
10. `contextWindow` faz parte das capacidades do modelo de runtime já aplicado e precisa ser
    publicado atomicamente junto de `modelRef`, do thought real e de `supportedThoughtLevels` pela
    mesma `ModelSelected`. Após trocar de modelo em uma sessão histórica, a projeção mantém o
    `usedTokens` existente e muda imediatamente `usage.contextWindow.maxTokens` para o modelo alvo;
    não se deve esperar o próximo `ModelComplete`, nem deixar o renderer derivar um novo denominador
    a partir do workspace catalog.
11. Comandos de modelo de uma sessão em execução não podem substituir todo o adapter registry para
    preparar o provider client. Quando o modelo alvo já está no overlay atual da sessão, apenas a
    seleção de modelo do próximo turn é atualizada; o overlay mais recente do workspace é aplicado na
    fronteira ready. Quando o alvo existe apenas em um novo catálogo ainda não aplicado, o comando
    retorna explicitamente `provider.notInRegistry` e não deve forçar sucesso ao custo de descartar
    um signer em trânsito; basta tentar de novo depois que o turn atual terminar. Headers de runtime
    no nível da requisição não seguem esta semântica de comando de configuração.

## Confirmação em duas fases da preferência do usuário

O ACK normalmente chega antes de `state.updated`. Para evitar que um novo rascunho herde o modelo ou
o thought de origem entre os dois, a seleção explícita de modelo é confirmada em duas fases sobre a
mesma tupla last-selected:

```text
Usuário seleciona o modelo B
  -> pending intent (vinculado ao targetSessionId)
  -> ACK accepted/noop
       -> salva { model: B, thoughtLevel: null }
  -> projeção autoritativa de B
       -> salva { model: B, thoughtLevel: actualThought }

Projeção de sessão histórica ---------------X sem intent explícito, não grava preferência
ACK/projeção atrasada do modelo A ---------X não pode sobrescrever o intent mais novo de B/C
thought vazio vindo de um Select controlado -X mudança sintética, não entra no scheduler
```

- O pending intent precisa estar vinculado à sessão que originou a operação e não pode ser
  confirmado por outra sessão histórica que por acaso tenha o mesmo modelo.
- Quando a projeção chega antes do ACK, a escrita autoritativa é concluída primeiro e o pending é
  limpo; um ACK atrasado não pode rebaixar o thought real para `null`.
- Quando o usuário seleciona explicitamente um thought não vazio, o accepted/noop confirma
  diretamente a tupla completa do modelo alvo e do thought.
- `failed`, `stale` e `superseded` não atualizam a preferência do usuário. O fallback automático não
  escreve a preferência do renderer diretamente a partir do Agent; o pane em foco atual apenas eleva
  a tupla real do modelo por compare-and-set, dentro do callback que aplica o mesmo evento de
  fallback `online` ao vivo no projection store e quando não há intent de modelo explícito em
  trânsito. Diferenças comuns de snapshot, projeções initial/recovery/históricas e o snapshot online
  completo que estabelece a primeira base aplicada da assinatura não podem gravar preferência.

## Recuperação automática do registry de providers

Quando o provider alvo não está no registry do workspace do CLI, o primeiro comando retorna
`provider.notInRegistry`. `SessionPane.switchModelConfigWithRecovery` recupera apenas uma vez:

```text
failed(provider.notInRegistry)
  -> sincroniza o provider registry conforme workspaceIdentity / remoteSessionId
  -> zcodeSessionService.resolveRuntimeModelForV4(...)
  -> tenta novamente uma vez com runtimeModel e a revision mais recente
  -> sucesso fecha o caso; se ainda falhar, para sem loop
```

O workspace remoto precisa atravessar `workspaceIdentity` e `remoteSessionId`. Essa recuperação apenas
completa o overlay de provider client e não altera a fronteira de entrega entre desktop continuous e
mobile replayable.

## Troca no estado de rascunho

No estado de rascunho, escreve-se primeiro de forma síncrona o draft intent reativo; entre modelos
diferentes, o thought é limpo imediatamente. Como o rascunho ainda não formou uma conversa real,
nenhuma seleção comum, recuperação de custom provider ou fallback de prewarm do Agent exibe toast
de troca de modelo. Em seguida, o fluxo se divide conforme o estado de prewarm:

- quando `configOptions` falha, um custom provider real passa por recuperação restart/force-prepare,
  mas isso atualiza apenas a seleção do rascunho e o estado de preparação do runtime, sem aviso de
  desempenho;
- já existe uma sessão de prewarm: executa-se o CAS do V4 para esse `targetSessionId` explícito;
- ainda não existe sessão de prewarm: o intent fica reservado para o `createSession.config` posterior;
- quando chega a projeção de prewarm: só preenche os campos ainda inconsistentes e não pode cobrir o
  novo intent com um snapshot antigo;
- antes do primeiro envio: `ensureDraftPrewarmConfigBeforeSend` aguarda a barreira de configuração mais
  recente.

```text
Antigo: compara modelId                 Novo: compara providerId + modelId
    A/glm-5.2 → B/glm-5.2                   A/glm-5.2 → B/glm-5.2
              └─ não avisa                            └─ no estado de rascunho ainda não avisa

catalog / draft intent / projection
              -> Toolbar effectiveConfig (identidade visível quando o usuário clica)
              -> onSelectModel(sourceModel, targetModel)
                   └─ o CAS continua usando a revision de snapshot mais recente do SessionPane
```

A ModelSelectionView do Host alvo fornece apenas a projeção de exibição de provider/model/reasoning
selecionáveis. A tupla last-selected só é atualizada depois que uma ação explícita recebe
confirmação por ACK/projeção; abrir uma task histórica, a hidratação do catálogo e migrações de
conexão em segundo plano não podem reescrevê-la.

A cadeia de exibição do marker na área de chat compartilha o mesmo formato de identidade do toast,
sem mudar o momento de geração do marker:

```text
Turn N usa de fato provider-A/glm-5.2
  -> ModelSelected(provider-B/glm-5.2)
  -> Turn N+1 started
  -> CLI marker { fromProvider: A, fromModel: glm-5.2,
                  toProvider: B,   toModel: glm-5.2 }
  -> renderer assina o snapshot de providers
  -> Z.ai/BigModel embutido: "Modelo trocado glm-5.2 → ..."
     outros fornecedores: "Modelo trocado Bnome/glm-5.2 → ..."
```

Causa do bug: o protocolo e a projeção da CLI já preservavam a tupla completa provider/model, mas o
renderer da área de chat consumia apenas `fromModel/toModel`, o que impossibilitava distinguir modelos
com o mesmo nome de fornecedores personalizados. O renderer continua assinando o snapshot de
providers existente e preserva o nome do fornecedor para os demais; fornecedores embutidos Z.ai /
BigModel omitem ativamente o nome de entrada fixo conforme a regra de texto do produto. Quando o
catálogo falta inicialmente, outros fornecedores caem para o provider ID e são redesenhados no lugar
depois da hidratação do catálogo ou de uma renomeação. A identidade completa de origem e destino de
um marker comum A→B e o momento da projeção permanecem inalterados, e a semântica de entrega do
desktop continuous ou do mobile replayable também não muda; a próxima seção apenas adiciona o ramo de
origem ausente em comum para a fronteira explícita de modelo `∅→X`.

### Primeiro modelo real do Subagent

A primeira seleção de uma sessão Main comum ainda apenas estabelece a linha de base do modelo e não
gera marker. Um child Subagent novo é a única exceção: o runtime do child, após resolver finalmente o
override de profile herdado, `lite` ou explícito, grava o `childModelRef` real tanto no evento ao
vivo quanto na timeline persistente.

```text
resolveEffectiveSubagentModelRef -> childModelRef X
  |-- ModelSelected(previousModelRef=null, modelRef=X) -> live projection
  `-- model_change(fromModel=undefined, toModel=X) -> transcript

first TurnStarted
  -> modelChange { fromProvider/fromModel absent, toProvider/toModel=X }
  -> renderer: no switch icon + "Using X" / "正在使用 X"

cold hydration
  -> source-less model_change synthesizes previousModelRef=null
  -> first TurnStarted rebuilds the same marker exactly once
```

- A ausência de `previousModelRef` apenas atualiza a config atual e não muda a linha de base de
  modelo do turn; um `null` explícito representa a fronteira `∅→X`. A projeção pública consome
  apenas a fronteira e não reconhece a identidade de Subagent; um child novo é hoje o único produtor
  ao vivo dessa fronteira.
- A linha de base de modelo do turn tem três estados: silêncio normal no primeiro turno da Main,
  source-less explícito e modelo conhecido do turno anterior. Seleções múltiplas não sobrescrevem o
  modelo real do turno anterior: `A→B→C` exibe `A→C` no turno seguinte, e `∅→X→Y` exibe
  `Using Y` no primeiro turno.
- O `modelChange` do V4 mantém a tupla de destino existente. Seu provider e model de origem estão
  presentes em conjunto nas trocas A→B ou ausentes em conjunto no uso inicial de um Subagent; tuplas
  de origem com apenas um dos dois presentes são inválidas.
- Markers source-less usam o mesmo formatador de exibição provider/model do lado de destino das
  trocas normais. Z.ai / BigModel omitem o nome fixo do provider; outros providers retêm
  `provider.name/modelId` e caem para o provider ID até a hidratação do catálogo. Eles omitem o ícone
  de troca e o "model" redundante no final; markers normais A→B mantêm o ícone de troca e a redação
  atuais.
- Apenas sessões child novas persistem esse fato inicial na timeline. `resumeFromStore` não o grava
  novamente, e históricos criados antes deste contrato não são inferidos nem preenchidos
  retroativamente.
- O marker continua pertencendo ao child e não é espelhado no card do Agent pai nem na timeline da
  conversa pai. Ele não atualiza preferências last-selected e não gera toast de mudança de modelo.

## Fallback do Agent para modelos indisponíveis

O catálogo visível na UI é afetado por hidratação de entitlement, filtros e ordenação do menu e não
pode ser usado para reescrever a sessão. Depois que o registry de providers mais recente do workspace
passa a valer, o Agent é o único decisor do fallback automático:

```text
registry remove o modelo atual
  -> active turn: mantém a requisição em trânsito e espera um ponto seguro
  -> idle / next-turn admission
  -> escolhe um modelo disponível por default → last-used → primeiro do catálogo
  -> app.setModel (resolve o thought real do alvo)
  -> ModelSelected { modelRef, supportedThoughtLevels, contextWindow,
                     origin: "registryFallback" }
  -> ConversationSnapshot.config + usage.contextWindow.maxTokens
  -> exibição somente leitura na barra
  -> o pane em foco atual observa o evento ao vivo pela primeira vez em um quadro online
  -> reutiliza o toast changed + warning da troca manual
```

Quando corre em paralelo com uma troca explícita, a linearização segue a ordem de entrada na região
crítica do Agent; independentemente de quem entra primeiro, quem executa depois relê o runtime atual:

```text
fallback C entra primeiro -> usuário B entra depois -> final B
usuário B entra primeiro     -> fallback relê e vê B disponível -> no-op, final B
runtime antigo A atrasado    -> não corresponde ao B/thought atual -> descartado, sem evento
```

O renderer não despacha mais um `switchModelConfig` "automatic" a partir do primeiro item do menu,
de modo que o carregamento/reordenação do catálogo não pode sobrescrever uma seleção explícita em
andamento do usuário. Quando não há nenhum modelo disponível, o Agent mantém o valor atual e deixa o
admission seguinte expor o erro de indisponibilidade; aqui "disponível" significa apenas resolvível
pelo registry/catalogo e não inclui uma sondagem de rede real do provider. O fallback automático não
grava a preferência last-selected do usuário diretamente a partir do Agent; o pane em foco atual pode
elevar a configuração real por compare-and-set ao consumir a mesma transição autoritativa ao vivo e
não haver intent de modelo explícito em trânsito.

O aviso automático não adivinha a origem a partir de qualquer diferença A→B em `config`. A CLI só
marca `origin` no `ModelSelected` de registry fallback; a projeção V4 preserva o ID estável do
evento e o provider/model de origem e destino; o store do renderer deduplica por ID de evento e
notifica o pane em foco atual após aplicar com sucesso o quadro `online` ao vivo. `initial`,
`recovery`, snapshots históricos e quadros duplicate/gap apenas atualizam a linha de base observada
e não disparam toast; se o initial se perde, o snapshot `online` completo que chega depois serve
apenas para estabelecer a primeira base aplicada da assinatura e só semeia a linha de base de
observação. Só uma nova transição `online` após a base established dispara simultaneamente o toast do
pane atual e o CAS de preferência, de modo que reabrir uma task histórica, reconectar o celular ou
recuperar o relay não reproduz avisos antigos nem reescreve a escolha. Desktop e celular continuam
consumindo o mesmo fato de modelo do Agent e cada um decide localmente se exibe, apenas na sua
cadeia de entrega existente.

Uma transição `online` é um evento único e não reproduzível. `SessionPane` precisa instalar o
transition listener de forma síncrona no mesmo effect em que obtém o lease da sessão, antes de
permitir que a ativação da assinatura libere quadros initial/online; não se pode fazer `setLease`
primeiro e esperar o próximo effect para registrar. A reentrada do store keep-warm também respeita
essa ordem. Não é permitido compensar a janela do listener lendo ou reproduzindo
`snapshot.modelTransition`, caso contrário transições initial/recovery/históricas seriam confundidas
com eventos ao vivo.

## Capacidades de produto ainda não implementadas

O V4 atualmente não tem uma proteção de "quando a context window do modelo alvo é menor que o
contexto já usado, parar/comprimir antes de trocar". O código atual permite trocar de modelo em uma
sessão em execução. A semântica a implementar está em
`docs/superpowers/specs/2026-06-10-model-switch-context-window-guard-design.md`; no catálogo, N05 e
N09–N14 continuam devendo ser marcados como planned; o antigo plano de implementação legado não pode
ser considerado cobertura vigente.

## Pontos de entrada atuais do código

- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`
- `packages/ui/src/v4/SessionPane.tsx`
- `packages/ui/src/v4/configCommandBarrier.ts`
- `packages/ui/src/v4/composer/modelConfigPreferenceConfirmation.ts`
- `packages/ui/src/v4/composer/useDraftConfigControl.ts`
- `packages/ui/src/lib/zcodeModelPreference.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/model-config.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`
- `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts`
- `packages/shared/src/zcode-protocol-v4/rows.ts`
- `packages/shared/src/zcode-protocol-v4/command.ts`