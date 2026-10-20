# Todo 71: Consolidação do Composer Draft persistente e do estado de Submission

> Verificação de atribuição atualizada (2026-09-09): a dívida residual de subteste/falha/promoção manual deste documento é transferida para [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente aqui; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Status: implementação e aceitação por fases concluídas (2026-09-04).
>
> Origem: em uma Session existente, após trocar o mode, o Composer era sobrescrito por um valor antigo do Agent Session Snapshot, aparecendo como um menu que não conseguia alternar
>
> Dependências: consolidação do fato de execução do Active Model do Todo 68; limite de migração de Session Selection histórica do Todo 70
>
> Decisão mais recente: quando a seleção existente estiver ausente/inválida, deixá-la vazia; não mudar automaticamente para o modelo padrão e não exibir aviso de invalidez. Mesma regra do Todo 70.

## 1. Problema

O Composer representa "o que a próxima submissão prepara para enviar". A implementação atual, porém, espalha esse estado em vários lugares:

- texto e estado Lexical entram em `V4ComposerDraft`;
- `mode` e `modelSelection` ficam apenas no `draftConfig` do React;
- o Workspace Store ainda guarda `draftPreferredModel`, `draftPreferredMode`, `draftPreferredThoughtLevel`;
- o mode tem ainda uma preferência global separada em localStorage;
- a Toolbar de uma Session existente continua lendo o Agent Session Snapshot;
- na submissão, tudo é mesclado temporariamente com Snapshot, Draft e cada tipo de estado Preferred.

Assim, o Renderer não tem uma fonte de verdade completa e estável para o Composer. Um sequenciamento típico de erro é:

```text
已有 Session Snapshot.mode = yolo
            |
            v
Composer 显示 yolo
            |
用户选择 build
            |
            v
React draftConfig.mode = build
            |
            v
组件重新渲染
            |
            `-- 又从 Snapshot.mode 读取 yolo
                    |
                    v
              菜单看起来切换失败
```

Não é um problema do componente de menu em si, mas de propriedade de estado do Composer: o estado anterior ao envio era continuamente retroalimentado pelo estado de uma Agent Session que já havia executado.

## 2. Estado-alvo

O Composer Draft existente é estendido para ser o único portador persistente do Composer. O estado em memória do Renderer cuida da interação imediata; o Draft persistente cuida de reinício, troca de página e recuperação de Session; o Agent Session Snapshot deixa de ser entrada em tempo real para o Composer enquanto ele vive.

```text
                    打开 / 恢复 Composer
                            |
                            v
              Persisted Composer Draft
                ├─ text / editor state
                ├─ mode
                └─ modelSelection
                            |
                            v
                 Composer In-memory State
                 （发送前唯一 UI 事实）
                    |               |
             用户修改               | submit
                    |               v
                    |        immutable Submission
                    |          ├─ prompt / attachments
                    |          ├─ mode
                    |          └─ modelSelection
                    |               |
                    `---- persist  v
                              Agent admission
                                   |
                                   v
                         Session execution state
                                   |
                                   v
                          immutable Active Model
```

Princípios centrais:

1. O Composer mantém apenas o estado completo da "próxima submissão";
2. uma vez criada, a Submission congela seu próprio estado e não relê o Composer nem a Session;
3. o estado da Agent Session pode registrar os fatos de execução das Submissions aceitas, mas deixa de ser projetado continuamente de volta ao Composer do Renderer;
4. o Active Model continua gerenciado pelo Todo 68 e não entra na persistência do Composer;
5. não adicionar `LastSubmittedState`, `SessionComposerState`, Context Model Snapshot ou novos DTO de Provider/Model.

### 2.1 Relação com o cache de modelos

O Composer Draft persistente não decide diretamente se o Prompt Cache do servidor será atingido; o cache ainda depende do Provider, Model, Options e Prefix da requisição real. Seu papel é guardar o mode/ModelSelection que o usuário vem usando continuamente, evitando que trocas de página, reinícios ou re-renderizações de Snapshot saltem para outro modelo ou modo e mudem sem querer o prefixo das requisições seguintes, quebrando a continuidade do cache. Portanto, ele é uma pré-condição de estado de produto para a estabilidade do cache, mas não uma nova camada de configuração de cache.

## 3. Contrato do Composer Draft

Reutilizar o `V4ComposerDraft` existente, incorporando ao mesmo registro as escolhas de execução hoje dispersas:

```ts
interface V4ComposerDraft {
  text: string;
  editorStateJson?: string;
  mention?: ComposerMentionPrefill;
  mode?: CollaborationMode;
  modelSelection?: ModelSelection;
  updatedAt: number;
}
```

Os campos opcionais aqui servem apenas à compatibilidade de persistência e ao processo de inicialização. Depois que o Composer termina a inicialização, o estado em memória deve conter um `mode` completo e submissível; se `modelSelection` fica vazio é determinado pela `ModelSelectionView` atual e pelas regras de inicialização/invalidação; depois que uma seleção existente se torna inválida, não há fallback.

A localStorage key e o cabeçalho de arquivo do `V4ComposerDraft` atual são ambos `v1`. Os campos `mode/modelSelection` adicionados neste ciclo são folhas opcionais e retrocompatíveis, e continuam em v1 sem criar uma migração extra de key; mas o Reader deve validar campo a campo o Draft e as novas folhas, e não pode continuar afirmando o resultado de `JSON.parse()` como o tipo atual, especialmente `scopes`. Drets antigos que têm apenas text/editor são lidos normalmente e passam apenas pela inicialização de campos ausentes descrita na seção 4.

### 3.1 O que não é gravado no Draft

- `maxOutputTokens` não pertence ao ModelSelection nem ao Composer Draft. O framework de Agent deve passar explicitamente a cada requisição de modelo conforme a necessidade da tarefa; escolher `optionSpecs.maxOutputTokens.max` em si já pode ser uma decisão explícita legítima.
- Endpoint, API Schema, credenciais, Properties e Option Specs não entram no Draft; em tempo de execução são resolvidos pelo Host Registry de destino.
- Active Model não é persistido.
- Não se persiste mais os apelidos achatados de ModelSelection como `provider/model/thoughtLevel`.

### 3.2 Limite dos anexos

O estado lógico do Composer ainda inclui anexos, e a Submission deve congelar os anexos desta vez; mas hoje os anexos incluem `File`, `objectUrl` e posse de caminho local, que não podem ser restaurados com segurança entre reinícios. Este Todo não inventa um protocolo de serialização de anexos:

- enquanto o Composer vive, os anexos continuam mantidos pelo estado de anexos em memória atual;
- na submissão, eles entram na Submission junto com prompt, mode e ModelSelection;
- esta extensão de persistência cobre apenas os campos serializáveis com segurança já existentes e `mode/modelSelection`;
- a recuperação de anexos entre reinícios fica para um design separado; não se deve gravar object URL inválido nem caminho local não validado diretamente no Draft persistente.

> Atualização de 2026-10-14: a persistência de corpo vazio e as regras de inicialização são substituídas por [Composer persiste apenas o rascunho de texto](../../../ui/composer-text-draft-persistence.md). No design histórico abaixo, «gravar imediatamente no Draft» e «manter a configuração no texto vazio» deixam de ser o contrato de implementação atual.

## 4. Regras de inicialização

A inicialização acontece uma única vez, quando o Composer é criado, quando o escopo Workspace/Session muda ou na recuperação. Depois disso, um render React comum não volta a mesclar o Session Snapshot com os respectivos valores padrão.

### 4.1 Session existente

```text
当前 Session scope 的持久 Composer Draft
        |
        +-- 已有 Draft --> 恢复；失效选择按第 7 节留空
        |
        `-- 不存在 ------> 从 Session Selection + Session mode 初始化一次
                              |
                              v
                         立即写入 Draft
```

Session Selection e mode aqui servem apenas como seed para a primeira criação do Composer Draft de uma Session antiga. Depois da inicialização, mesmo que o Agent Snapshot seja atualizado, ele não pode sobrescrever o Composer que o usuário está editando.

Quando o Todo 70 retorna uma seleção não vinculada, o Draft também mantém modelo vazio ou Reasoning vazio, sem passar pela inicialização de modelo padrão e sem exibir aviso. Drets antigos que têm apenas text/editor podem executar uma única vez a inicialização de campos ausentes; mas um Draft já inicializado e deixado vazio por invalidez não é um Draft antigo e não pode ser preenchido novamente com Session/Recent/preferred após remount, troca de página ou reinício. Use o `mode` válido dentro do Draft para distinguir se a inicialização já foi concluída: a inicialização sempre salva o mode, inclusive no estado com modelo explicitamente vazio; um rascunho de texto antigo não tem mode. Não julgue a necessidade de inicialização apenas por `modelSelection === undefined`, e não crie uma nova biblioteca de estado de negócio nem outro flag de inicialização.

### 4.2 Nova Session / tarefa em branco

```text
Root Draft（scope = __draft__）
        |
        +-- 已有 Draft --> 恢复；失效选择按第 7 节留空
        |
        `-- 不存在
              |
              +--> 当前 View 中仍合法的 workspace App Recent
              |
              `--> Host preferredSelection

mode：已有 Root Draft 优先；全新 Root Draft 读取当前 workspace 的 Composer Recent.mode，缺失或非法才使用 build
```

O `preferredSelection` do Host já contém o resultado unificado do Default Configurado e do fallback do Registry; o Renderer não duplica esse algoritmo nem infere sozinho com base em Provider, nome do modelo ou tipo de Account.

Os Recent/preferred acima servem apenas para tarefas novas realmente criadas pela primeira vez e sem Draft persistente; não podem ser usados para corrigir uma seleção vazia de um Draft já existente. Quando o usuário escolhe ativamente um novo modelo, a inicialização do nível segue as regras normais de escolha de modelo; isso não equivale a preencher automaticamente um Reasoning salvo que ficou inválido.

### 4.2.1 ZCT-2098314627607224320: novas tarefas herdam a permissão da última submissão

Motivo da correção: migrar o Root Draft para a Session e apagar a origem é um isolamento de tarefas correto, mas o novo Root fixo em build perdeu a herança de permissões da próxima tarefa.
Estender o App Recent existente para Composer Recent, guardando modelo e modo lado a lado; não modificar o tipo compartilhado ModelSelection nem restaurar uma segunda preferência global de mode.
O Recent continua isolado por `workspaceIdentity?.trim() || workspacePath`; mesmo caminho com remotos diferentes não pode misturar valores. Desktop e celular têm cada um seu próprio Renderer Recent.

```text
用户选择 -> 当前 scope Draft（即时持久化）
用户提交 -> 冻结 modelSelection + mode -> CLI accepted -> 一次写入 Composer Recent
新任务 -> 已有 Root Draft 优先；没有时用 Recent 初始化一次 -> 当前 scope Draft
Snapshot / Recent 后续更新 -X-> 已初始化的 Draft
```

- A aceitação inclui o enfileiramento e não espera a conclusão da execução; mesmo que a execução falhe depois, a seleção aceita não é revertida.
- Não atualizam o Recent: envios não enviados, rejeitados/falhos, pré-aquecimento de sessão vazia, recuperação de histórico e ACKs duplicados.
- No mesmo Renderer/workspace, os candidatos são registrados pela ordem real de emissão dos comandos; apenas um comando aceito mais recente pode sobrescrever o Recent. Um ACK atrasado não lê o menu atual nem sobrescreve o novo rascunho do usuário.
- Reutiliza-se a key de Recent existente, com leitura compatível de registros antigos puramente ModelSelection; modelSelection e mode são validados de forma independente: um modelo ruim não perde um modo válido, e um modo ruim não perde um modelo válido.
- Falha ao gravar o Recent só registra um aviso no logger de UI e não reporta um envio aceito como falha. Rascunhos existentes e Sessions históricas não são reescritos em lote.
- Só altera a inicialização do App Composer e o salvamento de preferência após a aceitação. Os protocols confiáveis existentes de attachment, shared-host, owner e CommandInbox do Desktop continuous e do celular replayable permanecem inalterados.
- A regressão deve clicar de verdade em New Task; provar que toolbar, Draft persistente e permissões de execução de ferramentas seguintes são consistentes, preservando o isolamento de intenção não enviada entre Session/Root.

### 4.3 Restrições após a inicialização

- o resultado da inicialização entra imediatamente no mesmo estado em memória do Composer e é persistido, sem manter um estado intermediário de "apenas exibido na UI, ainda fora do Draft";
- mode e modelSelection seguem o mesmo princípio de leitura de estado;
- a prioridade não é recalculada a cada render, evento de Snapshot ou submissão;
- Prompt CLI, TUI, Automation, Repo Wiki, Subagent e Off-Peak continuam usando seus próprios Draft/Config/Record e não reutilizam o App Composer Draft.

## 5. Modificação do usuário e persistência

Quando o usuário modifica o mode ou o ModelSelection:

```text
点击菜单项
    |
    +--> 立即更新 Composer 内存态
    +--> 关闭下拉菜单
    `--> 持久化当前 scope 的完整 Draft
```

- A UI não espera o ack do Host/Agent para exibir o novo valor;
- mode e ModelSelection são operações discretas de baixa frequência e podem ser persistidos imediatamente após a modificação; o texto continua podendo usar a gravação com debounce já existente;
- texto vazio não significa Composer vazio. Enquanto o escopo estiver inicializado e tiver mode ou ModelSelection, a persistência comum precisa preservar o registro; apagar um escopo inteiro só pode passar por uma interface explícita de limpeza, e não se pode continuar usando "text e editorStateJson vazios" como condição de remoção;
- falha de persistência registra apenas um log diagnosticável uma vez e não faz a UI voltar ao Agent Snapshot;
- modificações consecutivas no mesmo escopo obedecem a latest intent wins; resultados assíncronos antigos não podem sobrescrever o novo estado em memória;
- a key continua `workspaceKey = workspaceIdentity?.trim() || workspacePath`, e o escopo usa o Session ID ou `__draft__`.

Este Todo não introduz bloqueio distribuído entre janelas nem um novo Host Repository. O portador localStorage atual pode continuar em uso; se depois for necessária edição colaborativa da mesma Session em várias janelas, isso deve ser tratado como um design de sincronização separado.

### 5.1 Capacidade do rascunho

O Composer Draft não é mais podado pela quantidade de escopos. A escolha de modelo é estado de longo prazo do usuário e não pode ser removida silenciosamente por herdar um teto fixo do rascunho de texto temporário; só é removida quando o usuário limpa explicitamente o escopo ou quando o próprio armazenamento recusa a escrita.

## 6. Sequenciamento da submissão

### 6.1 Criação da Submission

A Submission deve ser copiada de uma só vez do estado em memória do Composer no mesmo instante:

```text
Composer State
├─ prompt
├─ attachments
├─ mode
└─ modelSelection
        |
        v
一个不可变 Submission
```

É proibido que a função de submissão preencha campos a partir de:

- Agent Session Snapshot;
- Workspace `draftPreferred*`;
- global mode em localStorage;
- outra consulta de estado de modelo feita temporariamente antes do envio.

### 6.2 Submission aceita

Após a aceitação bem-sucedida, limpa-se apenas o que já foi enviado e preservam-se as escolhas de execução:

```text
提交前 Draft
├─ text = "请修复问题"
├─ attachments = [...]
├─ mode = build
└─ modelSelection = DeepSeek/high
        |
        v
Submission accepted
        |
        v
提交后 Draft
├─ text = ""
├─ attachments = []（仅内存）
├─ mode = build
└─ modelSelection = DeepSeek/high
```

- Session existente: salvar o Draft com o conteúdo limpo no escopo da Session original;
- nova tarefa quando uma Session real é criada a partir de `__draft__`: transferir o mode/ModelSelection preservados para o escopo da nova Session e só então apagar o escopo Root antigo;
- o Composer Recent salva uma única vez o modelSelection e o mode congelados desta submissão depois que o App aceita a Submission do usuário; ele não é atualizado por clique de menu, pré-aquecimento de sessão vazia nem recuperação histórica;
- o execution state da Agent Session é atualizado na fronteira de aceitação/início e não pode anteceder o sucesso da Submission.

A limpeza após a aceitação precisa carregar uma revisão/token local desta submissão, para impedir que um resultado atrasado apague a nova entrada gerada pelo usuário durante a espera:

```text
Submission A 从 Composer revision R 创建
        |
        +--> 等待 Agent admission
        |
用户继续输入或切模，Composer 已推进到 R+1
        |
Submission A 接纳成功
        |
        `--> 只能清理仍属于 R 的已提交内容
             不得清理 R+1 的文本、附件、mode 或 ModelSelection
```

Isso é apenas uma comparação e condição de limpeza locais a uma única operação de envio, e não estabelece `LastSubmittedState`. Com ou sem modificação concorrente, o mode/ModelSelection mantido no Composer após o envio bem-sucedido segue o estado em memória mais recente.

### 6.3 Falha na submissão

- Quando a Submission não é aceita, restaurar ou preservar o texto, anexos, mode e ModelSelection anteriores ao envio;
- não é permitido restaurar apenas o prompt e perder a seleção;
- a restauração após falha não pode ser sobrescrita novamente por uma limpeza atrasada;
- não criar `LastSubmittedState`; o snapshot anterior ao envio serve apenas como material de rollback local desta operação assíncrona.

A transferência do escopo Root também obedece a latest intent wins: escrever primeiro no escopo da Session de destino e só apagar o escopo Root correspondente após o sucesso; se o Composer Root já tiver gerado atualizações durante a aceitação, mover somente o estado correspondente ao conteúdo aceito nesta vez, sem sobrescrever com um snapshot antigo o Composer já atualizado.

## 7. Atualização do Registry e invalidação da seleção

Quando a revision do Registry muda, o ModelSelection do Composer Draft atual precisa ser validado com a nova `ModelSelectionView`.
A validação acontece somente quando a View está realmente Ready e a revision avançou; não tratar loading/error/unavailable como invalidação de seleção.

```text
Persisted / In-memory ModelSelection
                +
Ready ModelSelectionView(revision N)
                |
                v
          按层级校验 Selection
          |
          +-- 全部有效
          |      `--> 原样保留
          |
          +-- Provider 或 Model 失效
          |      +--> 整份 Selection 置空
          |      +--> 不使用 Host preferredSelection，不弹提示
          |      `--> 用户完成选择前禁止提交
          |
          `-- Provider / Model 有效，Reasoning 缺失或失效
                 +--> 保留 providerId/modelId
                 +--> 只清空 reasoningLevel
                 +--> 不自动补档位，不弹提示
                 `--> 用户完成选择前禁止提交
```

Os casos a seguir reutilizam o mesmo validator, mas precisam distinguir a camada de invalidação:

- Provider inexistente ou não selecionável, Model inexistente ou não selecionável: a identidade do modelo já está inválida, e a Selection inteira é anulada;
- reasoning salvo que não pertence mais aos `values` ordenados do modelo atual, ou reasoning ausente exigido pelo contrato de envio: a identidade do modelo continua válida e apenas `reasoningLevel` é limpo.

Requisitos de tratamento:

- Após Provider/Model ficarem inválidos, manter a seleção vazia e não substituir automaticamente por Recent, Default Configurado ou preferred do Host;
- Quando o Reasoning fica inválido, não preencher automaticamente com o mais alto, o mais baixo ou o Default Configurado, e não alterar o Provider/Model que continuam válidos;
- Modelo vazio ou Reasoning vazio é expresso apenas pelo estado vazio do controle e pela impossibilidade de enviar, sem Toast, modal ou banner extra de invalidez; remover as notificações correspondentes e a lógica de deduplicação;
- O estado limpo atualiza imediatamente o estado em memória e é persistido; renders, revisions, trocas de página e reinícios seguintes não podem preenchê-lo automaticamente;
- Um rascunho totalmente novo que nunca teve seleção e não tem Draft persistente segue a inicialização normal.

A estrutura persistente atual de `ModelSelection` permite que `reasoningLevel` esteja temporariamente ausente, então aqui não se adiciona `PartialModelSelection`, `ComposerModelChoice` ou outro DTO intermediário. Esse estado incompleto só pode existir no Composer Draft e na fronteira de recuperação histórica; ao criar a Submission é preciso passar antes pela validação de completude, e o ModelFactory continua recebendo apenas uma Selection completa e executável.

O Todo 70 trata da migração/estado não vinculado da Selection antiga ao recuperar Sessions históricas; esta seção trata das escolhas de um Composer já normalmente aberto após uma atualização do Registry. Os dois são unificados como deixar vazio, sem substituição automática e sem aviso, e já não se mantém um fallback de invalidez distinguido por cenário.
O que é cancelado é a notificação de seleção vazia, não o feedback normal de erro de falha real de requisição, falha de envio ou falha de persistência.

## 8. Limites de Queue, Guide e execução

Este Todo não muda a semântica de produto de Queue e Guide; apenas fixa a fronteira de Submission da qual ambos dependem:

- um item de Queue salva a Submission completa no momento do enfileiramento; ao sair da fila não relê o Composer nem a Selection mais recente da Session;
- clicar em "agora" continua usando a Submission própria daquele item de Queue;
- depois que um Guide é aceito pelo Loop atual, o execution state da Session é atualizado pela fronteira atômica já existente, e o novo Active Model é usado a partir de um model-step válido;
- quando o Registry muda após o enfileiramento e torna a Selection do item de Queue inexecutável, falhar explicitamente e preservar a entrada, sem rotear silenciosamente para outro Provider/Model/Reasoning;
- Desktop `continuous` e Mobile `replayable` apenas passam a mesma Submission já submetida, não derivam padrões por conta própria e não criam uma segunda fila de accepted-input no Renderer.

A semântica de produto mais ampla de enfileiramento e "guia imediato" já foi adiada; este Todo não modifica `sendQueuedNow` nem o comportamento padrão de imediato.

## 9. Limpeza da implementação existente

### 9.1 Unificar o estado do Composer

- estender `composerDraftStore.ts` para que leitura, gravação, limpeza e transferência de escopo preservem mode/ModelSelection;
- `ConversationComposer`, `SessionPane`, a Toolbar e os controles de mode/model passam a ler uniformemente o estado em memória do Composer;
- o sucesso do envio muda de "apagar o Draft inteiro" para "limpar o conteúdo enviado e preservar mode/ModelSelection";
- adicionar testes explícitos de transferência de escopo quando o Root Draft cria uma Session.

### 9.2 Remover a segunda fonte de verdade

Depois de provar que não há outros consumidores de produto, remover ou restringir:

- `draftPreferredModel`;
- `draftPreferredMode`;
- `draftPreferredThoughtLevel`;
- o fallback contínuo do `draftModePreference` global do Renderer para o Composer atual;
- a montagem dinâmica Snapshot + Draft + Initial Config em `resolveCurrentComposerSubmission()`;
- a lógica de a Toolbar ler o mode/model atual de `snapshot.config`;
- o caminho que usa CAS do config do Agent como confirmação de clique de menu de mode/model.

Antes de remover, é preciso confirmar um a um com uma auditoria de referências. Se `draftPreferred*` ainda atender a produtos fora do Composer, primeiro separar claramente os consumidores; não apagar mecanicamente estado compartilhado.

### 9.3 Manter, mas redelimitar

- Session Selection: manter; representa a intenção persistente de modelo para a execução posterior do Agent e não renderiza o Composer diretamente;
- Session mode/runtime config: manter; serve a permissões, comportamento de ferramentas, recuperação e execução de protocolo; oferece uma única seed de inicialização apenas quando o Composer não tiver Draft pela primeira vez;
- Prewarm: pode continuar recebendo a configuração completa atual do Composer para performance de inicialização e readiness, mas não é fonte de verdade da UI; a primeira Submission oficial ainda precisa carregar mode/ModelSelection de forma atômica;
- configurações como `followupMode`, que não fazem parte desta consolidação de model/mode do Composer, não são removidas mecanicamente.

## 10. Consolidação de nomenclatura

A nomenclatura precisa refletir a propriedade do estado:

- `draftConfig` passa a `composerState` ou `composerDraftState`;
- `resolveCurrentComposerSubmission` passa a expressar "construir a Submission a partir de um snapshot do Composer", por exemplo `createSubmissionFromComposer`;
- no lado do Agent, se `getModelSelection()` realmente ler a seleção posterior da Session, conforme o Todo 68 mudar para `getSessionModelSelection()`;
- é proibido continuar usando `currentModel`, `currentMode` para valores ambíguos que podem ser tanto do Composer quanto do Agent Runtime.

A nomenclatura concreta deve seguir a responsabilidade real na implementação; não criar camadas de wrapper nem aliases de compatibilidade apenas por causa da renomeação.

## 11. Superfície de impacto entre camadas

| Camada | Mudanças deste Todo | O que não pode acontecer |
| --- | --- | --- |
| UI / Composer | estado em memória completo, interação de menu, estado vazio de seleção | reler o Session Snapshot a cada render |
| Draft persistence | persistir text/editor/mode/ModelSelection | persistir Active Model, credenciais ou Option Specs |
| Submission | uma cópia do estado completo do Composer | completar mode/model a partir da Session após o envio |
| App Recent | salvar após a aceitação a Selection + mode da última Submission | atualizar o Recent ao clicar no menu |
| Agent Session | registrar o estado de execução após a aceitação | servir como store em tempo real do Composer do Renderer |
| Registry | fornecer View Ready, preferred e validação de Selection | o Renderer copiar o algoritmo de fallback |
| Queue / Guide | manter a Submission congelada | reler o Composer em tempo de execução |
| Remote | repassar a mesma Submission e a workspace identity | Relay/Main manter estado de negócio do Composer |

Automation, Repo Wiki, Subagent, Off-Peak, Bot, Prompt CLI e TUI não migram para o App Composer Draft. Neste ciclo só se verifica que eles não foram atingidos indevidamente pela limpeza de helpers compartilhados.

## 12. Plano de testes primeiro

### 12.1 Testes unitários do Draft Store

- round-trip de JSON de mode e ModelSelection completo;
- `workspaceIdentity` tem precedência sobre o isolamento por `workspacePath`;
- escopo de Session e `__draft__` não trocam dados;
- Draft ainda é preservado quando só tem mode/ModelSelection e o texto está vazio;
- limpar o conteúdo enviado não limpa mode/ModelSelection;
- após a transferência do escopo Root para o escopo da nova Session não restam duas cópias;
- um Draft de versão antiga com apenas text/editor pode ser lido e completar uma inicialização;
- salvar 51 escopos não faz evicção; 500 são mantidos normalmente; o 501º faz evicção do escopo mais antigo por hora de atualização, preservando o item recém-escrito;
- registros apenas com mode/modelSelection ou com seleção vazia fazem round-trip normal dentro da capacidade e não são removidos por causa do texto vazio.

### 12.2 Testes de componente do Composer

- em uma Session existente, clicar em um mode exibe o novo valor imediatamente e fecha o menu; o re-render por Snapshot não pode sobrescrever;
- depois de trocar Model/Reasoning, a UI, o Draft e a Submission final são consistentes;
- após reinício do App/remount do componente, o mesmo mode/ModelSelection é restaurado;
- Submission bem-sucedida limpa o texto mas preserva mode/ModelSelection;
- Submission com falha restaura integralmente o estado anterior ao envio;
- entrada de texto em chinês, anexos e as interações de envio existentes não regridem.

### 12.3 Testes de invalidação do Registry

- quando Provider ou Model ficam inválidos, a Selection inteira fica vazia; mesmo que a View tenha `preferredSelection`, não há substituição automática;
- sessão antiga não vinculada, Draft existente inválido e Draft vazio restaurado após reinício permanecem vazios; uma tarefa nova de verdade primeira ainda pode usar o preferred na inicialização;
- quando Reasoning está ausente ou inválido, Provider/Model são mantidos e apenas Reasoning é limpo; o Renderer não escolhe automaticamente o nível mais alto nem o mais baixo;
- é proibido enviar antes de o Reasoning ser escolhido de novo; após a escolha, a Submission completa é construída;
- é proibido enviar sem modelo ou sem o Reasoning exigido;
- limpar modelo/Reasoning não exibe aviso de invalidez, e revision/remount repetidos também não exibem;
- alternâncias de loading/error/LKG não geram falso relato de invalidação;
- o estado vazio é persistido e, após reinício, nem restaura o valor antigo inválido nem preenche automaticamente um valor padrão.

### 12.4 Testes de integração Submission / Queue / Agent

- a Submission carrega prompt, anexos, mode e ModelSelection de forma atômica;
- modificar o Composer após o envio não altera a Submission já enfileirada;
- a saída da Queue e o clique em "agora" não relê os valores atuais do Composer/Session;
- após o Agent admission, o estado da Session é consistente com a Submission;
- o Active Model do Todo 68 é criado pela Selection desta Submission, sem Context/Tools/Request ficando um passo atrasados;
- quando a Selection enfileirada fica inválida depois, a falha é explícita e a entrada é preservada.

### 12.5 App E2E / máquina real MacBook Pro

Verificar no mínimo:

1. uma conversa existente muda de "acesso total" para "edição automática", e o menu fecha imediatamente exibindo o valor correto;
2. sem enviar mensagem, trocar de tarefa e voltar preserva a seleção;
3. após reiniciar o App, a seleção é preservada;
4. após o envio bem-sucedido o texto é limpo, mas mode, Provider/Model e reasoning não voltam ao valor antigo;
5. alternando consecutivamente Providers diferentes com o mesmo modelId, a primeira requisição usa a Selection atual do Composer;
6. quando uma atualização do Registry invalida Provider/Model o modelo fica vazio; quando apenas o Reasoning é invalidado, Provider/Model são mantidos e apenas o nível é limpo;
   nenhum dos dois exibe aviso, ambos continuam vazios após reinício e o usuário consegue enviar depois de escolher novamente;
7. Desktop continuous e Mobile remote replayable recebem a mesma configuração de Submission.

Por envolver interação de UI, é preciso adicionar ou atualizar um caso de Desktop E2E; conforme a exigência mais recente do usuário, validar em um MacBook Pro. Casos novos entram primeiro em pending pelo fluxo; não se pode alegar promoção manual só porque a automação passou.

## 13. Sincronização da documentação

Revisar junto com a implementação:

- `design/interaction/selection-state.md`: o sucesso do envio limpa apenas o conteúdo e preserva a escolha de execução do Composer; esclarecer o limite de persistência de anexos;
- `design/interaction/interaction.md`: o estado da Session participa de uma única inicialização apenas quando falta Draft;
- `design/interaction/submission-delivery.md`: a Submission é criada a partir de um snapshot completo do Composer;
- Conversation Protocol / Product State Space / Case Catalog: atualizar o state owner do Composer, a limpeza após sucesso e os casos de congelamento de Queue;
- Feature Graph: remover as arestas antigas de projeção contínua de mode/model do Session Snapshot para o Renderer;
- Todo 68: manter apenas o fato de Active Model/Context dentro do Agent, sem assumir a persistência do Composer;
- Todo 70: reutilizar o mesmo Selection validator, unificando deixar vazio, sem substituição automática e sem aviso, removendo a bifurcação de política entre recuperação histórica e Draft ativo.

Se os itens I50/I51/I52 do Case Catalog atual ainda descreverem operações de menu model/mode como CAS de config do Agent, precisam ser revisados conforme a nova propriedade do estado:
manter os fatos de produto como "intenção de UI imediata, latest intent wins, readiness barrier da primeira Submission" e remover a antiga premissa de implementação de que o Agent Snapshot é a fonte de confirmação do Composer.

## 14. Fora do escopo deste Todo

- não modificar a semântica de produto de Queue e Guide/imediato;
- não tratar o problema de consistência histórica de `outputStyle` dentro do mesmo Turn;
- não projetar a serialização de anexos entre reinícios;
- não mudar a estrutura de domínio de Provider Config, Account Overlay, Registry ou ModelFactory;
- não mudar as regras de herança de escolha de Automation, Repo Wiki, Subagent e Off-Peak;
- não adicionar novos timeouts, polling ou protocolo de sincronização bidirecional Session/Renderer;
- não afundar o estado do Composer no Desktop Main, no Relay ou no Remote Host.

## 15. Critérios de conclusão

- text/editor/mode/ModelSelection do Composer são expressos por um estado em memória e um Draft persistente correspondente;
- o Agent Snapshot de uma Session existente só pode inicializar uma vez e não pode sobrescrever um Composer vivo;
- o clique de menu de mode/model tem efeito imediato, fecha o menu e pode ser restaurado após troca de página e reinício;
- a Submission congela atomicamente o estado do Composer; após o sucesso limpa apenas o conteúdo enviado e após a falha restaura integralmente;
- a invalidação do Registry passa por um validator unificado; Provider/Model inválido deixa vazio e Reasoning inválido limpa apenas o nível preservando a identidade do modelo;
  sem substituição automática e sem aviso, e o estado vazio se mantém após reinício;
- Queue, Guide, Desktop continuous e Mobile replayable não relêem o Composer nem criam uma segunda verdade de seleção;
- `draftPreferred*`, o merge dinâmico de Snapshot e a antiga preferência de mode passam por auditoria de referências e são removidos na medida do possível;
- Todo 68/70 e os documentos de design ficam sincronizados, sem descrições contraditórias de propriedade do estado;
- os testes unitários relacionados, testes de integração de Bootstrap, Desktop E2E, `pnpm typecheck`, `pnpm lint`, verificação de formatação e `git diff --check` passam todos;
- o problema original é reproduzido em um MacBook Pro e obtém-se evidência de runtime após a correção.

## 16. Registro de implementação

A preencher após a execução.