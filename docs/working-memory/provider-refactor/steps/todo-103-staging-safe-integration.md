# Todo 103: integração segura do staging fixo, auditoria de comportamento bidirecional e entrega

> Status: em execução; 2026-09-09. Branch de integração `staging-integration-20260909`, branch de destino `provider-refactor-e2e-recovery`. Não mesclar de volta sem a aceitação final, e não fazer push automático.
> Este documento guarda o Goal completo aprovado pelo usuário; o progresso por fase não pode substituir as condições de conclusão.

### 2026-09-10 Autorização de push e entrega da aceitação manual

O usuário autorizou explicitamente sincronizar e enviar o candidato atual para `provider-refactor-m2` e `provider-refactor-e2e-recovery`, sendo a instalação real no Windows e a aceitação com SSH isolado executadas pelo usuário. Esta autorização permite atualizar os branches remotos antes que essas duas aceitações manuais sejam concluídas, tem prioridade sobre a restrição de entrega histórica de “não mesclar de volta, não enviar” abaixo e não significa que essas duas aceitações já passaram, nem que todas as condições de conclusão do Todo103 foram satisfeitas.

Antes do push, o remoto foi buscado novamente: o staging continua em `790884b1ce` e já é ancestral do candidato `0ff7445a1a`, então um merge normal retorna `Already up to date`, sem novos conflitos ou incrementos de código. Os dois destinos de push também são ancestrais do candidato, e foi usado um push fast-forward normal, sem sobrescrever commits exclusivos do remoto. As outras limitações de verificação de empacotamento registradas no Todo104 permanecem e não são marcadas como aprovadas por causa deste push.

Resultado real do push: o atomic push de dois branches de `982835a57b` foi rejeitado pelo pre-push e nenhum dos dois remotos foi atualizado. O lint ficou em 43 warning / 0 error, a verificação de arquitetura em 0 violations; a verificação de affected, por causa da remoção de código-fonte, virou uma suíte completa de testes unitários, com resultado de 1637 arquivos aprovados / 10 arquivos falhando / 2 arquivos pulados e 14372 testes aprovados / 22 falhando / 26 pulados. As falhas envolvem exibição de nome de Provider, Bot, entrega de conta de Wiki e fixtures de configuração antiga, entre outras, e ainda não houve atribuição item a item; não é válido chamá-las indistintamente de problema antigo ou de regressão de produto. Essas falhas de teste unitário não pertencem à aceitação real em Windows / SSH entregue ao usuário; desta vez não houve contorno de hooks nem alteração de código de produto para ampliar o escopo.

Autorização posterior do usuário para corrigir o gate de push: `8cfb2f82ce` corrige o contrato de teste antigo e, por meio de um teste vermelho com Facade real, revela e corrige a perda de nome e metadados de template quando o Registry é congelado. O Pro I13 passou; o pre-push normal completo ficou com 14395 aprovados / 26 pulados / 0 falhando, e lint e verificação de arquitetura passaram. Os dois branches remotos já avançaram de forma atômica até esse commit de correção, sem contornar hooks. A atribuição detalhada e as evidências estão no ledger do Todo104, na seção “lote de verificação complementar do gate de push”; Windows / SSH isolado continuam sendo aceitos pelo usuário, sem declarar o Todo103 totalmente concluído.

### 2026-09-10 Mensagem na fila: revisão independente e testes

O usuário pediu uma nova verificação completa do comportamento esperado dos dois lados e do núcleo da refatoração de Provider. Na verdade, a premissa era um branch independente que já tinha um merge candidato real, e não algo já mesclado de volta no recovery; desta vez a parte razoável de revisão/teste foi executada sobre esse candidato, sem assumir que as duas aceitações críticas de plataforma já foram concluídas. Os itens pendentes em aberto continuam preservados, sem adjudicação automática, push ou alteração do gate de merge de volta. Novas evidências em ledger §47; reutiliza-se a lista de fontes citada acima e faz-se uma verificação cruzada pelo núcleo de configuração, Host, Worker, novas entradas de funcionalidade e requisições reais do desktop.

