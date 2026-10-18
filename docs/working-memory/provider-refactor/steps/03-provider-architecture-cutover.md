# M3: Cutover da arquitetura de Provider

> Status: implementação da linha de base atual concluída, aguardando decisão de integração e portão de lançamento
>
> Atualizado em: 2026-08-21
>
> Veículo de implementação: o Draft Merge Request atual; o branch de origem mantém temporariamente a nomenclatura histórica do M2, mas as semânticas de fase e de revisão seguem o M3, sem abrir branches paralelos

O M3 é um cutover completo de arquitetura. O Provider Config, o Registry, o ModelFactory e a integração de produção já concluídos no Merge Request atual constituem sua base; esta fase continua com a Submission atômica, o estado de seleção de modelo, a página de configurações de Provider, e remove os protocolos antigos e os antigos estados de runtime substituídos pela nova cadeia. Toda a alteração é aceita como um único Merge Request grande para revisão e verificação de lançamento; esta é a experimentação explícita desta migração, sem publicar separadamente a base M2 já concluída e depois abrir o M3.

Os designs alvo estão respectivamente em:

- [`../design/registry/registry.md`](../design/registry/registry.md): Config, Registry e criação de Model;
- [`../design/interaction/interaction.md`](../design/interaction/interaction.md): Draft, Selection, Submission, Queue e Guide;
- [`../design/registry/settings.md`](../design/registry/settings.md): salvamento na página de configurações, reordenação e teste de conectividade;
- [`../design/execution/execution.md`](../design/execution/execution.md): limite entre a fase atual e o Provider de escopo de execução.

Este documento é responsável por organizar esses designs já definidos em um plano de migração executável, revisável e verificável.

## Cadeia principal após a conclusão

Após o M3, os fatos estáticos de Provider, a intenção de envio do usuário e a execução de modelos passam por pontos de entrada únicos:

```text
Official Config ─┐
Personal Config ─┼─> Process Registry
Account Config ──┘        ├─ Settings View
                           ├─ Selection View
                           └─ createModel(ModelSelection)

Composer Draft / CLI Input
├─ prompt
├─ attachments
├─ mode
└─ ModelSelection
          |
          v
     CoreSubmission
          |
          v
CLI Admission
├─ start-now
├─ queue
└─ guide
          |
          v
Session Selection + Active Model
          |
          v
      ModelRequest
```

Essa cadeia forma três fronteiras claras:

1. Config e Account Source determinam quais Providers e modelos existem no Environment atual.
2. A Submission fixa uma entrada do usuário e sua intenção de modelo; durante a entrega, o estado posterior do Composer não é mais lido.
3. O Registry cria o Model conforme a Selection; o Model e o resultado da requisição são os fatos de execução para atribuição de Usage, Trace e erros.

## Base atual e relação entre fases

O antigo M2 já concluiu a infraestrutura de Provider do M3:

- as três camadas de Provider Config: Official, Personal e Account;
- o Registry em nível de processo, as Facades Settings/Selection e o ModelFactory;
- as principais montagens de produção de Host, Worker, Prompt CLI e TUI;
- a configuração estática do Account Provider e a fronteira de autenticação no momento da requisição;
- a aposentadoria do Catalog antigo, do Preset, do Workspace Snapshot e dos fatos estáticos de Provider do runtime.

Essas alterações ainda não foram integradas isoladamente, portanto o M2 do Roadmap é tratado como a fatia de base já concluída do M3. O M3 não as reimplementa; em vez disso, conclui a cadeia de interação e de configurações no mesmo branch, entrando depois em verificação de lançamento como um sistema coerente.

## Escopo de implementação

### M3.0: Fixar a linha de base e a estrutura de revisão (topologia remota pendente de decisão)

O plano concreto está em [`03-staging-integration.md`](./03-staging-integration.md). O staging local atual passou por um rebuild histórico; antes da decisão do usuário não se faz merge nem rebase das branches remotas. O M3 avança primeiro com fatias auditáveis usando a árvore de trabalho M2 atual como autoridade. Antes do lançamento final ainda é necessária a decisão de topologia, confirmando que apenas as alterações de Provider válidas são mantidas e validando integralmente as semânticas de produto como Video Input, tipos de entrada de modelo e raciocínio ox-alpha; nenhuma integração pode restaurar as implementações antigas já removidas do staging.

O Merge Request grande mantém vários commits com responsabilidades claras e organiza as Changes pelas seguintes áreas de revisão:

