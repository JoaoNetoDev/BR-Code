# Todo 85: restauração de funcionalidades após o revert da merge de staging e auditoria item a item

> Atualização de atribuição de verificação (2026-09-09): as pendências residuais de subteste/falha/promoção manual deste documento foram transferidas uniformemente para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente previsto aqui; as evidências históricas são preservadas e a transferência não significa que os testes passaram. A antiga cláusula de suspensão para Subagents explícitos foi substituída pela implementação do Todo99; a exceção do Off-Peak Ticket e a fronteira de não adicionar sincronização pré-envio permanecem inalteradas.

> Status: restauração e auditoria item a item concluídas em 2026-09-07; as evidências de entrega e as exclusões explícitas estão na tabela de auditoria de restauração.
> Ponto de partida: `a43049c265`, branch `provider-refactor-e2e-recovery`, contendo o trabalho de restauração anterior e as alterações não commitadas de outras tasks.
> Progresso mais recente: os 65 arquivos e o tratamento manual associado têm atribuição e destino final. Recuperação de redemption/conta, navegação, MCP, CUA, Hook, anexos e Goal foram commitados; D02/Todo87 já foram integrados à camada comum, ao Composer, à Automation, ao Bot, ao Wiki e à proteção somente leitura ociosa. D01 explicitamente não é restaurado; o mapeamento automático de Subagents explícitos e a migração entre contas/Ticket em período ocioso são explicitamente excluídos. O último reteste do Air em quatro grupos deu 12/12; as demais verificações e as combinações de ambiente real ainda não cobertas foram registradas com fidelidade, o que não equivale a uma regressão total do produto.

## Objetivo e escopo

Rastrear os reverts e o tratamento manual daquela merge de staging e restaurar os comportamentos corretos que foram perdidos sem decisão. O staging é preservado por padrão; só se adapta ou se submete a decisão quando há conflito com a arquitetura atual de Provider ou com a semântica de produto explicitamente alterada. Não se pode devolver indistintamente ao usuário a decisão sobre adaptação técnica.

- Staging da época: `16d999f6a48b180b691a4d909479c063580d2ad0`.
- Merge `aaa68edbca`: o primeiro pai `88fdfc34e0` era o branch corrente da época e o segundo pai é o staging acima. Não se pode inverter os pais nem representar o staging pelo primeiro pai.
- Revert da merge `7016d1e09a`, envolvendo 50 arquivos.
- Commit misto de plugin `b9118cc192`, revert `cb16b3c8fd` e UI complementada depois `2ee9b8d0c6`.
- Tratamento manual `0ed79bae57` (SessionPane) e o patch associado; buscar ao longo do histórico outros tratamentos de conflito da mesma espécie, e qualquer escopo novo registrado deve indicar sua origem.
- Não incorporar o staging adicionado após a linha de base fixa, não executar o Todo 80 e não reescrever toda a arquitetura de Provider/Session com isso.

Um commit presente no ancestry não é prova de que a funcionalidade foi preservada; a existência de um revert também não é prova de falta atual. Cada item precisa ser rastreado até o código atual e os patches posteriores.

## Execução e registro

```text
patches de revert/tratamento manual -> agrupar por funcionalidade original -> buscar intenção original e cadeia de chamadas
  -> rastrear restauros posteriores -> comparar com a implementação atual
  -> preservação completa / implementação equivalente / pendente de restauração / pendente de decisão
  -> escrever spec, testes de restauração, adaptar código -> verificar -> rever ao contrário -> atualizar o registro
```

O processo detalhado é escrito uniformemente na [tabela de restauração e decisões](../plan/staging-conflict-restoration-audit.md), sem criar várias conclusões contraditórias. Cada grupo registra o commit original, o local do revert, o comportamento original, o resultado atual, o motivo da decisão, o local no código, o resultado dos testes e o próximo passo. Complementar com um índice arquivo a arquivo, garantindo que cada arquivo dentro do patch de revert tenha uma funcionalidade e um destino.

1. Montar a lista completa. Auditar primeiro os dois reverts e o tratamento manual, sem usar a diferença total entre os dois branches para fingir a dimensão do incidente.
2. Concluir primeiro os itens de preservação direta. Restaurar o fluxo completo de montante e jusante por funcionalidade; em arquivos mistos, migrar apenas os comportamentos relacionados. Verificar as diferenças antes em arquivos já modificados por outras tasks, sem sobrescrever o trabalho paralelo.
3. Adaptação de arquitetura. Manter ModelSelection, o Host Registry alvo, Account State/Overlay, a configuração esparsa e as fronteiras de migração já estabelecidas; não restaurar o antigo Provider Store, o antigo Runtime Config nem a seleção automática de modelo em estilo Account-first.
4. Itens que exigem decisão. Registrar o comportamento concreto do usuário, o conflito com as convenções atuais, as opções possíveis e a recomendação; pausar o item e seguir com os demais itens independentes. Decisão mais recente de 2026-09-07: D01 não restaura a sincronização remota pré-envio; D02 já foi implementado por [Todo 87](./todo-87-selection-view-unified-resolution.md), sem restaurar o antigo helper de troca de modelo. Não há item de produto bloqueante em aberto.
5. Verificação e revisão. Começar pelos testes direcionados que provem o problema original e depois fazer typecheck/lint; validar a interação em uma árvore de E2E independente no MacBook Air, preservando a versão do build e os resultados. Preservar Desktop continuous / Web replayable e o isolamento por workspaceIdentity. Não registrar "o código existe" ou "os tipos passaram" como um E2E real aprovado.
6. Commit por funcionalidade. Commitar apenas as alterações verificadas como pertencentes a esta task, preservando o trabalho de terceiros; não marcar como concluído se a verificação falhar. Cada commit acompanha o trailer da sessão real do Agent.

## Condições de conclusão

- Cada arquivo de revert/tratamento manual localizado tem um destino, todas as funcionalidades têm conclusões com evidências e não resta um vago "é preciso verificar".
- Todas as lacunas determináveis e implementáveis foram tratadas, com registro dos testes antes e depois da restauração e da revisão geral.
- Os itens em aberto foram analisados até o nível em que o usuário possa fazer uma escolha concreta, sem deixar a investigação técnica para o usuário.
- Bloqueios de ambiente e falhas reais de teste são registrados separadamente, sem alegar conclusão; o relatório final deixa explícito o que ainda não foi restaurado, o que está pendente de decisão e o que está pendente de verificação.
- Esta task não usa como critério de sucesso da restauração "todos os commits do estão no histórico" nem "apenas rodei os testes unitários".