# Reestruturação dos materiais de entrada de tópico no Feishu/Lark

O contrato atual de integração, parada/continuação e migração está em [Colaboração de tópico](bots-feishu-group-collaboration.md#topic-collaboration-implementation-contract): na primeira integração prepara-se a referência raiz e os anexos de histórico; após integrado não é preciso @, e a referência raiz não se repete; uma nova mensagem dá stop na rodada antiga e continua. O formato de materiais de entrada descrito abaixo continua válido, e os registros de validação antigos não representam a aprovação desta reestruturação.

## Validação manual da reestruturação de parar/continuar

O usuário inicia este checkout por conta própria; durante a implementação não se inicia o dev. Entre no grupo de testes do Feishu, ative o grupo e valide seguindo os passos:

1. No tópico da mensagem raiz do usuário, envie primeiro duas discussões e só então o primeiro @. Na lista de tarefas do ZCode abra a tarefa independente correspondente e verifique a primeira referência raiz, o anexo de histórico do tópico que pode ser aberto e o anexo atual.
2. Envie diretamente nesse tópico uma mensagem comum, sem @. Deve continuar a mesma tarefa, mostrando o remetente real e o corpo desta mensagem, sem repetir a referência raiz nem a primeira história.
3. Durante a execução, envie duas complementações em sequência. A próxima rodada só começa depois que a execução antiga terminar; o App exibe as duas mensagens separadamente, e os anexos pertencem às mensagens originais; o batching não exibe o corpo interno de execução concatenado. O input em lote não oferece entrada de edição por mensagem, evitando sobrescrever as outras mensagens do mesmo lote.
4. Verifique o indicador de execução de cada uma das duas mensagens; um input interrompido não deve ser marcado como sucesso por eventos de conclusão posteriores. O tópico não deve mostrar cartões de "aguardando execução / cancelar fila", e cards de fila legados devem expirar.
5. Responder a uma mensagem principal do bot forma um novo tópico e deve criar uma tarefa independente. Abra um segundo tópico e confirme que as duas tarefas e a tarefa padrão do grupo não misturam contexto.
6. Depois de `/stop` é possível continuar com a entrada comum; depois de `/leave` a entrada comum não é executada, e um novo @ retoma a tarefa do tópico original. Fechar o histórico ou revogar permissões não pode resultar em execução incompleta.
7. No controle remoto do celular, abra a mesma tarefa e verifique mensagem por mensagem, a pré-visualização dos materiais e o resultado da restauração; verifique também nos temas claro e escuro. A aceitação real de Feishu, Lark, celular e entre sistemas operacionais é registrada separadamente, e itens não operados permanecem como pendentes de verificação.

Os resultados automatizados e o status de commit seguem o registro de aceitação deste ciclo no documento de colaboração de tópicos; as contagens antigas abaixo são apenas registro histórico.

O guia de permissões do `/enable` também lista `im:chat.members:read` (ver membros do grupo), observando que ela é usada para exibir o nome de usuário do remetente e é uma permissão opcional; sem ela as tarefas ainda podem ser executadas. A permissão de leitura do histórico do tópico continua obrigatória, e não se pode usar um texto genérico do tipo "sem nenhuma permissão não é possível executar". O guia é consistente em chinês e inglês.

A resposta de sucesso do `/enable` (primeira ativação, reativação ou execução repetida) precisa conter o guia de permissões de administrador: abrir o painel administrativo da plataforma aberta correspondente do Feishu/Lark, selecionar a aplicação do bot, ativar na gestão de permissões a permissão de leitura de mensagens da identidade da aplicação (incluindo im:message.group_msg) e, depois de publicar e surtir efeito, fazer @ no tópico. Acompanhar com o link do painel administrativo da plataforma correspondente, deixando claro que ativar o grupo não significa que a permissão da aplicação já exista; as permissões da plataforma não são modificadas automaticamente e não se exige lark-cli. A resposta é consistente em chinês e inglês, e o `/disable` não anexa o guia de ativação. O cenário real é validado manualmente pelo usuário, sem iniciar o dev.

## Padrão de histórico e pré-condições de execução (regra mais recente)

Grupos sem `historyEnabled` configurado têm a leitura habilitada por padrão, e um `false` explícito é mantido. A leitura do histórico do tópico é uma pré-condição de execução: falta de permissão, ausência da interface de leitura ou falha de leitura não criam tarefa, não enviam input, não avançam checkpoint e não degradam para apenas uma referência. Quando desativado explicitamente, exibe-se o aviso com `/history on` e a execução de tópico fica pausada; o chat do dono do grupo, o chat privado e os comandos de controle mantêm o comportamento original. Esta regra substitui os registros antigos de degradação por lacuna de histórico e de desativação por padrão descritos abaixo.

```text
首次接入/缺口恢复 → 历史开关 → 原生 thread 历史读取（根消息首发也检查）
                     ├ 成功 → 材料准备 → CLI 接收 → 检查点
                     ├ 缺权限 → 管理员开通指引，无执行
                     └ 临时失败 → 重试提示，无执行
```

Erros de permissão permanecem como erros tipados, e uma falha de rede comum não pode ser descrita como falta de permissão. O administrador verifica a permissão de mensagens da identidade da aplicação na gestão de permissões do app Feishu/Lark correspondente, especialmente `im:message.group_msg`, e depois de publicar e surtir efeito faz um novo @; não se exige lark-cli nem execução automática complementar. O link do guia usa o painel administrativo oficial da plataforma correspondente. Referência da interface oficial de histórico: https://open.feishu.cn/document/server-docs/im-v1/message/list 。Após uma leitura explícita bem-sucedida, lacunas de histórico limitadas continuam marcadas por anexo, sem alegar completude.

Validação: 178 testes unitários relacionados, typecheck da raiz, lint, verify:pre-push e a verificação de formatação passaram. O dev não foi iniciado; o Feishu/Lark real, o celular e outros OS aguardam validação manual do usuário. Faça @ diretamente no tópico em um grupo sem desligamento explícito do histórico; a falta de permissão deve produzir apenas o guia de liberação e nenhuma tarefa nova, e só após a permissão entrar em vigor um novo @ executa. O chat principal e o chat privado continuam normais.

## Isolamento de tarefas por tópico e migração

Todos os tópicos são vinculados a tarefas independentes, incluindo o cenário em que o usuário responde a uma mensagem do bot no chat principal por meio do tópico.
A tarefa só é criada quando os materiais estiverem prontos no primeiro disparo; tópicos já integrados continuam recebendo mensagens reais sem precisar de novo @.
Os antigos `topicAliases` são migrados de uma só vez para vínculos independentes dentro da fronteira de segurança, preservando os registros das tarefas antigas e sem copiar o contexto inteiro.
Após a migração o caminho de execução por alias não é mais usado. Tarefas independentes existentes mantêm o vínculo original.

O título das novas tarefas é「飞书/Lark · 群名 · 话题标题」; a renomeação pelo usuário não altera o vínculo.
Tarefas antigas não são renomeadas automaticamente, nenhuma notificação extra de criação de tarefa é enviada e nenhum worktree é criado automaticamente.

Esta especificação substitui a referência por concatenação de corpo, o resumo automático e o modo de injeção por `bot_topic_context` do esquema anterior.
Os limites de autorização de grupo/tópico, vínculo de tarefa, fila única, restauração cross-device e reenvio de resultado são preservados.

## Entrada e sequência

| Material               | Mecanismo existente                     |
| ---------------------- | -------------------------------------- |
| Corpo da mensagem      | Entrada comum                          |
| Texto citado explicitamente | Citação padrão de conversa, incluindo o original real |
| Imagem/arquivo citado explicitamente | Anexo comum, preparado por completo antes do envio |
| Histórico do tópico    | Gera um anexo de texto visualizável usando o mecanismo de colagem de texto longo |

```text
可信入站 → 授权、话题及接入状态校验 → 正文＋引用＋附件准备
         → 目标运行时附件寄存 → CLI CommandInbox 单次接收
         → 确认后保存关联、推进增量检查点
```

As citações reutilizam a codificação e o parsing existentes, e a UI restaura a entrada de citação; não se exibe `[Quoted message]`, JSON bruto nem ID nu.
Citação não é comando nem aprovação. Ao exceder a capacidade de citação existente, a submissão é rejeitada por inteiro, sem truncamento silencioso.

## Formato e leitura do histórico

Na primeira coleta são reunidas a mensagem raiz e as discussões anteriores ao @; depois disso apenas o incremento posterior à última recepção confirmada é tomado, e as mensagens após o @ atual ficam para a próxima vez. A deduplicação é por ID de mensagem, excluindo o corpo atual, as citações explícitas, os inputs já enviados, os resultados do bot e os cards de status.
O limite de leitura automática permanece em 200 mensagens relevantes mais a primeira mensagem raiz, com registro das lacunas e sem promessa de histórico completo.
Quando a API de histórico falha na leitura, gera-se apenas um anexo explicativo de lacuna; mesmo que esse input seja aceito, ele não pode avançar o checkpoint de leitura de histórico. O próximo @ continua complementando a partir da última leitura bem-sucedida e já confirmada.

Formato `.txt` UTF-8 versão 1: nome do tópico, quantidade de mensagens, intervalo de cobertura com horário e fuso, nota de completude; as mensagens M1, M2 são listadas por horário, cada uma com nome do remetente (quando disponível), open_id, horário, relação de resposta e o texto original com suas quebras de linha.
Imagens/arquivos do histórico listam nome, tipo, referências de recurso A1, A2 e o estado ainda não lido, sem embutir binários.
A interface exibe「话题历史 · N 条消息」. Sem incremento e sem lacunas não se gera anexo duplicado.

Usa-se uma marca de origem separada topic-history, reutilizando o ciclo de vida de anexos de colagem, sem o limite de caracteres de colagem longa.
O modelo recebe primeiro a referência do arquivo e o conteúdo só entra no contexto após a leitura real; não há injeção automática de texto integral nem chamada prévia a um resumo do modelo.
A leitura segmentada de arquivos longos e a compactação posterior reutilizam capacidades existentes. O texto integral não pode existir simultaneamente no corpo e em mensagens ocultas do modelo.

## Anexos de histórico

Os índices M1/A1 de cada arquivo de histórico são resolvidos em conjunto com a identidade desse arquivo, e o servidor mapeia o grupo, tópico, mensagem, recurso e versão de autorização reais, sem mistura entre rodadas. Nome, ID e corpo do arquivo não podem servir como fonte de autorização.
Anexos citados explicitamente são baixados nesta rodada e enviados como anexos V4, sem juntar explicações de caminho do Host. Vale o limite de no máximo 4 anexos por mensagem e 5MB por arquivo; em caso de excesso, estouro de limite ou recurso indisponível toda a mensagem é rejeitada, e não se pode pegar os primeiros e continuar. Os demais anexos de histórico são lidos sob demanda pelas capacidades internas, com nova verificação do escopo de acesso a cada leitura.
Não se depende de lark-cli e não se carrega automaticamente lark-im nem se exige outro escaneamento de QR code para ler os materiais da sessão atual do bot.

## Fila, exibição e compatibilidade

Os inputs de grupo são ordenados de cima para baixo como "remetente → citação de conversa → imagem/arquivo e anexos de histórico → corpo do usuário", com alinhamento geral à direita, reutilizando o espaçamento de 8px existente e os componentes de citação/anexo. Desktop e celular compartilham esta ordem; a ordem de materiais da entrada comum do desktop permanece compatível.
Quando há apenas @, sem corpo mas com citação ou com os materiais de histórico atuais, os próprios materiais são enviados, sem escrever instruções como "请回答引用消息……" para fingir um corpo do usuário, e a UI não deixa um balão vazio. Com apenas @ e nenhum material enviável, continua-se pedindo que o usuário complete a necessidade. O corpo de mensagens antigas não é alterado por adivinhação por string nem por remoção.

Falha em material obrigatório rejeita a mensagem inteira; lacunas opcionais de histórico são registradas no anexo, sem mensagem extra de aviso de carregamento de histórico nem de conteúdo.
A geração e a injeção de `bot_topic_context` são interrompidas; registros antigos continuam sendo lidos para compatibilidade, mas não são reinjetados e não se apaga o histórico do usuário.
O servidor mantém o arquivo do texto original, os checkpoints e o índice de recursos para deduplicação e autorização; eles não são contexto oculto do modelo.
A origem CLI transporta apenas o checkpoint de topicHistory, o status de cobertura, a quantidade de mensagens e o ID/quantidade de recursos de cada mensagem de recurso; o texto original completo de `topicContext` não é mais transmitido, evitando um command frame de grande volume fora dos anexos. A origem antiga `topicContext` continua sendo lida para compatibilidade.
A pré-visualização de texto segue a leitura por blocos de anexo: são permitidos apenas anexos text/plain marcados na linha de conversa autoritativa atual como histórico de tópico ou texto colado, continua-se validando a identidade da linha, o índice do anexo e a citação, e não se pode usar qualquer caminho como fonte de pré-visualização.
Os metadados de origem percorrem upload, comando, fila, edição, execução, conversa e restauração; anexos ainda referenciados por inputs pendentes não podem ser limpos antecipadamente. Na confirmação perdida, consulta-se o commandId original e não se adiciona reenvio de comando; registros de recepção não confirmados existentes não são reenviados nem usados para buscar histórico, e novas discussões do período não podem ser escritas no input original.
O Desktop permanece desktop-continuous; o celular permanece web-remote-replayable. O remoto transporta `workspaceIdentity` e `remoteSessionId`, usa os recursos acessíveis ao alvo e não cria um segundo Host/runtime nem uma segunda fila de aceitação.

## Ordem de aceitação

Escreva primeiro os testes de falha e depois implemente: ida e volta de citações e sua capacidade, arquivo de texto com nome/ID/texto original/horário e lacunas de cobertura, isolamento dos índices de anexo, marca de origem através de upload e restauração de fila, ausência de injeção oculta, revogação de permissão e confirmação perdida. Em Desktop/celular verifique citações, pré-visualização de anexos, fila e restauração de histórico. Execute verificação de tipos, Lint, testes unitários relacionados e E2E e então valide com Feishu real em linguagem natural a leitura de materiais e o resultado no tópico original; não se pode passar um substitute de serviço indisponível por aceitação real. Lark/remoto/outros OS não verificados são registrados explicitamente.

## Aceitação dos ajustes de exibição deste ciclo

O corpo do resultado no grupo envia apenas o resultado, sem prefixar Desktop, Mobile Web, nome ou open_id; os metadados de origem são mantidos para correlação interna. Esta ordenação e o ajuste dos rótulos de origem usam aceitação manual em cenário real, sem adicionar nem ampliar E2E. Verifique a ordem de remetente, citação, anexo e corpo e a ausência de balão vazio quando houver apenas citação; depois envie um requisito pelo Desktop e confirme que a resposta no Feishu não tem prefixo de origem.

## Aceitação manual real

Primeiro confirme que o bot de testes está com a conexão mantida pelo `pnpm dev:desktop` deste branch; quando outro workspace Dev ocupa, os resultados da versão antiga não podem ser contados como aprovação deste ciclo. A janela do Feishu é operada pelo usuário.

1. No grupo de testes já ativado, o usuário vinculado envia `@机器人 /history on`. Em um novo tópico, envie primeiro duas discussões sem @ e confirme que nenhuma tarefa é executada.
2. Responda a um dos textos e @ o robô, pedindo que a resposta considere a outra discussão. O corpo exibe apenas a necessidade atual, a entrada de citação abre o texto original real e o arquivo de histórico contém apenas o contexto que não foi citado nesta rodada.
3. Envie outra discussão comum e então @ o robô. O novo anexo de histórico contém apenas o incremento; ao abri-lo vê-se nome, open_id, quebras de linha do original e a nota de cobertura. Sem incremento nenhum anexo duplicado é gerado.
4. Envie um txt local de teste, responda a esse arquivo e @ o robô pedindo a leitura do código de verificação. O ZCode precisa exibir um anexo de arquivo comum, sem explicação de caminho de cache local no corpo e legível sem autorização do lark-cli.
5. Envie normalmente outra imagem ou arquivo e depois envie um @ pedindo a análise daquele anexo de histórico. O txt de histórico lista os índices de recursos, e o `ReadSessionContext` interno lê sob demanda; não se pode ler de outro tópico nem exigir escaneamento de QR code.
6. No Desktop, edite o item da fila ou envie imediatamente e confirme que a citação e os anexos continuam lá. O controle remoto do celular deve se conectar ao mesmo Host, com pré-visualização e restauração verificadas separadamente; janela estreita não substitui a cadeia real do celular.

Arquivo de teste local desta rodada: `/tmp/zcode-topic-materials-20260908.txt`, com um código de verificação independente e texto de múltiplas linhas. Esse caminho serve apenas para a aceitação de desenvolvimento e não é dependência de execução do produto.
Os recursos de histórico usam outro arquivo `/tmp/zcode-topic-history-resource-20260908.txt`, com um código de verificação diferente, evitando confundir a leitura do anexo citado anteriormente com sucesso na leitura do recurso de histórico.

## Registro de validação desta rodada (2026-09-08)

- A integração controlada de Desktop `feishu-topic-runtime.test.ts` passou: referência e enfileiramento de arquivos do Host/CLI reais, cancelamento, saída de materiais de histórico e pré-visualização do texto original em janelas de 1280/430. Registro de execução: `desktop-e2e-20260908115301804-p96021-286ab284a6e12787`.Os materiais vêm de entradas de teste fixas e não representam a aceitação da API nativa de histórico do Feishu.
- A execução real expôs e corrigiu três problemas: arquivos de grupo ainda juntando o caminho antigo, o schema da linha de conversa descartando a origem do anexo e a pré-visualização em três camadas aceitando apenas tipos de mídia; para cada um há teste de falha e checagem de protocolo/runtime após a correção.
- O `pnpm typecheck` mais recente, o Lint da raiz e o Lint dos arquivos de Agent alterados passaram (o Lint ainda tem avisos preexistentes); 64 testes de serviço de grupo e materiais de histórico, 30 de runtime de leitura de anexos e 11 de protocolo de resposta de pré-visualização passaram. A falha da API de histórico não avançar o checkpoint já tem asserção de regressão.
- `pnpm verify:pre-push` e a verificação de formatação dos arquivos em staging desta rodada passaram. O usuário não pôde fazer o teste manual temporariamente e a aceitação nativa do Feishu permanece pendente de verificação.
- A execução estendida do antigo `session-persistence.test.ts` não passou: o dublê de modelo existente não tinha `setModelIoFullRetentionEnabled` e há uma exceção não tratada na detecção de startup do MCP. As tentativas de completar o dublê passaram por timeout, então a correção de testes não relacionados não foi incluída nesta mudança; a leitura de artifact real desta rodada usa o `text-attachment-preview.test.ts` independente, com o startup do MCP desativado por não ser relacionado à leitura de anexos.
- A entrada manual nativa do Feishu, o controle remoto real do celular, o Lark e Windows/Linux ainda não foram aceitos, e não podem ser substituídos por janela estreita ou resultados de materiais controlados.

### Correção do texto original em citações de card

Ao citar uma mensagem de Card 2.0 do bot, é preciso passar `card_msg_content_type=user_card_content` ao obter a mensagem especificada e então extrair o corpo visível. O conteúdo de placeholder de upgrade do cliente retornado por padrão não pode ser tratado como texto original. A causa raiz foi confirmada por meio de duas requisições para a mesma mensagem real. No histórico, cartões mantêm apenas a marca de tipo e esta modificação não amplia o escopo de conteúdo de card no histórico; a validação de identidade de aprovação de card e a leitura de recursos de anexo mantêm a semântica original. Aceitação manual: responda a um card do bot e faça @, abra a citação da conversa no ZCode e o corpo real do card deve ser exibido.

Registro de validação: antes da correção, o caso de Provider retornava o texto de placeholder de upgrade e falhava; depois da correção, 82 testes unitários de Provider passaram. Com o `prepareCallbackPayload` corrigido foi executada uma leitura somente da mensagem original real,extraiu-se o corpo com horário de 2026-09-09 10:32:44, e nenhuma tarefa foi enviada nem mensagem enviada. A verificação de tipos e o Lint passaram. A aceitação de interface ponta a ponta após a nova citação pelo usuário ainda precisa ser confirmada; desta vez o E2E não foi executado.

## Citações estruturadas de conversa

Novos inputs usam o array opcional `conversationQuotes`, em paralelo ao corpo e aos anexos; cada entrada contém `text`, `path` opcional, `senderName`, `senderId`, `messageId` e `sentAt`. Os metadados de remetentes externos são injetados apenas pela camada de integração a partir do resultado de leitura da mensagem e não servem como base de autorização. Quando o nome não está disponível, exibe-se um ID estável abreviado; para o robô, prefere-se exibir o nome do robô. A citação expandida exibe remetente e horário, e a recolhida continua mostrando a quantidade de citações.

Os campos passam por command → CLI CommandInbox intent → transcript → projeção de row/queue sem alterações; edição, promoção, restauração e retry não podem perdê-los. Uma citação pura também é uma entrada válida. Na fronteira do Agent, o input do modelo é convertido uniformemente em um bloco de material `conversation_quote`, deixando explícito que é contexto citado e não um comando de controle; o corpo do usuário e o corpo visível persistente não recebem etiquetas. Os antigos blocos de texto `userselect` e de Conversation selections continuam sendo interpretados, sem migrar nem reescrever registros antigos. Desktop continuous e celular replayable mantêm seus limites, e a identidade do workspace e o roteamento por owner permanecem inalterados.

A aceitação manual inclui: nome, horário e texto original corretos ao citar texto humano e card de robô; seleção de texto no desktop no primeiro envio e em inputs posteriores; citação pura, edição na fila/envio imediato e restauração de histórico; o modelo recebe o texto original e a origem sem novos `userselect`; temas claro e escuro e tela estreita. Quando o celular/Lark real não for verificado, o status é mantido explicitamente.

## Registro histórico: preparação de histórico e correção de reenvio em 2026-09-09

Os comportamentos abaixo de desativação padrão, degradação quando desativado e @ a cada rodada foram substituídos pelas regras mais recentes acima e não servem como passos desta aceitação manual.

Os testes de estado de runtime confirmaram que o grupo de teste não tem `historyEnabled` definido, portanto, embora o tópico independente seja vinculado com sucesso, o histórico não é lido. Mantém-se o padrão desativado; inputs de tópico com corpo ou citação carregam, quando desativado, um anexo de nota de histórico com zero mensagens, indicando que não foi lido e que pode ser habilitado pelo usuário vinculado via `/history on`, sem acessar a API de histórico nem avançar checkpoints. Um @ puro e sem necessidade válida continua perguntando a necessidade.

O textContent do histórico é salvo como artifact pelo begin/chunk/commit do CLI de destino já existente, e o sendText só é criado depois de concluído; nenhum cache local de histórico é inventado. Se o upload falhar, a mensagem inteira não é enviada, e o alvo remoto preserva `workspaceIdentity`/`remoteSessionId`.

Na fronteira do modelo, um `botGroupSource` confiável ganha a explicação de que respostas comuns são entregues automaticamente pelo serviço e de que o ID da mensagem original não deve ser tratado como uma tarefa de envio; só quando o usuário pede explicitamente um envio adicional é que a habilidade de comunicação é usada. A identidade da citação apenas marca a origem e, quando faltarem condições necessárias como o local, é preciso perguntar, sem adivinhar pelo diretório de contatos, IP ou fuso da máquina. Essa explicação não contém o texto original do histórico, não restaura `bot_topic_context`; citações e histórico continuam usando os canais de material já existentes.

Nesta rodada o dev não é iniciado e o E2E de UI não é executado; a validação automatizada cobre a barreira de conclusão do upload, a falha bloqueando o envio, a explicação explícita de histórico desativado e a separação entre referência e envio, e o Feishu real e o celular são validados manualmente pelo usuário.

Caminho de validação manual: iniciar manualmente o checkout atual → no grupo de testes do Feishu o usuário vinculado envia `@机器人 /history on` → no mesmo tópico envia primeiro uma discussão comum como uma cidade e então cita a pergunta e faz @ → na tarefa correspondente do ZCode abrir o anexo「话题历史」 e confirmar o texto original, o nome e o horário → confirmar que a resposta volta ao tópico original pelo serviço do bot. Depois disso, fazer um novo @ e verificar que contém apenas o incremento; desativar o histórico e então enviar uma requisição com corpo, e o anexo deve mostrar claramente que não foi lido. Não use uma citação comum do chat principal no lugar da validação de tópico.

O armazenamento físico dos anexos continua usando o session artifact do CLI de destino: após a validação completa, `writePromptAttachment` grava o artifact da sessão e retorna a referência `zcode-artifact://`; não é um `topic-history.txt` isolado na raiz do workspace. O ZCode usa a pré-visualização de anexos já existente para ler o conteúdo real.

Resultados automatizados: typecheck da raiz, lint (43 warnings preexistentes, 0 erros) e verify:pre-push passaram; a verificação de tipos dos contracts/core/bootstrap do Agent passou; 188 testes relacionados da raiz, 188 testes de projeção/restauração fria, 59 testes de fila/edição/retry, 5 testes de core de citação/persistência e 2 testes de isolamento de exibição de material do modelo passaram. O novo helper passou no lint independente; o lint independente de todos os pacotes do Agent ainda tem a limitação preexistente de arquivo acima de max-lines, e portanto não se afirma que essa verificação passou. O dev não foi iniciado e não houve aceitação manual real de Feishu, Lark, celular ou outros OS nesta rodada.