## Goal: mesclar de forma segura o staging fixo, preservando o comportamento correto e mantendo o contrato da refatoração

Mesclar o staging de versão fixa no recovery. Identificar e tratar por completo tanto os conflitos explícitos quanto os conflitos implícitos gerados pelo merge automático, quanto as dependências do código novo em interfaces antigas.

Garantir que os dois resultados sejam verdadeiros ao mesmo tempo:

1. O comportamento correto do staging não foi descartado sem fundamento.
2. A arquitetura, a semântica de produto e os limites de persistência que já adjudicamos não foram quebrados.

Baseline inicial:

- recovery: f0174b57f5
- staging: 790884b1ce

Confirme o baseline antes de executar; não rastrear commits posteriores de staging no meio do processo.

## Limites e prioridade das adjudicações

Quando houver conflito de arquitetura ou de semântica de produto e nós já tivermos uma adjudicação explícita, a nossa adjudicação prevalece e não é preciso perguntar de novo.

Concretamente:

- Comportamento de staging sem conflito é preservado em princípio.
- Se o comportamento pode ser preservado mas a implementação depende da arquitetura antiga, reconectá-lo pela abstração atual.
- Se o comportamento do staging em si viola uma adjudicação explícita nossa, não restaurar a parte conflitante e registrar o motivo; os demais comportamentos corretos do mesmo commit continuam sendo tratados separadamente.
- Se já existe uma implementação equivalente no estado atual, verificar a relação de cobertura e não sobrepor código.
- Conflitos de documentação são julgados pela adjudicação explícita mais recente; um plano histórico ou um comentário desatualizado não pode ser tratado como requisito atual.
- Rascunhos adiados como o Todo101 não são implementados; o merge não é usado para estender a arquitetura de conta do CLI independente nem para refazer todo o sistema de sincronização.
- Não sobrescrever as alterações de outros trabalhadores, não alterar dados reais de usuários e não publicar nem enviar automaticamente.

### 2026-09-09 Adjudicação suplementar: escopo de correção e granularidade de execução

Esta seção é parte do contrato de execução do Goal completo acima e também se aplica à implementação, revisão e julgamento de conclusão posteriores; não cria um objetivo reduzido paralelo.

1. **Merge seguro, sem correção abrangente dos bugs já existentes dos dois lados.** Regressões introduzidas pelo merge, pontos do código novo que não foram reconectados a interfaces antigas e problemas que atrapalham a preservação de comportamento aprovada nesta rodada precisam ser tratados. Problemas existentes sem relação apenas registram motivo, evidência e impacto, sem correção automática ampliada.
2. **Adjudicação por funcionalidade, permitindo implementação em lote e aceitação compartilhada.** Cada fonte ainda precisa ser rastreável até um resultado, mas não é exigido que cada item pequeno complete sozinho toda a suíte de aceitação. Mudanças de baixo risco e sem interseção arquitetural podem ser tratadas em lote; builds, checagem de tipos, lint e testes de regressão compartilhados devem ser executados de forma agrupada sempre que possível, cobrindo os itens correspondentes com a mesma evidência.
3. **Esforço de verificação alocado por risco.** Interseções de alto risco recebem verificação focada, e itens pequenos dentro do grupo podem ser aceitos em conjunto. Problemas de teste independentes ou de ambiente apenas suspendem os itens afetados, sem bloquear os demais trabalhos que podem avançar. Só é preciso adicionar verificações com novo valor de prova quando o código, as dependências, o ambiente ou a conclusão a provar mudarem; não repetir mecanicamente a mesma verificação já aprovada.
4. **Falha de teste: atribuir primeiro, depois decidir o tratamento.** Distinguir regressão de merge, problema de produto existente, teste obsoleto e questão de pré-requisito de ambiente; registrar a evidência da atribuição e se ela atrapalha o comportamento preservado nesta rodada. Não se pode transformar automaticamente uma falha de teste em tarefa de correção só porque ela falhou, nem escrever uma falha ainda não investigada como problema existente ou como aprovação.
5. **O padrão de entrega não muda.** As adjudicações de arquitetura originais, o registro rastreável por funcionalidade, a revisão bidirecional e as aceitações críticas finais são todos mantidos. Acima só se ajustam a granularidade de execução e o escopo de correção; as aceitações críticas desta rodada não podem ser transferidas ao Todo102 para escapar da verificação.

