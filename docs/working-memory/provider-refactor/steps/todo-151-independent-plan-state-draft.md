# Todo151: estado independente do Plan, marcador na caixa de entrada, fidelidade dos campos de submissão da Queue e salvamento/restauração

Estado: em execução. Em 2026-09-15 o usuário aprovou completar a discussão e iniciar a implementação. Este item substitui uniformemente o hotfix de `prePlanMode` do Todo152; o nome do arquivo foi mantido para compatibilidade com referências existentes.

## Veredito mais recente

- A permissão do usuário é `mode: build | edit | yolo`; o Plan usa separadamente `planEnabled: boolean`; o `auto` reservado internamente pelo Runtime não é reestruturado por causa disso.
- Permissão e Plan são independentes; `yolo + Plan=true` é legal, mas ainda aplica as restrições existentes de ferramentas de planejamento. A aprovação desliga apenas o Plan, não restaura nem reescreve a permissão; o novo fluxo não depende mais de `prePlanMode`.
- Plan e Goal permanecem mutuamente exclusivos. A aprovação continua o Turn atual e não envia automaticamente uma nova mensagem de usuário.
- Não há aviso visível de histórico ao entrar/sair do Plan, e nenhum novo tipo de evento é criado para esses avisos. O estado de execução ainda precisa ser entregue corretamente ao cliente pela cadeia de sincronização de configuração existente.
- Não se altera o conteúdo do system prompt, a forma de transporte MCS ou as regras existentes de capacidade de ferramentas; apenas se ajusta a base de disparo dos avisos de planejamento/saída já existentes.

## UI e rascunho

- O menu de seleção continua com quatro itens: «Plano» no topo, com um separador abaixo, e então as três permissões (mantendo a ordem atual entre as permissões). As três opções de permissão alteram apenas a permissão; o item «Plano» alterna conforme o estado da marcação: quando desmarcado, ativa o Plan; quando marcado, um novo clique desativa o Plan; não sobrescreve a permissão e não ganha uma entrada permanente separada.
- O marcador fica à direita da permissão, separado por uma linha vertical independente de 12px de altura, com `gap-1` (4px) de espaçamento dos dois lados da linha; o ícone e o texto «Plan»/«计划» formam um único botão, reutilizando o estilo ghost dos botões de menu vizinhos, altura de 28px, tamanho de fonte e padding. O texto segue o breakpoint do contêiner `@xl/composer` e a barra de ferramentas decide de forma unificada conforme o espaço real (primeiro encolhe a permissão, depois o prefixo de provedor, Computer e Plan): em largura estreita só o ícone é exibido e os botões de permissão e de Plan são quadrados de 28×28px (`size-7 p-0`); quando há largura suficiente, voltam a largura automática com padding lateral e exibem Plan/计划, e o botão inteiro sempre pode desligar e mantém um nome acessível; em ambos os estados (estreito e largo) usa o Tooltip compartilhado da barra, mostrando «关闭计划模式»/«Turn off Plan mode» no hover ou no foco por teclado. O texto e o ícone do botão usam uniformemente a cor secundária de primeiro plano (`text-foreground-subtle`), mantida no hover. Exibe por padrão uma lâmpada, substituída no lugar pelo ícone de desligar no hover/foco por teclado, sem acrescentar um X ao final; no toque a lâmpada é mantida e basta clicar em todo o botão para desligar o Plan. Desligar apenas limpa o rascunho de Plan, sem modificar a permissão nem disparar requisição ao modelo. Seguir DESIGN.md, tema e internacionalização.
- `/plan` reutiliza a lógica de ativação do marcador; o atalho de ciclo de permissão alterna apenas entre as três permissões e o suporte a modos de outros Agents não é afetado.
- O marcador não é limpo por submissão bem-sucedida, envio pelo Guide ou fim de uma rodada. Ele só é desligado quando o usuário clica ativamente no X, ou quando a aprovação deste plano já foi processada.
- Rejeição/opiniões de modificação não alteram o rascunho: se o marcador original existir, ele é mantido; se o usuário já o tiver fechado, ele não pode ser reposto automaticamente. Snapshots comuns de Runtime não devem sobrescrever continuamente o rascunho.
- Corpo, anexos, modelo e permissão não são limpos na aprovação. Em 2026-09-15 o usuário aceitou explicitamente a simplificação: o resultado da aprovação anterior ainda desliga o marcador quando chega pela primeira vez, mesmo que o Plan tenha sido reselecionado nesse intervalo; o mesmo resultado de ferramenta é aplicado apenas uma vez.
- Quando o modelo realmente entra em Plan via EnterPlanMode, a marcação de rascunho da sessão correspondente é ativada de forma direcionada; quando o resultado chega pela primeira vez ele é aplicado diretamente, sem coletar listas de ferramentas ignoradas e sem associar uma versão da modificação do rascunho. Snapshots comuns ainda não sobrescrevem continuamente o rascunho, e rejeição/feedback não produzem conversão de marcador.
- O item Plan do menu é um estado de seleção independente; abaixo do separador, as três permissões são uma única escolha mutuamente exclusiva. Mantém-se o comportamento antigo do staging V4 de ocultar a linha da ferramenta EnterPlanMode, sem reexibir o aviso de histórico pelo fato de já existir o componente «已开启 Plan Mode».