```text
A  Base de Config / Registry
B  Protocolo Submission / Selection
C  CLI Admission / Queue / Guide / Session
D  ModelRef e aposentadoria do antigo estado de runtime
E  Provider Settings Service
F  Provider Settings UI
G  Teste de conectividade / Model / Adapter
H  Limpeza de migração, testes e documentação
```

As áreas servem para reduzir o custo de revisão e não formam uma implementação de dois trilhos de longo prazo coexistindo.

### M3.1: Atualizar o spec de comportamento oficial e o mapa de testes

Antes da implementação, a Submission atômica é escrita no Spec de longo prazo, eliminando nos documentos existentes a formulação antiga de "a Queue lê o modelo mais recente da Session ao consumir". É preciso verificar sincronamente:

- a Conversation Protocol Declaration;
- o Conversation Product State Space;
- o Conversation Case Catalog e o Coverage Matrix;
- as arestas de Composer, Queue, Guide, Edit, Retry e troca de modelo no Feature Graph;
- a fronteira de entrega da mesma Submission no Desktop continuous e no Mobile replayable.

O Working Memory determina o alvo da migração; o Spec oficial determina o comportamento do produto após o lançamento. Os casos de teste são extraídos do Spec, não inferidos da implementação atual.

### M3.2: Estabelecer o protocolo atômico de CoreSubmission

Shared Protocol, Renderer, Services e CLI usam a mesma estrutura de Submission:

```ts
interface CoreSubmission {
  prompt: string;
  modelSelection: ModelSelection;
  attachments?: readonly SubmissionAttachment[];
  mode?: AgentMode;
}
```

O protocolo recebe um envio único e atômico de prompt, attachments, mode e ModelSelection. O envio normal deixa de depender da ordem de chamada entre `switchModelConfig` e `sendText`, e também deixa de passar "o modelo da próxima mensagem" por um Runtime mutável.

Desktop continuous e Mobile replayable podem adotar mecanismos diferentes de recuperação de transporte, mas ambos carregam a mesma Submission completa. O Workspace remoto continua repassando `workspaceIdentity` e `remoteSessionId`, e o refatoramento de Provider não altera o owner, o lease nem a responsabilidade de recuperação replayable do controle remoto.

### M3.3: Tornar o CLI Admission a autoridade de execução

O CLI escolhe explicitamente um resultado de admission ao receber a Submission:

```text
Core idle
└─ start-now
   ├─ Registry cria o Model
   ├─ Session Selection = Submission Selection
   └─ inicia o Agent Loop

Core busy
└─ queue
   └─ o item da Queue guarda a Submission completa

Guide aceito
├─ a Request já enviada continua usando o Model antigo
├─ o novo Model é criado e trocado no limite de Step
├─ Session Selection = Guide Selection
└─ os Steps seguintes usam o novo Model
```

A Queue usa a Selection contida no objeto enfileirado. Trocas posteriores no Composer, outras entradas durante a Session e atualizações de Config não podem reescrever um item de Queue já aceito.

Guide e "imediato" usam a mesma semântica. Quando criar o Model, injetar o Context ou atualizar o estado da Session não puder ser concluído integralmente, a Submission completa vai para a Queue, sem deixar estados intermediários que só troquem o modelo ou só insiram texto.

Edit e Retry derivam da Submission de origem e, por padrão, herdam a Selection de origem; caso futuramente seja oferecida a opção "tentar novamente com o modelo atual", ela deve formar uma Submission explícita carregando a nova Selection.

### M3.4: Convergir o estado de seleção do Renderer

A seleção no Composer expressa apenas a próxima Submission. O Renderer é responsável pelo Draft e pelo App Recent e não modifica mais o CLI Runtime antecipadamente:

```text
O Composer edita ModelSelection B
├─ atualiza o Draft
└─ não afeta o Active Model A

O usuário envia
├─ forma a Submission B
├─ o App atualiza o App Recent após aceitar
└─ a CLI atualiza o Session Selection após iniciar a execução
```

A inicialização e os momentos de escrita de App Recent, Configured Default, Draft, Session Selection e Active Model continuam conforme [`../design/interaction/selection-state.md`](../design/interaction/selection-state.md). O Prompt CLI e o TUI não leem nem escrevem o App Recent.

### M3.5: Aposentar o ModelRef e o estado de modelo compartilhado mutável