### 2026-09-09 Nova adjudicação: formar cedo um candidato de merge real

Esta seção ajusta a ordem de execução e tem prioridade sobre o requisito histórico de “executar o merge só depois de portar item a item todas as fontes”; o escopo de revisão e o padrão final de entrega não mudam.

1. Preservar os commits, adjudicações, implementações e evidências de verificação existentes, sem refazer tudo. Os lotes G17 / G06 já modificados são fechados com segurança primeiro, explicitando o que já foi verificado e o que ainda depende de aceitação.
2. Mudanças independentes sem interseção de arquitetura e sem risco de dependência implícita são preservadas em lote pelo merge normal, sem refazer commit um a um e sem reimplementar e reinspecionar cada funcionalidade antiga como se fosse nova.
3. Executar cedo, em um branch de integração independente, um merge real do staging fixo, formando um candidato completo; portar ou aceitar todas as fontes item a item deixa de ser pré-requisito para executar o merge. Uma área de trabalho de merge com conflitos é apenas um candidato pendente de resolução e não se passa por commit de merge concluído.
4. Conflitos explícitos, interseções do merge automático e dependências do código novo em interfaces antigas continuam sendo verificados funcionalidade por funcionalidade. Adjudicações explícitas de arquitetura/produto já existentes têm precedência sobre as do staging; comportamentos preservados são reconectados pela interface atual, sem pular adjudicações com ours/theirs de arquivo inteiro ou `merge -s ours`.
5. Interseções de alto risco recebem verificação focada, itens de baixo risco são verificados em lote, com build e regressão compartilhados; por fim, uma revisão bidirecional e uma regressão entre grupos sobre o candidato completo. Aprovação parcial não substitui a aceitação do todo.
6. Corrigir apenas regressões de merge, pontos não reconectados e problemas que atrapalham a preservação de comportamento nesta rodada; problemas existentes sem relação apenas são registrados, sem correção ampliada.
7. A lista de fontes registra separadamente o que foi adjudicado, o que foi implementado e o que foi verificado; a preservação por merge normal também é um destino de implementação, e o progresso não é medido por quantos commits de fonte foram refeitos. O status/evidence histórico único é mantido para rastreabilidade, mas não substitui as conclusões dessas três dimensões.

O candidato de merge não pode ser mesclado de volta no recovery antes da aceitação final, nem fazer push automático. Os riscos conhecidos são a aplicação duplicada de portamentos parciais já existentes com um novo merge do staging, ou uma passagem automática que mesmo assim altera interfaces compartilhadas; trata-se isso com baseline fixo, lista de diferenças do candidato e verificação de interseção por funcionalidade, e não evitando o problema re-portando todas as fontes.

## Forma de execução

Fixar os baselines das duas pontas, criar um branch de integração independente
|
v
Criar uma lista completa que corresponda a commit, arquivo e funcionalidade
|
v
Fechar os lotes já modificados, preservando resultados e evidências existentes
|
v
Fazer o merge normal do staging fixo, formando cedo o candidato completo
|
v
Preservar em lote as mudanças independentes de baixo risco; verificar e tratar as interseções por funcionalidade
├─ preservar diretamente
├─ reconectar pela abstração atual
├─ já existe implementação equivalente
├─ excluir por adjudicação explícita
└─ aguardando adjudicação do usuário
|
v
Verificar por grupos de risco, revisar por funcionalidade, registrar, resolver conflitos e commitar o merge real
|
v
Fazer a revisão bidirecional do candidato completo e a regressão entre funcionalidades
|
v
Mesclar de volta no recovery depois de atender às condições de aceitação

### Investigação e registro

A lista deve cobrir:

- Todos os conflitos explícitos, incluindo modificação/exclusão e renomeação.
- Todas as regiões mescladas automaticamente onde ambos os lados mudaram.
- Dependências de código added de um único lado em interfaces já removidas, campos antigos e fontes de estado antigas.
- Contratos de protocolo, persistência, configuração, dependências, build e teste entre arquivos.