## Submission e Runtime

```text
Seleção de permissão／Plan no menu ou clique no X
  → apenas atualiza o rascunho da caixa de entrada
  → congela mode + planEnabled na submissão
  → consumido de fato por mensagem comum／fila／Guide
  → aplica separadamente a permissão e o Plan do Runtime

Aceitar o plano → Agent processa a aprovação → Runtime Plan=false, mode inalterado
                              → limpa o marcador de rascunho correspondente
                              → continua o Turn atual
```

- A nova Submission carrega explicitamente os dois valores. `false` significa desligado e não pode ser equiparado a campo ausente; requisições antigas sem o campo são tratadas na entrada de compatibilidade.
- O Guide não é especial: se carregar true, entra/mantém o Plan; se carregar false, sai/mantém o não-Plan. Clicar no X por si só não muda a execução; o desligamento só é aplicado quando a submissão seguinte for consumida.
- Itens de fila já aceitos preservam o estado no momento da submissão e não são reescritos por rascunhos posteriores ou por resultados de aprovação. Não alteram o momento de aceitação/consumo nem a propriedade da fila, e não desfaz operações já executadas.
- Submission, EnterPlanMode e ExitPlanMode usam uma lógica de transição de Plan unificada. Tanto a primeira verificação de permissão quanto as revalidações após mudança de parâmetros a leem, evitando que o yolo libere cedo; os casos especiais existentes (MCP, arquivos de memória etc.) são preservados.
- Mudança de estado do Runtime e mudança de rascunho são duas coisas distintas. A rejeção mantém o comportamento atual de encerrar a rodada sem sair ativamente do Plan; opiniões de modificação continuam o planejamento; nenhuma das duas escreve no rascunho. Uma requisição de aprovação não entregue/não processada não pode se dizer aprovada; não se espera uma requisição posterior ao modelo ou o sucesso da tarefa inteira para limpar o marcador.
- Os lembretes de planejamento completo/resumido já existentes passam a ler `planEnabled`; na saída real o lembrete de saída existente é encadeado, cobrindo a saída pelo Guide e por ferramenta, evitando que a permissão já removida deixe o modelo ainda trabalhando com as instruções antigas de planejamento. O conteúdo dos avisos permanece inalterado.
- Ajustar em conjunto SessionModePort, o tipo de retorno das transições de estado das ferramentas, o Schema de retorno de Enter/ExitPlanMode, os handlers e os consumidores; evitar que o estado já alternado seja julgado como falha pela validação de retorno de `mode=plan`. Resultados históricos de ferramentas continuam compatíveis na exibição, sem reescrever resultados antigos.
- Requisições antigas são convertidas uma única vez na fronteira de aceitação: planEnabled explícito (incluindo false) tem precedência; apenas com mode=plan antigo, o Plan é ativado preservando a permissão base atual; apenas com mode antigo não-Plan, a permissão muda pela semântica antiga e o Plan é desligado; se ambos estiverem ausentes, o estado de execução atual é fixado. A execução da fila não pode reler o estado atual para adivinhar valores.

## Fidelidade dos campos de submissão da Queue: incluída nesta implementação

Em 2026-09-15 o usuário confirmou: corrigir a perda atual de campos da Queue como parte desta alteração, sem deixar para correções posteriores.

