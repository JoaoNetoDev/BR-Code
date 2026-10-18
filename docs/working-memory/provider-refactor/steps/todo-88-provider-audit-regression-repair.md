# Todo 88: Correção unificada dos problemas de revisão da refatoração de Provider

> Atualização de atribuição da verificação (2026-09-09): os itens restantes de teste insuficiente/falha/promoção manual deste documento são transferidos uniformemente para [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente neste documento; as evidências históricas são mantidas, e a transferência não significa que os testes passaram. Os antigos itens de adiamento para Subagent explícito foram substituídos pela implementação do Todo99; a exceção do Off-Peak Ticket e a fronteira de não adicionar sincronização pré-envio permanecem inalteradas.

> Status: o escopo aprovado desta rodada está concluído, e a reverificação somente por commit de 2026-09-08 e o aceite das correções complementares foram concluídos. O AS02 (seleção nova de Subagent corrompida) foi posteriormente aceito pelo usuário como tratado por herança, não mais adiado nem listado como obrigatório; trata-se de aceitação do estado atual, não conta como aprovação de correção. Achados adicionais e verificações não executadas estão no fechamento e na tabela de auditoria no final.
>
> Data: 2026-09-07
>
> Baseline da revisão: `ceb9625ebeb63b2dada528c8a3d1d4bdda77a10f`, `provider-refactor-e2e-recovery`.
>
> Autorização do usuário: consolidar os problemas conhecidos desta rodada, corrigi-los de forma abrangente e registrar implementação, verificação e resultados da re-revisão.
>
> Decisão posterior de 2026-09-08: em R01–R04, a importação e recuperação da identidade de Selection dependentes da conta Host, e o esvaziamento antecipado, foram substituídas pela continuação em [Todo96](todo-96-selection-offline-migration-and-resolution-consolidation.md); a migração de conexão real/OAuth do R05 não é alterada. O Subagent Markdown foi revertido pelo Todo97 para os campos originais legíveis pelo usuário, com migração no local apenas do diretório do usuário, sem compatibilidade com o formato intermediário não publicado. O texto abaixo preserva as evidências da implementação antiga, não servindo como declaração de conclusão dessas novas decisões.

## Princípios e escopo

- Este Todo assume as lacunas encontradas nesta rodada de revisão e não usa o status "concluído" de Todos antigos como evidência; as demais decisões válidas dos Todo 68–72, 74, 76, 79, 81–85 e 87 são mantidas.
- Dados antigos devem ser migrados tanto quanto possível; campos antigos servem apenas para caminhos de rollback realmente suportados e não podem sobrescrever inversamente a nova seleção. Arquivos antigos/campos originais não são quebrados por leitura somente; o código de compatibilidade deve ter um motivo em chinês e uma condição de limpeza.
- Quando o novo formato já existe, apenas os novos campos são reconhecidos. Seleções ausentes ou inválidas podem ficar vazias, sem derrubar Session ou lista; apenas estruturas antigas inequivocas entram na migação unidirecional.
- Ao escolher ativamente um novo modelo, assume-se o nível de Reasoning mais alto do modelo alvo; ao restaurar uma seleção existente, não se completa o nível mais alto. Troca de conta preserva a resolução válida do mesmo modelo e mesma faixa conforme o Todo 87, sem reescrever a intenção original ou requisições históricas na leitura.
- Não se restaura a sincronização remota obrigatória antes do envio; não se religa entre contas tarefas off-peak que já detêm Ticket; o mapeamento automático de conta em segundo plano para Subagent explícito continua adiado conforme o escopo já decidido.
- Formatos antigos não publicados como o Personal `matchRules` não recebem novo trabalho de compatibilidade. Rejeições remotas de `unusual activity` não são mascaradas como bug de configuração local nem contornam o controle de risco.
- Não se restaura o arquivo inteiro de staging; não se mescla o staging posterior; mantém-se a separação atual Provider/Account/Selection e as fronteiras de desktop, celular e remoto.
- Não se modifica dados reais de colegas para fabricar testes aprovados; backups só são usados em diretórios isolados, e fixtures anonimizados não contêm credenciais de conta, API Key ou conteúdo de sessões pessoais.

## Problemas e condições de conclusão

### R01: Sessões históricas ainda podem não abrir quando o modelo não está vinculado (Todo 70)

- [x] Corrigir o App que permite ausência de Model, enquanto conversões de protocolo Session/settings/read/fork ainda analisam string vazia.
- [x] Unificar a representação do estado não vinculado; não falsificar modelo nem criar Model de reserva. Mensagens históricas, títulos e modos são legíveis normalmente e o uso continua após nova seleção.
- [x] Verificar recuperação a frio, leitura de informações da sessão, lista histórica e fork; desktop continuous e celular replayable usam suas próprias cadeias.
- Evidência: `modelSelectionFromString(app.getModel())` em `session-mapper.ts`; log real `Invalid provider-qualified model selection: `.

### R02: Decodificação errada do campo de modelo antigo em tarefas agendadas (Todo 72)

- [x] Distinguir o campo backend antigo do ID real de Provider; decodificar modelos provider-qualified e valores antigos `custom:`, e então aplicar as regras existentes de conversão de identidade.
- [x] Converter ao máximo o formato antigo real; quando não for possível determinar, manter o registro original e bloquear a execução, sem casar outro provedor pelo nome do modelo.
- [x] Validar leitura, gravação normal e nova leitura com linhas antigas do banco; não testar apenas a Selection nova.
- Evidência: `automationRepo.ts` tratava diretamente o `provider` antigo e o `model` inteiro como identidade nova; a lógica antiga vem de `9f3a113f92f`, e o fechamento do Todo 72 não conectou isso.
- Complemento da segunda revisão: a primeira dispatch em segundo plano também deve passar pela importação da seleção antiga do Host e então reler a seleção nova. Um modelo antigo explícito não importado ou um valor novo corrompido não pode ser executado como se fosse "seguir o Workspace"; o comportamento original de seguir quando a nova versão não especifica modelo é mantido. Uma seleção já fixada no mesmo run não é remigrada/resolvedora novamente. Falha na consulta de contas da importação afeta apenas o item relacionado e não pode fazer falhar a leitura de toda a lista de tarefas.

### R03: Configuração antiga de Subagent interno não foi migrada (Todo 72)

- [x] Importar os antigos `builtInModelOverrides` / `builtInThoughtLevelOverrides` para a nova seleção; manter a prioridade das sobrescritas novas.
- [x] Reconhecer os dois armazenamentos: Markdown personalizado e state interno; quando o modelo não é especificado, ainda herda da tarefa pai, sempromover secretamente upgrade para modelo explícito.
- [x] Verificar state antigo, state novo existente, leitura/gravação repetida e que itens não conversíveis não quebram os demais.

### R04: Campo antigo sobrescreve inversamente a nova Selection (Todo 70/72)

- [x] Corrigir o novo Reasoning de Subagent sendo sobrescrito pelo thoughtLevel antigo.
- [x] Corrigir Automation e Wiki relendo a seleção antiga quando os novos campos ficam corrompidos; distinguir "novo valor explicitamente vazio" de "registro antigo genuinamente sem campo novo".
- [x] Verificar marcadores de migração/versão de armazenamento; não usar julgamento simples truthy/null que ressuscite uma nova seleção já limpa.
- [x] Preservar os erros reais de execução e as fronteiras de salvamento de negócio de Wiki, Bot e Subagent; não converter todos os cenários para a semântica de notificação do Composer.
- A importação do ID de conta do antigo `generationModel` do Wiki reutiliza a conversão do Todo 72 injetada pelo Host, sem consultar a interface de contas no Storage. Quando o novo `modelSelection` existe, a conversão de identidade antiga não é chamada; a intenção explícita antiga que não pode ser vinculada permanece como seleção não vinculável, com conteúdo ainda legível, e não pode virar "modelo não especificado" passando a usar o modelo padrão. A leitura não reescreve o arquivo antigo; apenas o salvamento normal fixa os campos novos.

### R05: Migração de seleção de conexão de conta antiga esquecida (Todo 72)

Decisão complementar de 2026-09-07: conexões Team antigas sem ID de organização, na migração, usam as credenciais OAuth existentes para chamar `/api/biz/customer/getCustomerInfo` e, após casar a organização de forma única pelo ID de projeto antigo, preenchem o dado. Isso não é suportar "Team sem organização", nem chama o fluxo completo de pricing/credenciais que solicita uma API Key. Em caso de falha na consulta, ausência de casamento ou casamento de múltiplas organizações, mantém-se o registro original pendente de migração; não pode ser salvo como nova seleção vazia e substituído pela ordenação de inicialização. A presença dos campos novos é autoritativa, e o salvamento explícito pelo usuário de uma nova seleção encerra a migração antiga.

Fronteira de dependência: a leitura comum de Setting faz apenas análise local; a camada de montagem do Host injeta a consulta OAuth somente leitura no ponto de entrada da migração, coordenando-a antes da leitura de fatos de Account. A camada de rede que lê configurações de proxy não deve aguardar novamente pela migração. A consulta de rede fica fora da fila de escrita de settings; a submissão, dentro da fila, reconfere a conexão antiga, os campos novos e o domínio da conta; modificações concorrentes vencem migrações tardias. A projeção de Family cuja migração não está pronta é desconhecida e não bloqueia Provider Personal comum, leitura histórica ou settings básicos; arefresh de conta existente dispara a próxima tentativa, sem adicionar poller.

- [x] Antes que settings antigos sejam descartados pelo novo schema, converter o mode/selectedKey antigo de Family; importar apenas settings antigos cujos campos novos ainda não foram estabelecidos.
- [x] Converter Personal/Team/Start, Z.ai/BigModel pela identidade real antiga; Team preserva informações completas de produto/organização/projeto.
- [x] Não usar a ordenação da primeira inicialização no lugar da escolha antiga salva pelo usuário; quando não for possível confirmar, não falsificar identidade de Team.
- [x] Verificar upgrade de settings antigos, reinício, prioridade dos settings novos, idempotência da migração e as fronteiras de rollback estabelecidas.

### R06: Conexão real e exibição da página divergem apósinvalidação do Start

> A decisão de produto posterior de 2026-09-08 mudou: [Todo93](todo-93-account-plan-loss-manual-switch.md) passa a avisar uma vez quando a mesma conexão realmenteinvalidação, e só troca quando o usuário clica no botão do alvo concreto; a primeira inicialização apenas cria a linha de base, e escolher manualmente um plano não contratado não volta automaticamente. O texto abaixo é histórico da implementação/aceite antiga e não serve mais como especificação de objetivo para a troca automática posterior; o Todo93 ainda-await implementação.

Complemento da reverificação de 2026-09-08: se a consulta de conta ou a escrita de settings da coordenação automática falhar, mantém-se a conexão atual e não se notifica sucesso; a próxima atualização normal de View (mesmo com estado de conta igual) permite nova tentativa. Views duplicadas causadas pela própria coordenação ainda são deduplicadas dentro daquele lote, sem formar loop auto-disparado; não se adiciona timer, polling ou retry em segundo plano. A recuperação de inicialização continua tolerante a falhas, e o observador posterior deve conseguir identificar a falha desta coordenação, não cacheando permanentemente como sucesso uma exceção engolida.

```text
invalidação explícita -> falha de coordenação -> sem loop na mesma View do lote, settings intactos
                              |
                    refresh normal posterior / refresh do usuário
                              |
                    nova coordenação permitida -> só notifica se o salvamento tiver sucesso
```

- [x] Após confirmar que a conexão original está explicitamente inválida, escolher uniformemente uma conexão alternativa legítima e persistir, avisando ao usuário para qual item houve troca automática.
- [x] A página e a conexão em execução usam o mesmo resultado; não se exibe mais outro plano mantendo a conexão inválida.
- [x] Falha de consulta/ignorado não é tratada comoinvalidação explícita; sem alternativa disponível, exibe-se normalmente o estado indisponível, sem loop infinito nem troca falsa.
- [x] Preservar as decisões do Todo 83 sobre pendência de efeito, estado de benefício, refresh de atividade e cartão de resgate; não usar isso para habilitar "experimentar agora".
- Fechamento da implementação: a recuperação de inicialização e as mudanças posteriores de Account View compartilham a entrada de coordenação de conexão de conta; mudanças posteriores só disparam quando a conexão atual salva está explicitamente `unavailable`. A alternativa deve ser confirmada por benefício/identidade de equipe, e a landing page de compra que "retorna o pessoal mesmo sem plano" não é usada como substituta disponível. O salvamento passa pela fila de escrita de settings existente e valida que o domínio da conta e a seleção de conexão não mudaram desde a consulta; resultados tardios não podem sobrescrever a troca manual. Após escrita bem-sucedida e refresh, avisa o plano alvo, sem adicionar campos de estado persistidos.

### R07: Configuração genérica de modelo incompleta (Todo 76)

- [x] Corrigir o caso em que modelo desconhecido/Highspeed não casa nenhuma regra específica e a ausência de tipo/max de Token de saída máxima torna o modelo não selecionável.
- [x] A linha de base genérica deve produzir configuração completa; parte-se dos valores padrão de publicação já existentes, sem adivinhar capacidades de fabricante para agradar testes.
- Em 2026-09-07 o usuário exigiu algo maior que os 8.192 propostos; nesta rodada o teto inicial genérico de saída máxima fica em 32.000 Tokens, modificável pelo usuário; isso não é uma promessa de capacidade real de fabricante desconhecido, e modelos conhecidos continuam cobertos por regras específicas.
- [x] Verificar integridade e listas de seleção para modelo desconhecido, modelo novo e cada API Schema; não resolver relaxando a verificação de integridade do Registry.
- [x] Verificar separadamente a correspondência de capacidades necessárias para variantes de séries conhecidas e o padrão conservador para realmente desconhecidos, sem atribuir sempre a capacidade máxima.

### R08: Salvamento e layout ao seguir a configuração recomendada (Todo 82)

- [x] Desligar o seguir e salvar preserva o `enabled=false` existente; o estado ligado/desligado não é alterado pelo modo de configuração.
- [x] Depois de fixar e voltar a seguir, continuar editando e a nova entrada precisa poder ser salva; eliminar o problema da marca de limpeza "sticky" que engole valores editados.
- [x] Desligar o seguir salva os campos completos de gerenciamento do editor; quando incompleto, bloqueia toda a submissão e preserva o rascunho. `enabled` não incluso neste modo não precisa ser materializado.
- [x] O interruptor de seguir fica na mesma linha do Salvar/Cancelar na parte inferior, no lugar do antigo "restaurar tudo para o padrão"; em telas pequenas permite quebra de linha razoável, e funciona em temas claro/escuro e em chinês/inglês.
- Reutilizar o Switch padrão do design system, sem pegar emprestado o controle de campo de capacidade chamado BooleanSwitchField que na verdade exibe um botão de caixa de seleção; o texto fica associado ao interruptor e a operação ainda altera apenas o Draft.
- [x] Trocar de modo altera apenas o rascunho; cancelar não grava em disco. O aceite deve incluir salvar, fechar e reabrir, não apenas afirmar o valor de retorno do draft.
- Evidência: `361bf66ce7`; os três problemas de salvamento foram reproduzidos em memória com o helper real; o teste antigo até afirmava que a configuração fixa não contém enabled.

### R09: Configuração e Logo de modelos de provedores agregados (Todo 79)

- [x] Aplicar em conjunto o princípio de "regras de Match" do Todo 76: `modelRules` / `modelApiRules` suportam prefixo de namespace e sufixo de versão confirmada, com a família genérica antes e o modelo/variante específico depois. Não se pode dizer que o casamento de prefixo/sufixo está completo apenas porque se enumera prefixos selecionáveis para plataformas atuais como OpenRouter; Template/Provider de membros exatos e as regras de Site URL não são afrouxadas.
- [x] Com modelo original, diferentes prefixos de namespace, sufixos de versão confirmada e combinações de prefixo+sufixo, validar a capacidade final e o Option Map; variantes semânticas como `-flash`, `-turbo`, `-thinking`, `:free` validam sobreposição de regras específicas, e não são tratadas como aliases sem distinção.
- [x] Confrontando a lista de manutenção atual, conectar IDs de namespace da OpenRouter e modelos do OpenCode às capacidades de modelo e Option Map corretos; não copiar endpoint/access do Provider upstream.
- [x] Preservar o model ID completo da requisição (incluindo prefixo, `:free`, etc.), sem reescrever a identidade da requisição para fins de casamento.
- [x] Aplicar o requisito já estabelecido de habilitar por padrão modelos representativos de cada fabricante upstream; validar o resultado final da resolução, não apenas a lista de modelos.
- [x] Completar os Logos quadrados oficiais da OpenRouter/OpenCode, empacotados como recursos embutidos, registrando a fonte oficial; não modificar o gráfico de marca, usando variante adequada quando necessário no tema escuro.
- [x] A ausência do material continua degradando com segurança, compatível com configuração remota publicada; não adicionar a funcionalidade de upload de Logo pelo usuário.
- [x] Validar reasoning/output em requisições reais, sem copiar afirmações sem base sobre budget_tokens ou max_completion_tokens.
- Segunda revisão: após o GPT casar a capacidade do modelo, a entrada Anthropic da OpenRouter ainda herda um Reasoning Map vazio. Adicionar `output_config.effort` conforme o contrato do site, sem transladar `reasoning.effort` de Responses para Messages e sem alterar o model ID original. Base: a explicação de effort em nível de requisição em [documentação de Reasoning da OpenRouter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens); validar os campos de requisição formados após a avaliação real do Map. Essa diferença fica na camada Site, sem estender ramificações de runtime.

### R10: Fatos inconsistentes de edição/ordenação de membros de modelos dinâmicos de conta

- [x] A Facade de settings obtém membros e origem a partir do snapshot de configuração já resolvido e os passa às operações de escrita como entrada somente leitura interna do Host; o frontend não fornece lista confiável.
- [x] O ConfigService mantém a responsabilidade de escrita Personal, sem chamar a API de Account e sem depender da implementação de Runtime; remover a lógica que reavaliava operações pela lista estática.
- [x] Conferir juntos edição, ordenação, deduplicação na adição, conflito de renomeação e permissão de exclusão/renomeação. Modelos de Account continuam sendo membros herdados e não se convertem em modelos pessoais criados pelo usuário.
- [x] Não substituir membros de configuração pela lista executável do Registry; modelos desativados, sem Key ou incompletos ainda podem ser gerenciados pelas regras.
- [x] Lista vazia/lista substituta explicitamente de Account respeita a semântica de Overlay, sem união com a lista estática; Personal apenas salva sobrescritas de configuração e ordem, sem copiar membros de modelos da conta.
- [x] Preservar a verificação de versão na entrada de salvamento e a validação de versão transacional de Personal; um rascunho obsoleto gera conflito explícito e é preservado, sem depender de timeout e sem nova requisição de rede de conta.
- [x] Após editar/ordenar novos IDs dinâmicos, a releitura tem sucesso, IDs duplicados são rejeitados e membros removidos pela conta não são ressuscitados por salvamento tardio.

```text
Built-in / Template + Account + Personal
                 |
          snapshot de configuração resolvido
          /            \
     exibição na página   validação de membros na escrita
                          |
                  submissão atômica de Personal
                          |
                      refresh da view
```

### R11: Nível mais alto na escolha ativa de modelo e fallback de modelo inicial (Todo 71/84)

- [x] Quando o usuário escolhe ativamente o modelo alvo, a entrada pública de construção usa o `values.at(-1)` atual do alvo; não herda a faixa do modelo de origem e não completa valores no ModelFactory.
- [x] Restauração de histórico e reprocessamento de seleção existente continuam limpando faixas ausentes/inválidas; a continuidade de mesmo modelo entre contas preserva a faixa original suportada.
- [x] Verificar e restaurar o fallback de ordem do modelo inicial do Host quando não há Configured Default; não preencher um padrão em sessão histórica não vinculada por engano como se fosse um rascunho novo.
- [x] Um Configured Default válido com options é preservado, e as prioridades de Recent e rascunho explícito não mudam; o tratamento específico de defaults inválidos é conferido conforme a spec válida original e, havendo conflito indecidível, é listado separadamente.
- Verificação da revisão: `design/registry/runtime.md` deixa claro que Configured Default inválido usa o fallback do Registry; Todo 84 e 87 declaram ambos não alterar a inicialização de rascunhos novos. Portanto, somente na resolução da recomendação inicial do Host a preferência inválida é descartada e o nível mais alto é inicializado pela ordem da lista, sem gravar de volta a preferência padrão; a resolução válida de Session/rascunho existentes continua vazia e não passa por esta entrada.
- [x] Composer e outras entradas de escolha ativa de modelo compartilham o comportamento; a estratégia de nível mínimo para requisições auxiliares não muda.
- [x] O rascunho e a entrada de tarefas existentes do `/model` do Bot também usam o nível mais alto do modelo alvo; não carregar a faixa antiga. Quando o menu está expirado ou a leitura da View falha, manter a seleção original e não submeter uma nova seleção incompleta.

### R12: Perda das marcas de capacidade visual

- [x] Restaurar as marcas de capacidade visual existentes nas linhas de modelo das settings de Provider e no seletor de modelos, lendo a configuração de capacidade atual do modelo e sem manter lista branca de modelos.
- [x] Conferir o significado dos antigos badges contra o contrato atual de capacidade de imagem/multimodal, sem tratar "tem qualquer entrada não textual" arbitrariamente como suporte a imagem.
- [x] Verificar temas claro/escuro, nomes longos de modelo e layout de celular; não alterar a capacidade real do modelo para satisfazer asserções de badge.
- Evidência: perdido em `4a59fba07b`, não reposto pelo merge posterior; não foi introduzido pela primeira vez no sábado.

## Ordem de execução e aceite

### Complemento R13: Diálogo de edição de modelo sem os dois contêineres de grupo já decididos

- [x] Contêiner "Configurações de raciocínio": contém a faixa de raciocínio e o Mapping de parâmetros de raciocínio, com título em chinês e inglês, reutilizando as bordas e espaçamentos de grupo existentes.
- [x] Contêiner "Configurações avançadas": contém o Schema de ferramentas MFJS, com título e contêiner independentes; apenas agrupamento, sem reintroduzir interruptor de recolhimento.
- [x] O Footer Salvar/Cancelar e o interruptor de seguir recomendação ficam fora dos contêineres; sem alterar a semântica de rascunho, salvamento ou requisição.
- [x] Conferir chinês/inglês, temas claro/escuro e janela estreita, e validar os dois grupos de campos e a operação de salvamento.
- Confirmação complementar do usuário em 2026-09-07: este agrupamento já havia sido discutido antes, mas o Todo 75 atual ainda diz "sem configurações avançadas" e o Todo 77 ainda diz "não criar contêiner de Reasoning"; o `ProviderModelSettingsGroups.tsx` atual também não implementa. Esses dois requisitos antigos são substituídos por este item, e não são fechados com base no status antigo de conclusão.

### Passos de execução

1. R01–R05: migração e recuperação não vinculada, salvando primeiro as fronteiras de segurança de dados; ao sobrepor mudanças de outros trabalhadores paralelos, conferir primeiro, sem sobrescrever.
2. R10, R08: unificar a base de membros e então corrigir o salvamento de configuração, incluindo releitura real após salvamento.
3. R07, R09, R11, R12: configuração padrão, escolha ativa, modelos agregados e exibição.
4. R06: conversão unificada e notificação de conexão inválida; regressão conjunta de refresh de Account/Selection.
5. Para cada grupo, adicionar primeiro testes que falham e só então implementar, e depois revisar o diff real, se os testes cobrem de forma independente a necessidade e os caminhos adjacentes.
6. E2E formal do Electron, conforme a decisão mais recente do usuário, passa a rodar no MacBook Pro com dados de teste isolados, sem interferir em sessões/contas reais; não fabricar fixtures com resgate real de benefícios. O teste de recuperação de dados antigos de usuário real é feito separadamente e não pode ser misturado como fixture E2E público.
7. Por fim executar `pnpm typecheck`, `pnpm lint`, testes unitários relacionados, `typecheck:e2e` e E2E direcionados. Registrar falhas e não-executados separadamente, sem reportar aprovação falsa.
8. Commitar apenas os arquivos desta tarefa, preservando mudanças de outros trabalhadores, proibindo `--no-verify`; sem push não solicitado nesta rodada.

## Cenários de regressão aceitos

- O state antigo de Subagent interno é importado uma vez e persistido na fronteira de preparação de início do Agent no Host; não depende de abrir a página de settings e não adiciona interface de troca de conta ao protocolo App–Agent. A importação usa a mesma conversão de identidade e mantém os campos antigos para rollback; se o arquivo original já mudou após a conversão assíncrona, a escrita tardia é descartada e não pode sobrescrever a nova escolha do usuário. Campo novo existente não é preenchido a partir do antigo.
- Decidido (2026-09-07): o usuário concordou em incluir nesta rodada a importação da identidade antiga `builtin:` de Markdown personalizado/de projeto/de plugin, organizada como passo de inicialização aguardável, reutilizando a porta existente `resolveLegacyModelProviderId`, sem reescrever o Markdown automaticamente. IDs de Account novos comuns não chamam essa conversão e não são reescritos na troca de conta; item com identidade não confirmada mantém a seleção não vinculável original, e IDs antigos iguais são mesclados em uma única consulta.
- Verificação de impacto da inicialização: `createZCodeApp` deve concluir a importação de profiles antes de construir o Runtime, portanto a criação retorna Promise; a materialização de Session do Protocol, o teste de conexão temporário/geração de texto, o prompt/CLI TUI e as ferramentas de rastreamento esperam de forma unificada. Reutiliza-se a coordenação de criação do pool resident de Session existente, sem novo estado de inicialização em segundo plano nem modificação de configuração privada do Runtime. Testes/embeds dependentes podem usar factory síncrona; chamadores de produção esperam uniformemente com await.
- Complemento de aceite: com carregamento real de Markdown e resolução de identidade atrasada, o Runtime não é criado antecipadamente; falha de conversão mantém apenas aquele profile não vinculável, sem perder os demais; a faixa do campo novo permanece autoritativa; o arquivo original não é escrito de volta. A recuperação desktop continuous/celular replayable do Protocol e o cold load concorrente são regressados pela entrada original. Codegraph está indisponível no momento e dep:refs não indexa o workspace CLI independente; completa-se com busca no repositório inteiro e verificação de tipos dos três pacotes do CLI, sem confundir ausência de índice com ausência de referência.

- Session com Selection histórico vazio/corrompido pode ser aberta, resselecionada e continuar; importação real de formato antigo de tarefas agendadas, Subagent interno/personalizado e Wiki, com valores novos não sobrescritos por antigos.
- Settings de conexão antiga consistentes com a identidade real em execução;invalidação explícita substituída e notificada automaticamente, benefício desconhecido não causa troca errada.
- Edição de novos modelos dinâmicos de conta, reordenação e releitura; modelos desativados são editáveis mas continuam desativados; modelos herdados não podem ser renomeados nem excluídos como modelos pessoais.
- Troca bidirecional entre fixo/seguindo, continuar editando, cancelar, salvar e reabrir; falha de integridade não grava parcialmente; o interruptor fica na área de operações inferior.
- Linha de base conservadora utilizável para modelos desconhecidos, configuração real válida e Logos de modelos agregados; escolha ativa de modelo no nível mais alto estritamente separada do histórico que fica vazio.
- Desktop local e celular/remoto leem a configuração do seu próprio Host; sem nova sincronização pré-envio e sem modificar requisições em execução ou histórico.

## Relatório de implementação e registros de re-revisão

Esta seção serve como relatório de implementação deste Todo, preenchida item a item: causa raiz, evidência de teste que falha primeiro, arquivos corrigidos, comandos/produtos aprovados, conclusão da re-revisão, commit; não se pode escrever apenas "concluído".

| Item | Status de implementação | Evidências de verificação e re-revisão | Pendente de discussão / limitação |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Correção de código e aceite direcionado Pro aprovado | Novos testes de App/SQLite/Protocol real com asserções de read, settings e fork, reproduzindo primeiro 10 falhas; a segunda revisão reproduziu de novo a falha de importar histórico sem modelo e, após a correção, 12 do mesmo grupo passaram (desktop continuous / celular replayable). Verificação Pro: falta de faixa, faixa inválida e Provider inválido abrem histórico e permitem continuar após resseleção | O E2E continua no diretório pending original, sem virar portão formal por conta própria; o fixture inicial só alterava o Session DB e esquecia de limpar o rascunho novo do Composer daquele Session; corrigiu-se o isolamento do fixture em vez de afrouxar a regra de recuperação do produto |
| R02 / R04 Automation | Correção de código e primeira execução em segundo plano pelo Pro aprovadas | As duas codificações antigas de modelo e o null/valor ruim do campo novo falharam antes e foram corrigidos; o dispatch em segundo plano passa pela importação do Host e relê, sem re-resolver um run já fixado. 68 casos de automationRepo e 6 casos do helper de dispatch passaram. Após TSL38 sair, injetou-se `provider=zcode` com modelo custom antigo/high e SQL NULL nas novas colunas; após reiniciar, o scheduler executou e acertou o fixture independente, conferindo a requisição real, os campos novos de definição/run e os campos antigos de rollback | `desktop-e2e-20260907-145947-115`, 1 caso passou; este caso é um Provider comum, e a falha de identidade de conta antiga em um item isolado continua coberta pelos testes de repositório/Host |
| R03 / R04 Subagent | Inicialização assíncrona de profiles conectada conforme aprovação do usuário | Importação de state antes do start do Host, proteção contra escrita tardia e JSON ruim preservado sem bloquear o start; Service e autoridade do campo novo, 28 casos passaram. A autoridade do Markdown no CLI reproduziu primeiro 2 falhas, e 22 passaram após a correção. Novos testes reais de App/Markdown provam primeiro que a interface antiga de identidade não é chamada, depois validam esperar a importação, passar ao Runtime e não escrever o arquivo; 4 testes puramente de conversão cobrem a falha e o fato de a nova identidade não mudar. I20 do Pro rodou de novo sob o novo código de inicialização: os três child requests no modelo/high especificado e o parent em max | O mapeamento automático de conta em segundo plano para Subagent explícito novo ainda não estende o protocolo; I20 prova que overrides antigos internos e a faixa do novo Markdown são autoritativos, mas não pode-se alegar sozinho que validou o fluxo completo de Host RPC do Markdown antigo de conta real |
| R04 Wiki | Leitura corrigida e aceite Pro de arquivo antigo aprovado | Wiki com campo novo null/corrompido não relê valor antigo; o Storage recebe do Host a conversão de identidade antiga, e a escolha explícita antiga não vinculável não vira seguir-o-padrão. 5 casos de armazenamento independente e 57 do serviço existente passaram. WIKI-READ-01 do Pro reiniciou a partir de um arquivo só com campos antigos, exibiu o modelo/high original, a leitura não alterou o arquivo e leitura/exclusão passaram | Em `desktop-e2e-20260907-145711-596` o Wiki passou e o Automation falhou, não podendo chamar o grupo inteiro de aprovado; a conversão de ID de conta é provada por testes de armazenamento e serviço, e o representante de desktop é um Provider comum |
| R05 | Migração Team completa aprovada na aceitação de cold start do Pro, revisão de fronteiras continua | Importar Team/Pessoal/Start completos antes da resolução do novo schema, mantendo campos antigos; campo novo presente não relê valor antigo. 33 casos de settingService passaram. I26 criou estado persistente novo do Composer a partir da seleção real de modelo, reiniciou com conexão Team nova e antiga, conferiu o modelo que não era o primeiro, a identidade Team completa e os campos antigos preservados, e a requisição real teve sucesso | `desktop-e2e-20260907-150508-565`; o modo de API antigo e a seleção project-only sem identidade de organização ainda precisam de verificação conjunta na recuperação de inicialização, e não se pode usar o Team completo para representar essas duas fronteiras |
| R06 | Refresh unificado e troca porinvalidação aprovados no Pro | Benefício desconhecido não causa troca errada, falha de consulta assíncrona captura settings antes da consulta, escrita condicional protege a troca manual e falha de refresh após escrita não engole a notificação. Após o refresh de inicialização ser recusado, ainda há assinatura; Root / observador / ciclo de vida, 26 casos passaram. SPMC-08 estendeu o cenário deinvalidação real: Start selecionado → mock sem benefício explícito → clique em refresh nas settings → troca automática para pessoal com notificação, conferindo a conexão persistida real; 4 casos do grupo passaram | Evidência `desktop-e2e-20260907-144614-095`; não se pode declarar aprovada a troca porinvalidação só porque o resgate teve sucesso |
| R09 | Casamento genérico de prefixo/sufixo refeito, revisão integral continua | A limitação de enumeração de prefixos de fabricante foi removida e Model / Model API suportam prefixo e sufixo uniformemente; variantes específicas ficam depois das famílias genéricas. Três APIs, 16 modelos e 4 aliases de categoria comparam a configuração final; o Reasoning Map de GPT Messages na OpenRouter ganhou teste de campo de requisição, que falhou antes e passou depois. 18 casos de integridade e alias passaram; os dois Logos quadrados oficiais foram empacotados | Variantes semânticas e as requisições reais das demais interfaces ainda precisam de verificação; não se pode declarar confirmado qualquer sufixo |
| R07 | Configuração genérica completada, revisão de publicação integral pendente | O usuário confirmou um valor inicial genérico maior; nesta rodada definido em 32.000. O teste de integridade de modelo desconhecido para três API Schemas falhou primeiro e, após a correção, passou com validação da lista real do Registry; 14 casos de integridade Builtin passaram; a revisão de publicação subiu para 10 | Variantes de séries conhecidas e capacidades dedicadas de modelos agregados são conferidas em R09 |
| R08 | Salvamento e layout aprovados no direcionado Pro | Preservar enabled=false, editar após voltar a seguir, integridade fixa e materialização de entrada não salva foram reproduzidos antes de corrigir; rascunho 23, diálogo 16, servidor 27, linha de modelo 41 casos passaram. MP-UI-06 do Pro validou cancelar, troca bidirecional, salvar e reabrir, posicionamento inferior do interruptor e janela estreita | Combinações de tema claro/escuro e chinês/inglês continuam na revisão integral da página |
| R10 | Snapshot de membros completo e modelos dinâmicos aprovados no Pro | A Facade fornece membros, origem e validação de snapshot confiáveis; o ConfigService não consulta contas. Edição, ordenação, preservação da ordem dinâmica após mudar o Provider e rejeição de escrita tardia quando membros assíncronos somem: 47 casos passaram. Os modelos que retornam apenas saldo do Start Plan do Pro validaram editar/salvar/reabrir, ID somente leitura, ordem real de arrastar e gravação em disco, sem falsificar modelIds de Personal | Sincronização remota reutiliza fronteiras existentes, sem nova sincronização pré-envio |
| R11 | Nível mais alto na escolha ativa e fallback inicial de rascunho novo conectados | Ações ativas de Composer, tarefas agendadas, tarefas off-peak, Subagent e Wiki conectadas à construção pública; a restauração de histórico não completa faixas. Configuração de seleção/Facade/Composer, 33 casos passaram; I20 do Pro validou que a escolha ativa de Subagent primeiro grava o nível mais alto e depois muda explicitamente para high e usa na requisição child real | Outras entradas de construção ativa no backend ainda precisam de revisão; um caso de Subagent não substitui o aceite de todas as interfaces |
| R12 | Marcas visuais restauradas na linha de modelo das settings e na lista pública de seleção | Quando a capacidade de imagem é verdadeira, reutiliza-se o badge existente, sem adivinhar por modelo; a ausência foi reproduzida primeiro e 42 casos de linha de modelo e lista passaram | Tema, nomes longos e layout de celular aguardam aceite em Electron/página |
| R13 | Os dois contêineres implementados e aprovados na página de settings do Pro | Faixa de raciocínio e Mapping no mesmo grupo, MFJS em grupo avançado independente, sem recolhimento, operações inferiores independentes; 16 casos do diálogo e MP-UI-06 do Pro passaram | Tema e idioma continuam na revisão integral |
| Verificação de tipos | Workspace raiz e bootstrap do CLI aprovados | Várias rodadas de `pnpm typecheck` passaram; após reconstruir contracts, o `typecheck` do bootstrap do CLI passou, e o erro original em `HookRunLifecyclePayload.blockReason` vinha de artefatos de tipos de dependências desatualizados | Mudanças posteriores ainda exigem repetir todas as verificações |
| Escopo e ambiente | Registrado | Branch atual sincronizado com seu próprio remoto; há modificações paralelas no workspace, preservadas | Não se opera configuração real |

- Backup no Air: o arquivo compactado de backup do usuário real foi transferido por completo, e o SHA-256 na origem e no Air é `e4b179c215619fc700848a51cece6fef8e77dec8c742f52ec2f8c0e33c282827`, com 9.787.073.272 bytes. Não foi descompactado nem restaurado em dados reais; o Air tinha cerca de 12 GiB livres naquele momento, e os testes seguintes precisam controlar espaço.
- Nova autorização do usuário em 2026-09-07: transferir esse backup do usuário real para o Pro e substituir o `.zcode` padrão do Pro como dado repetido de teste de migração. Já concluído: o SHA-256 do pacote original é igual ao do Air/da origem; o original descompactado permanece em `/Users/dev/.zcode-test-fixtures/real-user-20260902/pristine/.zcode`, e o `/Users/dev/.zcode` restaurado não tem diferença em relação a ele na comparação de checksum total em dry-run. Os dados antigos do Pro, cerca de 533 MiB, ficaram em `/Users/dev/.zcode.before-real-user-2026-09-07T13-18-05.536Z`, sem exclusão e sem iniciar a aplicação antiga. O `Restore-Real-User-Test-Data.command` do desktop pode repetir a restauração após sair de todos os ZCode/Agent/Host; a ferramenta sempre prepara uma cópia antes e depois renomeia para arquivar. A ferramenta e os backups sensíveis ficam apenas na máquina de teste e não são commitados no Git.
- Ambiente de verificação em 2026-09-07: a leitura das credenciais Git por SSH no Air e no Pro reportou keychain `-25308`, enquanto o Git do terminal local funciona, então não se pode concluirinvalidação da conta a partir disso. Não se afrouxaram permissões do keychain; em vez disso usou-se o bundle de código-fonte já autorizado localmente para preparar o workspace isolado do Pro `/Users/dev/zcode-todo88-pro-e2e`, e o CUA continuou travado em `95ca9ede5f308c1fcf33ea1081da4d9550bd439d`. Os resultados do Electron estão abaixo.
- O `pnpm typecheck` local completo mais recente passou; `pnpm lint` passou (40 warnings existentes, 0 erros). Modificações posteriores ainda exigem repetir; este item não substitui o aceite final.
- Regressão em lote da segunda revisão: 34 arquivos de teste relacionados a Provider, Provider Node, Automation, Subagent, Settings, Wiki, Account e UI, 501 casos passaram. As asserções de interação real do MP-UI-06 no desktop passaram; veja os registros de produtos abaixo.
- Preparo do ambiente Pro: instalação de dependências travadas com pnpm store isolado e o proxy HTTP já existente na máquina de teste; a primeira instalação do Electron não habilitou sua opção de proxy e expirou, e a instalação teve sucesso após habilitar `ELECTRON_GET_USE_PROXY` no nível do processo. Não se alteraram proxy global, ACL do keychain ou versões de dependência, e falha de instalação de ambiente não é contada como falha de caso de produto.

### Revisão da inicialização assíncrona e aceite mais recente de 2026-09-07

```text
leitura do Markdown de usuário / projeto / plugin
  -> apenas identidade builtin antiga: await porta de importação existente do Host (dedup por ID)
  -> montar configuração do Runtime -> criar App -> devolver Protocol / chamadores de CLI

importação indeterminada -> manter a seleção não vinculável original daquele item; outros profiles carregam normalmente
saída de CLI/TUI durante a inicialização -> liberar o App tardio, sem enviar e sem reativar
```

- Inicialização, configuração, recuperação a frio com SQLite real, dois deliveries de Protocol, MCP, Hook e workflow: 12 arquivos, 172 casos passaram. Chamadores de API unificaram o await; testes antigos/embeds com factory síncrona ainda podem injetar.
- A regressão de saída reproduziu primeiro o commit ainda ocorrendo após saída headless e o App ainda sendo devolvido após fechar o TUI; após a correção, 4 casos passaram junto com a limpeza existente de saída/falha. Só se fechou a nova janela de espera, sem adicionar retry em nível de processo.
- Os testes de Protocol ampliados Season teve mais 1 falha de denylist de Cron remoto. Usando a versão HEAD original de `server-operations`, `workspace-model-runtime` e dos casos originais, a repetição isolada deu a mesma falha, confirmando que isso não foi causado pela async desta rodada; o arquivo de baseline temporário foi removido e o log `/tmp/todo88-cron-baseline.log` foi mantido. Não se alteraram as permissões do Cron remoto.
- Na primeira rodada completa do CLI, 289 de 294 casos passaram e 5 falharam. Depois corrigiram-se quatro fixtures desatualizados e o grupo relacionado ficou 181/181; o fecho de dependências SEA ainda falha, problema de estrutura de empacotamento confirmado também no staging fixo. Não se rerrodou e declarou todos os 294 aprovados; veja o relatório de re-revisão AS03.


- Os produtos do Pro estão unificados em `/Users/dev/zcode-todo88-pro-e2e/packages/desktop/.e2e-artifacts/`: página de settings `desktop-e2e-20260907-135538-982` (7 aprovados, 1 SSH remoto pulado); resgate do Start / modelos dinâmicos `desktop-e2e-20260907-140557-441` (4 aprovados); Subagent I20 após a nova inicialização assíncrona + recuperação de sessão antiga `desktop-e2e-20260907-143425-628` (2 aprovados).
- Os aceites de R05, R09 e R12 ainda pendentes nesta altura foram complementados no fechamento final abaixo. R02 (tarefa agendada antiga em segundo plano), R04 (arquivo antigo do Wiki) e R06 (troca automática porinvalidação explícita) também têm evidência do Pro; são aceites direcionados, não um E2E completo.
- A primeira aceitação de migração da TSL38 não passou: o banco em execução mostrava a Selection corretamente importada, mas a expiração na inicialização fez o scheduler despachar antes da janela do Host, entrando no retry existente `no local host available`. O fixture agora, após a saída, escreve apenas o modelo antigo e, depois de reiniciar com o Host pronto, apenas avança o horário de expiração; a lógica de retry do produto não foi alterada, e a execução real em segundo plano passou depois. A primeira falha do Wiki foi o teste escrever por engano o valor do picker do DOM `custom:` como provider/model; o log confirmou o eco correto e o teste foi corrigido e reexecutado com sucesso.
- A primeira repetição do I26 parou na asserção de Recent do fixture antigo: ele escreve só Recent, mas a página já tinha um rascunho novo do Composer com prioridade maior, por isso ainda mostrava o modelo do rascunho. Isso não é falha de migração de conexão. Passou-se a selecionar o modelo de verdade para criar o rascunho e reutilizar o mesmo Chromium Profile em cold start; sem reduzir a prioridade de persistência do Composer. Executou-se apenas I26, sem registrar I25/I27/I28 do mesmo arquivo como aprovados.
- Nova evidência do Pro nesta rodada: em `desktop-e2e-20260907-145010-681` passaram 3 casos juntos de gerenciamento do formulário de tarefa agendada, leitura/exclusão de Wiki e settings de geração de Wiki; provam apenas a regressão da funcionalidade original, e a migração de arquivo antigo é validada pelos casos direcionados acima.
- Verificação de encerramento desta rodada: `pnpm typecheck` raiz, `typecheck:e2e` do Desktop, `pnpm lint` e `git diff --check` passaram; o Lint segue com 40 warnings existentes e 0 erros. A verificação de contrato de fixture da TSL38, do arquivo onde fica I26 e do caso de leitura de Wiki passou. O verificador de I26 ainda imprime warning de marker não correspondido para as constantes `E2E_*` importadas, o que não é ausência do marker real enviado; não se alterou seu matcher público nem se afrouxou o verificador.

## Fechamento final (substitui o progresso inicial de "continuar revisão / aguardando aceite" na tabela acima)

- [x] Decisão AS02 concluída: o usuário depois aceitou explicitamente tratar a seleção nova de Subagent corrompida por herança, e a proposta anterior de "manter a exibição e reportar erro de configuração na execução" não é implementada. Este item é aceitação do estado atual e não declara correção nem novos testes aprovados; a migração dos campos originais de Markdown e a aposentadoria do formato intermediário seguem conforme o Todo 97.

Fechamento complementar de 2026-09-08: as quatro omissões de nomenclatura de atributos E2E do AS06 foram commitadas separadamente em `be348019e1`; o AS07 corrigiu a falha de coordenação de conta ser deduplicada permanentemente. Com o commit de código-fonte independente mais as correções complementares desta rodada, a verificação de tipos raiz/E2E e o Lint passaram, 28 arquivos relacionados às mudanças com 471/471, e o grupo do Pro de resgate/modelos dinâmicos/falha e recuperação apósinvalidação 4/4 (`desktop-e2e-20260908014430812-p41305-9af07adb1cfb1a1e`). O CLI completo ficou 295/296, e a única falha continua sendo o fecho de baseline SEA já confirmado, sem alegar tudo verde. Os pontos vermelhos, atribuições, fronteiras de correção e logs estão no link abaixo.

O problema completo, o escopo de commits, os achados da segunda rodada e as decisões estão em [Registro de conclusão e auditoria de commits recentes](../research/todo88-completion-and-commit-audit.md).

| Escopo | Resultado final | Evidência / limitação |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01–R04 | Recuperação aprovada, importação de formato antigo, prioridade do campo novo e inicialização assíncrona de profiles concluídos | SQLite/Protocol, arquivos antigos reais e casos direcionados do Pro. AS02 depois aceito como herança, não mais aguardando decisão e não contado como correção aprovada |
| R05 | Team completo e Team antigo sem organização concluídos com reinício a frio e aceite de requisição real | Pro `desktop-e2e-20260907-160104-848`; casamento único por OAuth, retenção em falha e prevenção de sobrescrita concorrente com 87 testes unitários. O modo de API é provado por teste unitário como fora da migração de contas, sem alegar ter rodado sozinho seu upgrade de desktop |
| R06 | Substituição automática e notificação concluídas, e corrigiu-se a perda de refresh no fechamento do observador | Pro `desktop-e2e-20260907-162115-439` 4/4; desconhecido não dispara substituição |
| R07 / R09 | Teto padrão, prefixo/sufixo, variantes semânticas, todos os membros agregados e Logos concluídos | 19 verificações de configuração/Map avaliadas nível a nível; não é medição real da API online de cada fabricante |
| R08 / R10 / R12 / R13 | Salvamento, membros dinâmicos, marcas visuais, agrupamento e rodapé concluídos | Edição/ordenação de Start dinâmico no Pro 4/4; `desktop-e2e-20260907-160913-084` com chinês/inglês, dois temas, 390px, ID longo e cancelar/salvar e reabrir aprovados |
| R11 | Todas as entradas localizadas de escolha ativa conectadas ao nível mais alto público; entradas do Bot `/model` completadas | Serviço do Bot 93/93, Pro `desktop-e2e-20260907-163541-147` 3/3. Histórico sem faixa continua vazio, sem valor padrão no ModelFactory |
| Re-revisão ampliada AS01 | Restaurada a passagem de referência perdida na pergunta auxiliar do Markdown e a condição de bloqueio | Teste real do SessionPane falhou antes e ficou 8/8; caso formal do Pro `desktop-e2e-20260907-162820-560` passou |
| Regressão final em lote | 33 arquivos relacionados às mudanças 599/599; 28 arquivos arquiteturalmente adjacentes 394/394 | Os dois grupos têm sobreposição e não são somados como total de casos independentes; o CLI é listado à parte e o desktop/celular completo não foi executado |
| Backup real | Arquivo de origem preservado; de 15 automações antigas importadas em memória 14 passaram, 1 aguarda migração pela limitação entre Families estabelecida | Não se iniciou tarefa real nem se enviou requisição com credenciais de colega; não se pode dizer que todo o histórico real teve aceite de execução |

## Relação com Todos existentes

- A re-revisão da cadeia de execução de 2026-09-07 acrescentou a verificação R03/R04: o `subagent/profile.ts` do CLI ainda sobrescrevia o novo `modelSelection` com o `thoughtLevel` antigo e ressuscitava null do campo novo com `??`; corrigiu-se após adicionar, no loader novo real do CLI, o teste de autoridade do campo novo. Também se descobriu que a importação de override built-in antigo do Host está hoje só em memória, enquanto o CLI lê `agents-state.json` de forma independente; é preciso alcançar a fronteira de inicialização/persistência para provar que a migração é realmente usada em execução, e não se pode fechar R03 com um teste da página de settings.
- E2E formal da página de settings no Pro: `desktop-e2e-20260907-135538-982` com 7 casos aprovados, e 1 cenário SSH remoto pulado por alvo não configurado; MP-UI-06 cobre o interruptor de seguir na parte inferior, cancelar, troca bidirecional, salvar e reabrir e os dois grupos. Na primeira vez descobriu-se reuso indevido de Checkbox e, após mudar para Switch padrão, passou. O novo caso de edição do Start Plan falhou na primeira vez porque a página em chinês usava o locator em inglês Save; após corrigir o locator bilíngue, o grupo inteiro de 4 passou.

- Este Todo é a entrada para corrigir lacunas e rastrear aceites e não reescreve o histórico de Todos antigos; os itens relacionados sincronizam o status dos documentos antigos só depois de aprovados nesta rodada.
- O Todo 84 foi reaberto conforme a decisão do usuário de 2026-09-07 e agora está fechado pela implementação de nível mais alto do R11 deste Todo e pelos aceites seguintes; não foi fechado por um caso antigo de "tudo vazio" ter passado. Em 2026-09-08 seu status foi sincronizado.
- A funcionalidade de JSON Schema em streaming do Todo 80 não está no escopo ampliado desta vez.
- Bugs de conversão de trace já corrigidos servem apenas como proteção de regressão e não são contados novamente como problemas não corrigidos.