Adjudique por funcionalidade, e não apenas por arquivo. Registre para cada item:

commit de origem, intenção da mudança, implementação atual, ponto de conflito, base da adjudicação, resultado do tratamento, evidência de teste, conclusão da revisão e pendências.

É permitido consolidar itens duplicados, mas cada fonte precisa ter um destino rastreável. Novos problemas encontrados na investigação devem ser adicionados ao mesmo ledger em tempo hábil.

### Implementação e revisão

- Primeiro definir ou atualizar a spec, depois adicionar testes com poder discriminante, e só então implementar.
- O item acima se aplica aos comportamentos que precisam ser reconectados ou corrigidos; funcionalidades existentes preservadas por merge normal reutilizam a spec e os testes originais e são verificadas em lote por risco, sem obrigação de reimplementar ou reexecutar toda a aceitação item a item.
- Não usar ours/theirs de arquivo inteiro em lote, nem fazer revert amplo e restaurar depois de memória.
- Depois de cada grupo ou lote de baixo risco, conferir todas as requisitos da funcionalidade coberta e as entradas relacionadas a jusante e a montante; é permitido aceitar itens pequenos do grupo em conjunto e compartilhar evidências de build e regressão entre grupos. Não é exigido repetir a aceitação completa para cada item pequeno, e um bloqueio independente não precisa parar os outros grupos.
- Só ao final fazer duas rodadas independentes de verificação:
  - Do staging para o resultado: algum comportamento correto ficou de fora?
  - Da nossa refatoração para o resultado: a arquitetura antiga, algum bypass ou alguma regressão semântica foi reintroduzido?
- A verificação inclui testes unitários relacionados, checagem de tipos, lint, build necessário e testes de desktop/remoto Pro executáveis. O padrão de aprovação é a asserção de comportamento, e não apenas a compilação bem-sucedida.

## Quando parar

Só é necessário parar os itens relacionados e explicar ao usuário nas seguintes situações:

1. É realmente necessária uma nova adjudicação de produto: os princípios explícitos atuais não resolvem, ou duas adjudicações vigentes se contradizem.
2. É preciso ampliar significativamente o escopo: a reconexão local não resolve e é obrigatório refazer a arquitetura, introduzir uma nova migração ou implementar um plano adiado.
3. É preciso adicionar permissões ou operações irreversíveis: envolve dados reais de usuário, publicação externa, operações destrutivas etc.
4. Ocorreu modificação paralela na área de trabalho que não pode ser isolada com segurança.
5. A aceitação crítica não pode ser concluída e todo o trabalho independente restante já foi tratado.

Pré-requisitos de teste, ferramentas e problemas de ambiente pequenos não travam a tarefa inteira; registre e continue os demais itens independentes. As partes aguardando adjudicação permanecem isoladas: não se pode escolher um lado por conta própria, nem mesclar de volta no recovery um resultado de integração com risco pendente.

## Condições de conclusão

Só marque o Goal como concluído quando tudo for satisfeito:

- Todas as fontes da lista têm destino, sem descartes nem restaurações inexplicados.
- Todas as interseções foram adjudicadas; não há pendências que afetem a entrega.
- Todos os comportamentos aprovados para preservação foram implementados ou foi provado que já existe implementação equivalente.
- As adjudicações atuais explícitas de arquitetura e de produto são respeitadas.
- A revisão de funcionalidade por grupo (que pode ser organizada em lotes de baixo risco), a revisão bidirecional do todo e as verificações críticas foram concluídas; as evidências compartilhadas têm o escopo de cobertura explicitado.
- As regressões críticas encontradas foram resolvidas; as limitações de verificação foram registradas com honestidade, sem escrever como aprovado algo que não foi testado.
- O código e os registros foram commitados e o resultado da integração foi mesclado de volta no recovery com segurança; sem push automático.

A cobertura de testes faltante existente do Todo102 continua sendo gerenciada separadamente. As verificações críticas que esta rodada de merge precisa completar não podem ser contornadas transferindo a responsabilidade ao 102.