- Causa raiz já localizada: `onTurnSteerQueued()` em `product-projection.ts` constrói o QueueItem manualmente e omite `mode`, `modelSelection`, `sharedContextRefs` e `provenance`. O schema atual de QueueItem já reaproveita `ConversationInputIntent`, mas como os campos são opcionais a omissão não é rejeitada na validação. A promoção para execução da fila ainda reconstrói o intent a partir do QueueItem, fazendo com que fatos já submetidos, como permissão/modelo, sejam perdidos; o efeito não se limita à exibição da fila.

```text
O Composer fixa esta submissão
  → payload do Command → intent do Runtime → entrada pendente
  → QueueItem → intent no momento da promoção → aplicação pelo Runtime
       preserva os mesmos fatos de submissão de ponta a ponta, sem reler a caixa de entrada
```

- Reutilizar os fatos de entrada comuns e a entrada de adaptação de protocolo existentes, centralizando o tratamento da conversão entre intent e QueueItem; não criar outro protocolo de Submission aninhado nem enfiar o payload completo de sendText na fila. Material temporário de autenticação de `modelExecution` não entra na fila persistida.
- Transmitir por completo a seleção de modelo existente, a permissão, os anexos/referências de contexto compartilhado, a associação de origem e as informações de entrega/ordem; completar a associação de origem na conversão inversa. O novo `planEnabled` precisa atravessar tudo isso, preservando explicitamente `false` — não se pode perder a operação de desligamento por um teste de truthiness.
- Enfileiramento, edição no lugar, reordenação e promoção automática ou manual preservam os campos de submissão não modificados explicitamente por aquela operação. Editar apenas o texto do item da fila não pode limpar modelo/permissão/Plan; a ordem da fila, os momentos de aceitação/consumo, a deduplicação de comandos e a semântica dos IDs de origem não mudam.
- A correção da Queue em si não exige migração de estrutura do banco. Registros existentes sem os campos passam pelo tratamento de compatibilidade já existente, sem adivinhar a escolha histórica a partir do rascunho atual; isso é separado da avaliação do formato de salvamento do Plan deste item.
- O Guide comum valida seu caminho original de consumo de intent; quando há requisição de Guide mas o resultado cai em fila, valida-se igualmente o round-trip pela Queue. Tarefas com modelo de execução fixo continuam restringindo a troca de modelo, mas isso não pode fazer o processo pular os estados de permissão/Plan que esta alteração exige aplicar; é preciso separar claramente a fronteira de aplicação em vez de remover a proteção de modelo fixo.

## Persistência: sem migração em massa dos dados antigos

A linha de base antiga foi fixada em `staging_backup @ 790884b1ce4b990583ab40625b5f283e2169eb36`. Verificado: `prePlanMode` existe apenas em memória; o `SessionModeChanged` padrão também é um evento em memória, não um histórico SQLite confiável. `session.permission.mode` é informação escrita na criação, `local_setting` é preferência do projeto e `tasks.mode/meta_json` do App é um snapshot do índice de tarefas; não podem ser misturados como estado mais recente da sessão nem como permissão anterior.