O M3 remove, da cadeia de execução normal, o `ModelRef`, o `defaultModelRef` e o protocolo interno baseado em strings `providerId/modelId`. Os campos existentes migram conforme sua semântica real:

```text
ModelRef.providerId / modelId -> ModelSelection
ModelRef.variant              -> ModelSelection.options.reasoningLevel
ModelRef.role / Lite          -> remoção
ModelRef.source               -> Submission ou metadata de Trace
```

A `ModelSelection` estruturada é a intenção de modelo do estado no processo e do protocolo entre processos. A entrada humana da CLI pode continuar oferecendo a forma abreviada `provider/model`, mas a resolução acontece apenas na fronteira de entrada; internamente essa string não é armazenada, concatenada nem reanalisada.

Antes da remoção, use uma auditoria de referências para confirmar que todos os consumidores de produção já migraram. O `turnRuntimeModel` pertence à fronteira do M4 para o Provider de escopo de execução; nesta fase seu uso não é ampliado, e sua remoção não é condição de conclusão do M3.

### M3.6: Concluir o Provider Settings Service

O Renderer lê e modifica Providers através do Provider Settings Service do Environment alvo. O Service é responsável por:

- retornar a Settings View adequada para a página de configurações;
- salvar o Draft completo do Provider e calcular o Overlay esparso do Personal;
- adicionar, renomear, excluir e reordenar Provider/Model;
- aguardar a persistência da Config e a vigência da revision correspondente do Registry;
- usar o Registry para criar o Model e executar o teste de conectividade;
- projetar erros de domínio como uma estrutura de erro estável para a página de configurações.

O Renderer não lê a configuração física, não executa Overlay, não avalia a admissão do Registry e não monta requisições de Provider.

O momento do salvamento precisa formar um ponto de conclusão explícito:

```text
O Renderer envia o Draft de revision N
        |
        v
O Settings Service salva a Personal Config
        |
        v
O Registry observa a Config de revision N
        |
        v
O Service retorna a Settings View de revision N
        |
        v
O Renderer só então exibe "salvo"
```

### M3.7: Concluir a interação da página de configurações

A página de configurações adota a semântica de salvamento automático já definida: o texto é enviado ao perder o foco, ao pressionar Enter ou ao trocar de Provider; seleções, interruptores e arrastos são enviados assim que a operação é concluída. A página exibe os estados dirty, saving, success e failure, e só mostra o visto de sucesso depois que o Host confirma a revision correspondente.

Esta fatia conclui simultaneamente:

- criar imediatamente `new-provider[-N]` após adicionar um Provider, sem manter um segundo botão "salvar";
- unificar o Provider ID com o nome do usuário, com a renomeação concluída por uma operação atômica do Service;
- alterar o ID do modelo em uma página de edição de modelo separada; a lista não oferece edição de nome embutida;
- oferecer arrastar para Providers Personal-only e modelos Personal reordenáveis;
- reordenar o Personal Overlay pela ordem efetiva após a reordenação, mantendo os itens sobrescritos Official na ordem Official;
- usar o mesmo contrato de Service no Desktop e no Mobile Web, com layout e feedback seguindo as normas de UI do projeto e os requisitos de internacionalização.

### M3.8: Usar o Model oficial para o teste de conectividade

Ao clicar em testar na página de configurações, primeiro envia-se o Draft ainda não salvo, aguarda-se a atualização da Config e do Registry, e só então o Registry cria o Model oficial:

```text
flush Draft
    -> wait Registry revision
    -> createModel(ModelSelection)
    -> Model.streamText(minimal request)
    -> consume stream
    -> normalized result
```

Essa cadeia reutiliza o Adapter oficial, o Request Auth, o mapeamento de Reasoning e as fronteiras de erro. O M3 remove a Connectivity Probe independente, bem como as vias alternativas em que Renderer/Host montavam manualmente Endpoint, Header ou corpo de requisição.

### M3.9: Remover a cadeia antiga e concluir a auditoria completa

A última fatia remove o código substituído com base em referências e verificação de runtime. O portão de remoção é uma condição comportamental, não uma adivinhação por nome de arquivo:

- o envio normal não tem mais a sequência `switchModelConfig -> sendText`;
- a Queue não lê mais o Composer atual ou o modelo mais recente da Session ao consumir;
- a cadeia de execução normal não lê mais `ModelRef`, `defaultModelRef` ou Lite role;
- o Renderer não resolve mais Config de Provider, estado de Account ou admissão do Registry;
- o teste de conectividade não tem mais Probe independente;
- os fatos estáticos de Provider não voltam mais de Catalog, Preset, Workspace Snapshot ou Config antiga da CLI;
- Usage e Trace obtêm a identidade do modelo a partir do Model real;
- o código de compatibilidade antigo mantém apenas as fronteiras de M4, M6 e M7 explicitamente delimitadas no Design.