## Pontos de entrada de execução e evidências

- [Decisões por grupo e ledger de execução](../research/todo103-staging-integration-ledger.md)
- [Lista de fontes fixas](../research/todo103-staging-source-inventory.json): 193 commits não-merge, 60 commits de merge, 941 caminhos de mudança líquida do staging; incluindo os cancelamentos líquidos históricos e os conflitos explícitos, total de 950 caminhos investigados.
- A lista é recalculada com SHA fixo: 235 caminhos alterados pelos dois lados, sendo 107 conflitos explícitos e 128 caminhos de merge automático alterados pelos dois lados. A contagem menor de interseções da primeira varredura oral não serve como base de aceitação.
- `pending` significa que a adjudicação ou a verificação de evidências ainda não foi concluída. O agrupamento é apenas roteamento de investigação e não indica que o grupo inteiro foi aceito; um arquivo pode atravessar grupos e os trechos funcionais devem ser verificados separadamente.

## Formar cedo um candidato e preservar o histórico real de merge

O branch de integração independente parte do baseline fixo do recovery; todos os commits de grupo já concluídos são preservados. Depois de fechar o lote sujo atual, executa-se um `git merge --no-commit --no-ff` normal sobre o staging fixo, sem esperar a portagem ou a aceitação item a item das demais fontes. As mudanças independentes são preservadas em lote, e sobre o candidato completo verificam-se todos os conflitos explícitos, interseções do merge automático, dependências de interfaces antigas e riscos de aplicação duplicada; depois disso, complementam-se as reconexões e os testes necessários por funcionalidade. Não se commita à força código parcial em um index com conflitos não resolvidos; quando os conflitos forem resolvidos, forma-se um commit de merge real e segue-se a aceitação completa do candidato.

Não se usa `merge -s ours` para falsificar a conclusão do merge, não se commita marcadores de conflito e não se substitui adjudicação por ours/theirs de arquivo inteiro. Um candidato somente leitura de `merge-tree` não é código entregável e muito menos pode ser tratado como implementação aprovada. Por fim é preciso provar que o staging fixo é ancestral do resultado da integração e que todas as fontes têm destino.

## Status de aceitação

- [x] Fixar os SHA das duas pontas; branch independente e área de trabalho limpa; verificação de frescor do baseline.
- [x] Criar uma lista de fontes revisável contendo não-merge / merge / arquivo / conflito.
- [x] Fechar o lote atual e iniciar o merge real do staging fixo: checkpoint `c4f8619d96`, `MERGE_HEAD=790884b1ce`; resultados existentes preservados, sem esperar a portagem/aceitação item a item das fontes.
- [x] Resolver os conflitos do candidato e formar um commit de merge real completo e executável: `e1c611be98`, com os pais sendo o checkpoint `c4f8619d96` e o staging fixo `790884b1ce` (o que não equivale à aceitação final). O progresso está nas seções 24 a 43 do ledger e na lista real-merge-candidate; o merge normal já preservou em lote as mudanças independentes e as interseções foram reconectadas pela interface atual. As 193 fontes não-merge registram adjudicação/implementação/verificação por grupo; a revisão final em nível de arquivo e as aceitações críticas de plataforma continuam em andamento, sem substituir a conclusão pela contagem de conflitos igual a zero ou por aprovação parcial.
- [x] Todos os grupos de funcionalidade concluíram a verificação de código atual e a adjudicação, e todas as fontes têm destino (ledger §43–44; os arquivos de origem distinguem adjudicação/implementação/verificação, sem que a verificação seja concluída automaticamente por isso).
- [ ] Implementação, testes, revisão por grupo e commit dos comportamentos aprovados para preservação.
- [x] Merge real do staging fixo e verificação geral de protocolo / dependências / build (ledger §36–45; a instalação real no Windows não é build aprovado e continua no próximo gate).
- [x] Duas rodadas independentes de revisão de código, de staging → resultado e de refatoração → resultado (ledger §43–45; sem substituir as aceitações reais críticas ainda ausentes).
- [ ] Conclusão das verificações críticas; pendências sem impacto na entrega; merge de volta no recovery.