- Não varrer, preencher novamente nem reescrever sessões antigas, e não adicionar migration para converter dados antigos; no ponto de leitura unificado se acomoda o formato antigo de forma compatível, preservando campos, valores e conteúdos desconhecidos.
- Usar o session_entry existente para salvar `runtime/execution_state`, com data `{mode, planEnabled}`; o mesmo registro guarda os dois valores, e apenas o estado já aplicado pelo Runtime. A gravação ocorre normalmente na criação e em mudanças reais de estado, sem varrer sessões antigas no startup para preenchimento. `session.permission` mantém os dados originais; completar a restauração fria e a restauração de branch, sem deixar o índice de tarefas ou as preferências do projeto sobrescreverem o registro novo da sessão.
- Modos antigos não-Plan podem ser convertidos para a mesma permissão + Plan=false; o Plan antigo vira Plan=true, usando a permissão anterior apenas quando confiável e, sem informação, usando build de forma conservadora, sem adivinhar acesso total. Preferências do projeto / índices desatualizados não podem servir incondicionalmente como a permissão original.
- O protocolo remoto novo/velho não pode descartar silenciosamente o Plan e ainda assim executar; compatibilizar requisições antigas não equivale a permitir que uma requisição nova seja ignorada por um executor antigo. Na verificação de rollback, distinguir «tarefa/sessão antiga legível» de «recuperação precisa do Plan novo pela versão antiga»: esta entrega garante o primeiro item e a recuperação da versão nova, sem reestruturar o mecanismo já incompleto de recuperação fria do Plan da versão antiga, e sem alegar que o registro novo faz o programa antigo entender o Plan independente. Se o contrato de leitura antigo exigir compatibilidade de escrita, limitar-se ao necessário para a legibilidade do conteúdo e deixar evidência.
- O conteúdo da sessão/tarefa deve continuar abrível em upgrade, rollback e novo upgrade, sem falhar por ausência de campos novos; não se exige restaurar fatos que a versão antiga não salvou. Se ao final for realmente necessária uma nova tabela/coluna, confirmar a migration de estrutura separadamente e alinhar com o responsável pelo banco, sem ampliar esta tarefa para uma migração de dados antigos.
- desta vez a fronteira de implementação é zero migration de estrutura SQL e zero reescrita em massa de histórico. `session_input.payload`, o JSON de message/part, o índice de tarefas e a configuração de inicialização de tarefas automáticas são compatíveis com o antigo mode=plan, sem que a remoção de valores do novo enum torne registros ilegíveis; novas entradas salvam normalmente os campos novos. A correção de fidelidade da Queue não varre o histórico para adivinhar.
- localStorage de rascunho e de seleção recente são compatíveis separadamente: um rascunho antigo de Plan em tarefa existente preserva a intenção de planejamento; um Plan antigo nas preferências recentes não é passado para outra tarefa nova. Tarefas novas continuam com Plan=false por padrão, com tratamento conservador quando não há permissão base confiável; isso não pode limpar junto o corpo nem o modelo.

## Escopo de impacto e invariantes

- Inicialização, salvamento, troca/atualização, pré-aquecimento e transição de lançamento de rascunhos; envio comum, enfileiramento, Guide; entrada de importação por compartilhamento e outras entradas que reutilizam o comportamento de criação.
- Tipos compartilhados e schema de runtime, admissão de comandos/fatos de entrada, sincronização de configuração e snapshot, restauração de sessão e de branch; o `snapshot.plan` existente é um passo pendente e não pode ser reutilizado como interruptor de modo.
- Verificação de exclusividade mútua do Goal; parâmetros antigos de Plan da CLI; declaração/herança de permissão do Subagent; salvamento e argumentos de inicialização de tarefas agendadas e ociosas. Preservar as fronteiras existentes de execução e de modelo fixo de cada entrada, sem refazer as políticas por conta própria.
- Semântica consistente entre desktop, workspace local/remoto e shared-host do celular; manter os limites desktop-continuous e web-remote-replayable, o isolamento por workspaceIdentity, o roteamento por remoteSessionId e a autoridade da fila do Runtime inalterados.
- Provider, estratégia de resolução de modelo, assinatura, consumo e outras implementações de Agent estão fora do escopo; a seleção de modelo apenas corrige a perda na passagem pela Queue, sem redecidir padrões nem a estratégia de modelo fixo. Novas tarefas não herdam Plan e começam desligadas por padrão; as permissões continuam seguindo as regras existentes de criação de tarefa.

## Aceitação e ordem de implementação