Código antigo cuja existência de consumidores de produção não possa ser provada é removido diretamente, sem criar novo fallback.

## Matriz de aceitação

A matriz comportamental mínima do M3 é a seguinte. Cada item precisa de teste unitário ou de integração; casos entre processos, recuperação e temporização de UI usam a cobertura E2E correspondente.

| Cenário                                     | Resultado que deve ser preservado                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Loop está usando A e o Composer troca para B | a Request atual e os Steps seguintes continuam com A, até que uma nova Submission ou Guide seja recebida |
| Envio de B em estado ocioso                  | Submission, Session Selection, Active Model e Usage usam B                                     |
| B é enfileirado enquanto ocupado e depois o Composer troca para C | B ainda é usado quando sai da fila                                        |
| Guide usa B                                  | a Request já enviada usa A, os Steps seguintes usam B e o Session Selection passa a B         |
| Edit / Retry                                 | herdam por padrão a Selection da Submission de origem                                         |
| Reinício ou recuperação do App              | Draft, App Recent e Session Selection são restaurados em seus respectivos escopos; a CLI/TUI não consome o App Recent |
| Atualização de API Key ou Config              | o Active Model existente não muda; a próxima criação de Model usa o Registry mais recente      |
| Teste na página de configurações             | salva e aguarda o Registry primeiro, e só então chama pelo Model oficial                     |
| Arrastar Provider / Model                     | a ordem efetiva e a ordem do Personal Overlay seguem o design de configurações, com rollback da UI em caso de falha |
| Renomear Provider / Model                    | a seleção atual é migrada para a frente; o histórico concluído mantém a identidade antiga    |
| Envio do Desktop / Mobile                    | ambos os lados transportam a mesma Submission completa, com a fronteira continuous/replayable inalterada |
| Workspace remoto                             | usa o Registry do Environment remoto e não transmite a configuração ou a autenticação de Provider da máquina local |

## Conteúdo explicitamente deixado para fases posteriores

O M3 não aproveita para expandir os seguintes pontos:

- Provider de escopo de execução, tarefas ociosas e política de modelo forçado de Subagent, continuam tratados pelo M4;
- publicação de gerenciamento remoto da Provider Config, sincronização entre Environments e login independente, continuam tratados por M5/M7;
- o modelo interno de identidade, direitos e credenciais dinâmicas do Account Provider, continua aprofundado pelo M6;
- o refatoramento do dialeto de Reasoning do Adapter não é misturado com a Submission atômica, e o comportamento existente permanece compatível;
- o `turnRuntimeModel` é mantido apenas nas fronteiras de execução especiais já delimitadas.

Essas fronteiras permitem que o Merge Request grande atual complete a troca da cadeia de produto normal, evitando trazer tarefas ociosas, Plan e o refatoramento de conta remota para esta fase novamente.

## Definição de conclusão

O M3 só é concluído quando as condições a seguir forem simultaneamente atendidas:

1. As três camadas de Config e o Registry em nível de processo são a única fonte de verdade para o Provider normal.
2. Todas as entradas do usuário entram no Core como Submission completa, e Queue e Guide usam a mesma estrutura.
3. O estado e os momentos de Composer, App Recent, Session Selection e Active Model seguem o Design.
4. O ModelRef e o estado de modelo compartilhado mutável do Runtime saem da cadeia de execução normal.
5. A página de configurações conclui salvamento automático, edição, reordenação e teste de conectividade por meio do Service oficial.
6. As cadeias antigas de Provider, troca de modelo e Connectivity Probe foram removidas.
7. A verificação de tipos, o lint, os testes unitários afetados, os testes especializados de Provider/Conversation e os E2E necessários passam.
8. Os commits e as Changes do Merge Request podem ser rastreados por área de revisão, e o Working Memory e o Spec oficial estão sincronizados com os resultados reais.

Se durante a implementação surgir algum problema não coberto pelo design, registre-o no log de implementação do M3 e avance tomando uma decisão recomendada conforme os princípios já definidos; problemas que alterem a semântica alvo, o protocolo público ou as fronteiras de fase entram em Human in the Loop antes de modificar o Design.