1. Primeiro definir o esquema de salvamento/compatibilidade em JSON e atualizar o spec formal, o mapa de funcionalidades, o case catalog de sessões e a matriz de cobertura; corrigir no mapa de funcionalidades a descrição antiga de que `/plan` primeiro troca o mode e depois envia.
2. Primeiro escrever testes: a projeção real de eventos da Queue e o round-trip da promoção para execução, afirmando que modelo, mode, planEnabled (incluindo false), anexos/contexto e origem não se perdem; cobrir edição no lugar, reordenação, promoção automática/manual e fallback de fila do Guide. Na regressão, submeter yolo em execução e, após o enfileiramento, continuar verificando a permissão de ferramenta conforme yolo, sem voltar a build por perda de campo.
3. Depois cobrir as três permissões + Plan; aprovar, rejeitar, dar feedback, clicar ativamente no X; alternância true/false do Guide e os avisos/permissões correspondentes; idempotência de mesmo valor; aplicação de Plan sem depender de mudança de modelo, incluindo tarefas com modelo de execução fixo.
4. Cobrir lançamento de tarefa nova, pré-aquecimento, transição de rascunho, congelamento na fila, aprovação atrasada cuja primeira chegada sobrescreve o marcador mas cujo resultado repetido não reaplica, formato antigo sem campos, restauração fria, restauração de branch, legibilidade em rollback e permissão não afrouxada.
5. Complementar com E2E de interação do desktop (incluindo Plan no topo, separador, três permissões e permissão valendo após o enfileiramento), toque/teclado, tema/internacionalização, e verificação de aprovação/reconexão no celular; não alterar o system prompt para os testes. A compatibilidade com dados antigos usa fixture isolado, sem tocar no banco do usuário.
6. Depois da implementação, fazer uma revisão unificada, executar typecheck, lint, checagem de arquitetura e os testes unitários/E2E relevantes, registrar os resultados reais e os ambientes não verificados, e então commitar.

A aceitação precisa cobrir simultaneamente que `yolo + Plan=false` enfileirado aplica a permissão corretamente e que `yolo + Plan=true` ainda tem restrições de planejamento e aprovação de plano; não se pode generalizar «yolo não precisa de aprovação» para o Plan.

## Registro da implementação (2026-09-15, ainda em execução, sem aceitação completa)

Entregue no workspace local:

- Parsing do estado de execução compartilhado, separação entre permissão e Plan, consumo de entrada comum/Guide, aplicação de permissão no branch de modelo fixo.
- Projeção da Queue e promoção preservando modelo, permissão, Plan (incluindo false), contexto compartilhado e origem da Submission.
- Ferramentas Enter/Exit, primeira e segunda verificação de permissão, disparo dos avisos; sem modificar o corpo dos prompts existentes.
- Menu de quatro itens no Composer, marcador independente, salvamento de rascunho, tarefa nova não herdando Plan; primeira versão da sincronização direcionada das conversões de ferramenta.
- Salvamento normal/restauração fria via session_entry, sem SQL estrutural nem preenchimento em massa; entry de branches históricos e mensagens de aviso usam o mesmo estado histórico.
- Subagent preserva a permissão base do pai ao herdar o Plan, sem alterar os branches existentes de Explore e de declaração explícita de permissão.
- Confirmação da capacidade de Plan independente do novo Host em relação à CLI real, evitando que o lado antigo remova os campos e execute com acesso total.
- Verificação de exclusividade mútua na criação/restauração de Goal na V4; testes de falha foram adicionados antes da implementação.

Verificações reais:

- 9 arquivos de Core relacionados, 324 itens passando (incluindo Guide com Runtime real, persistência, branch e execução de Subagent).
- 5 arquivos de Bootstrap relacionados, 113 itens passando (Queue e comandos nativos).
- 8 arquivos relacionados a UI/rascunho/compartilhamento/recibo de aprovação/checagem de capacidade do servidor, 55 itens passando; há também testes compartilhados de parsing e transporte passando, com contagem sobreposta, e portanto não somados como cobertura total.
- typecheck da raiz e verificações de tipo de CLI contracts/core/bootstrap passando; lint da raiz com 0 error e 42 warning.
- O lint da raiz exclui a CLI por padrão; foi executado oxlint com uma configuração sem ignoras nos arquivos de CLI deste item, com 0 error, o que não pode ser tomado como lint completo da CLI coberto.
- `architecture:check --changed` com 0 violation; `git diff --check` passando.
- Foram executadas suítes de Core/Bootstrap mais amplas, com outras falhas ainda não comparadas em sua totalidade com o HEAD; não se pode declarar que todas são problema de baseline nem que a regressão completa passou.
- O E2E de desktop foi adicionado e tentou rodar, mas o Electron saiu ao estabelecer a sessão no ChromeDriver, e o corpo dos testes não chegou a executar; não conta como aprovado. Celular, toque e reconexão também não foram testados na prática.

O que ainda falta antes da aceitação completa (a 요구 posterior do usuário de primeiro fazer push e abrir MR não representa aceitação completa):

1. A sincronização direcionada de rascunho foi simplificada conforme o veredito mais recente (ver registro abaixo); a restauração de notificações de ferramenta não recebidas após reinício do processo ainda precisa ser verificada separadamente, sem forçar sobrescrita de um rascunho existente por um estado comum de Runtime.
2. Revisar a consistência entre a entrada antiga de controle de Goal e a exclusividade mútua da V4, além das fronteiras de permissão na leitura por lados novo/velho e em rollback.
3. Completar a aceitação de interação de aprovação/rejeição/feedback/X manual, permissão real via Guide da Queue, reconexão do celular etc.; atualmente apenas o E2E de menu foi adicionado e ele não representa a cobertura de toda a cadeia.
4. O E2E precisa ser executado no MacBook Pro; a falha anterior de inicialização do Electron veio do workspace Linux, não do Pro. A execução foi transferida para uma cópia isolada no Pro, e o registro abaixo cobre esse escopo; as demais aceitações de interação e a atribuição total das falhas seguem pendentes.

Em 2026-09-15 o usuário pediu para primeiro fazer push e abrir o MR: entregar conforme o rascunho de revisão, mantendo este item com estado de aceitação incompleta. Preservar as outras alterações que o usuário já tinha antes do início e não marcar esta implementação como entrega completa.

### Simplificação da sincronização de rascunho e verificação no Pro (2026-09-15)

- Conforme confirmado pelo usuário, foram removidos `ignoredPlanToolCallIds`, a coleta de IDs de ferramenta na janela de mensagens e os parâmetros de hook relacionados.
- A nova conversão de ferramenta atribui `planEnabled` diretamente; `lastPlanTransitionId` foi mantido, de modo que o mesmo resultado em um snapshot repetido não é reaplicado.
- Verificado que a primeira chegada ao entrar/sair sobrescreve a seleção manual, que reativar após a aprovação não é limpo novamente pelo mesmo replay e que a ausência de conversão não altera o rascunho; 4 arquivos, 23 itens passando.
- typecheck, lint (0 error, 42 warning), checagem de tipos do E2E, verificação de fixture de aprovação e checagem de arquitetura passando.
- O E2E foi transferido para uma cópia isolada em um MacBook Pro dedicado (Darwin), em `/Users/dev/Desktop/projects/Z.AI/todo151-pro.hGJ5yI/repo`; não são usados o workspace original do Pro nem dados reais do usuário.
- O caso de aprovação real ganhou asserções de mudança do marcador de Plan antes/depois da aprovação e de yolo inalterado. No Pro foram concluídos a instalação de dependências, o build da CLI e do Electron, e a execução real do corpo dos testes.
- Na investigação de reexecução foram corrigidas sincronizações de teste: a atualização do marcador de Plan ocorre antes de a animação de fechamento do DropdownMenu terminar, então o teste precisa esperar a desmontagem do menu antigo antes de reabrir; a requisição assíncrona do título da sessão semente é enviada, e a contagem de requisições de `/plan` vazio precisa esperar antes essa requisição de título. Nada disso altera a lógica do produto ou os prompts.
- A execução final no Pro foi `desktop-e2e-20260915070056792-p63678-7820fb061f2b3987`: 3 specs, 6 itens, todos passando (1 de marcador independente/permissão/X, 1 de entrada por ferramenta e sincronização da aprovação, 4 de `/plan`), usando Electron e CLI reais e replay de fixture de modelo, o que não representa verificação de requisições reais de provedores.
- Antes do push, os testes unitários afetados completaram as asserções antigas: a leitura compatível do rascunho deve ser dividida em mode básico e planEnabled, a submissão comum deve carregar false explicitamente e a submissão de `/plan` deve carregar true; os testes de menu passaram a verificar o radio de permissão do Dropdown, a marcação independente de Plan e a restauração de foco, sem mockar o componente antigo removido. Sem alterar código de produto nem fixtures de formato antigo.
- Os artefatos ficam na cópia do Pro em `packages/desktop/.e2e-artifacts/desktop-e2e-20260915070056792-p63678-7820fb061f2b3987/`. Foi confirmada apenas esta simplificação e esses 6 itens de interação; o Todo151 como um todo continua sem aceitação completa; reconexão de celular e o Queue/Guide completo seguem pendentes, e o push do MR não representa que esses itens passaram.