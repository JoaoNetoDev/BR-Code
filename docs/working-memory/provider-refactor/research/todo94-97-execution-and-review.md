# Todo 94–97 — Registro de execução e revisão

> Atribuição mais recente (2026-09-09): o 95C foi concluído (`2c1addd3d8`); o 96 (Subagent explícito) foi concluído pelo Todo99; o 97 (migração do Wiki em uma única gravação em disco) foi concluído (`9cd1ae31dd`); os pequenos ajustes posteriores de layout e teclado (98) também foram concluídos (`a5fb82ec4a`). Todas essas entradas de desenvolvimento foram encerradas, e a verificação residual é apenas acompanhada pelo [Todo102](../steps/todo-102-verification-debt-closeout.md). O histórico é preservado por ordem cronológica; "três itens aguardando decisão", "a implementar" e "objetivo não concluído" não representam mais o estado atual.

## Escopo e restrições de execução

- Início do objetivo: 2026-09-08; baseline `00c5fa2e66`, branch `provider-refactor-e2e-recovery`, verificação de frescor no início aprovada.
- Ordem: 94 → 95 → 96 → 97. Cada item passou por teste, implementação, verificação e depois revisão item a item dos requisitos e das abstrações Provider / Selection.
- Pequenos bloqueios são registrados e o trabalho independente continua; semântica de novo produto ou fronteiras de protocolo exigem decisão explícita e não são expandidas por conta própria.
- Ao final, enviar o branch atual, revisar os Todos/commits dos últimos dois dias e avançar E2E executável no Pro.
- Fora de escopo: publicação Web, novel já recuperado e rascunhos antigos não autorizados. Modificações já existentes e não commitadas de código, testes e documentos são preservadas e não são misturadas neste commit.

## Progresso da primeira rodada e evidências (snapshot histórico; a conclusão atual está no topo)

| Item | Status | Tratamento e evidência | Pendente de verificação / decisão |
| --- | --- | --- | --- |
| 94 Limite de saída unificada do Wiki | Implementação e revisão concluídas | 15 arquivos / 160 testes unitários relacionados ao Wiki aprovados; duas E2E oficiais de Electron no Pro aprovadas; remoção de todo o caminho de orçamento privado | Attachment real no celular / Windows não reverificado em máquina real; a aprovação no Pro não substitui isso |
| 95 reasoning map | A/B implementados e revisados | 340 testes unitários de Provider/Option Map aprovados; no Pro, requisição real da nova variante, whitelist e regressão da configuração inteligente aprovados | A renomeação de variantes desligadas em C afeta Personal configs que cobrem apenas o Map; pedido de decisão em separado, não implementado e não conta como o item inteiro concluído |
| 96 Migração de Selection offline | Implementação central e revisão aprovadas; item de protocolo aguardando decisão | 438 testes no workspace raiz, 73 no Agent; duas E2E reais de interação no Pro aprovadas | O protocolo de resolução de Subagent explícito no Host aguarda decisão; não se escreve conclusão do núcleo como conclusão do item inteiro |
| 97 Migração dos campos originais do Subagent e auditoria global dos campos antigos | Implementação central e regressão ampliada aprovadas; itens globais aguardando decisão | Migração no local do diretório do usuário, codec oficial compartilhado, importação unidirecional do JSON embutido; 4 aprovações no Pro; ver todo97-selection-storage-audit.md | A leitura do Wiki sem gravação em disco conflita com o princípio de migração única em disco; aguarda decisão; celular/SSH real não verificados |
| Auditoria final e envio | A parte verificada foi enviada; objetivo não concluído | todo88-97-final-quality-review.md registra achados, correções e escopos não cobertos por commit/contrato; a0f686fc38 foi enviado ao branch atual | As três decisões continuam sem resposta; o objetivo não é marcado como concluído |

## Conclusão de design do Todo 94

```text
Wiki 选择 / 生成设置（无输出预算）
    -> 目标 Workspace 的 generateText
    -> Wiki 已解析的目标 Model maxOutputTokens Limit（原样传值）
    -> Option Map -> 实际 API 请求
```

- Catalog, Page, laço de ferramentas e compactação final compartilham este caminho e não calculam orçamento por conta própria. Ao rastrear
  até o ModelFactory, confirma-se que ele deliberadamente não vincula um valor de saída; por isso se mantém a interface existente em que o
  ModelClient lê o Limit da View de destino e o passa explicitamente; o Factory não é alterado e nenhum resolvedor de valor padrão é
  adicionado.
- O truncamento continua falhando, e maxRetries normal e deadline são mantidos; as tentativas de rescue extras foram removidas.
- O legacy generationOptions.maxOutputTokens é ignorado na leitura, não é carregado na escrita normal e o histórico não é reescrito em massa.
- A diferença já existente nos testes sobrepostos é a renomeação de supportsJsonSchemaOutput; esta rodada não a desfaz e também não se
  atribui a autoria dessa alteração.
- Foi encontrado e corrigido o `BUILTIN_MODEL_PROVIDER_IDS.zai` desatualizado nos testes do Wiki: o valor em execução é undefined, o que
  poderia gerar uma aprovação falsa; passou-se a usar um Provider de teste nomeado.
- O teste vermelho inicial do ModelClient fixou o orçamento antigo de catálogo 16384 / corpo 8192; as novas asserções exigem que os dois
  caminhos usem tal e qual o Limit 32000 do modelo de teste, e 12 testes passaram.

### Verificação e segunda revisão do Todo 94

- Testes unitários finais relacionados: `pnpm exec vitest run packages/services/test/repoWiki packages/ui/test/repoWiki packages/shared/test/repoWiki.test.ts --reporter=dot --silent`, 15 arquivos / 160 aprovados. Cobrem os dois tipos de requisição, vários limites de modelo, laço de ferramentas/fallback estático/compactação final, leitura de Wiki/Draft antigos sem gravação e remoção do orçamento antigo no salvamento normal, truncamento com retry normal, cancelamento e timeout.
- Diretório isolado no Pro `/tmp/zcode-todo94-97.qBney3`, com origem no HEAD do baseline mais as diferenças de código atuais; o workspace original do Pro e os dados do usuário não foram modificados. O download de dependências esbarrou em erro de chaveiro SSH, sem desbloquear nem alterar credenciais; foram reaproveitadas as dependências do repositório isolado existente com lockfile SHA256 idêntico, e o código de desktop atual foi reconstruído.
- E2E oficiais no Pro: generation-settings e generation-produces-wiki aprovadas. Diretório de evidências:
  `packages/desktop/.e2e-artifacts/desktop-e2e-20260908161324585-p92955-4b3566c99ee6dd7f` (dentro do diretório isolado do Pro acima). Na primeira execução o caso de geração ainda clicava em um único menu de variante desabilitada, enquanto a UI atual é um valor fixo, e a falha foi por teste obsoleto; ajustado para validar o valor fixo e reexecutado com aprovação, sem modificar o comportamento de inferência do produto.
- Segunda revisão: não há mais sobrescrita de orçamento do Wiki em catálogo/corpo/página de falha/auto-refresh; o ModelConfig obtém o Limit da View de destino, o ModelClient o passa tal e qual, e a validação final do Model e o Option Map permanecem inalterados. Não há valor padrão no Factory, caso especial de Provider, sincronização de envio remoto nem troca de modelo durante a execução.
- A UI removeu duas entradas e os textos bilíngues de um componente compartilhado, sem novos estilos; não é possível, com isso, afirmar que máquina real no celular, Windows ou requisições reais de fornecedor foram verificadas. A E2E usa mock L2, e os campos reais da API continuam sob responsabilidade dos testes de contrato do Map existente.
- O escopo do commit exclui modificações não commitadas preexistentes, como a renomeação de supportsJsonSchemaOutput; o commit específico é rastreável pelo histórico Git do commit do Todo94 e deste registro de execução.

## Implementação e revisão A/B do Todo 95

- Vermelho: fixaram-se primeiro 19 expressões dedicadas antigas e todas as posições de regra; o teste de equivalência com a configuração antiga passou e os testes de requisição dos três fallbacks de API ausentes falharam. Depois só a configuração foi modificada, com revision 10 → 11, evitando conteúdo diferente na mesma revision.
- `pnpm exec vitest run packages/provider-node/test packages/provider/test packages/model-option-map --reporter=dot --silent`: 24 arquivos / 340 aprovados. Entradas dedicadas válidas são comparadas uma a uma com o JSON final; os dois bodies básicos testam campos vazios e já existentes, orçamento e null, para que omissão não seja confundida com remoção. Valores inválidos são rejeitados pela validação comum; o Map não adivinha a variante máxima.
- O teste antigo de integridade afirmava que a expressão continha `"effort": "max"`, o que não se aplica mais à passagem direta; passou-se a afirmar a requisição correspondente após compilação e execução, em vez de reduzir a verificação à existência da string.
- No Pro: C91-04 e SC90-01 de `desktop-e2e-20260908162732756-p93660-3b18fc076970b932` passaram. O novo caso travou duas vezes porque o setValue do WebDriver limpava o campo e o editor inline saía do modo de edição; confirmado que a entrada entrou em modo de edição, e após usar seleção e substituição por teclado, `desktop-e2e-20260908163135228-p95033-03a4490e97708607` passou e capturou a requisição real de Model. Não é um afrouxamento do Map nem um contorno do salvamento.
- Novo caso pending `provider-reasoning-fallback.test.ts`: adiciona realmente um modelo desconhecido e escreve apenas values=[high]; o map Personal continua ausente por padrão, o corpo de rede contém quatro conjuntos de campos high, o modelo original, o prompt de probe original e saída 5000 (orçamento da chamada auxiliar existente), sem orçamento de raciocínio, e a configuração não foi reescrita pela requisição de teste. Não depende de cota real; aguarda revisão humana e não foi promovido arbitrariamente.
- Comparação mecânica de diferenças: removendo a revision e o reasoning map, o JSON Built-in antigo e o novo são idênticos. O domínio de valores das Rule dedicadas, o casamento API/site/template/Provider, a prioridade, as capacidades do modelo e o Map de maxOutputTokens não foram tocados; o Runtime não teve alterações.
- A única mudança real de semântica é o fallback: quando um modelo conhecido não tem Map dedicado em determinada API, o resultado passa de `{}` para campos explicitamente desligados; esse é o limite B já confirmado, e não se afirma que todas as APIs compatíveis ficaram sem perdas. O Map-only do usuário e a configuração fixa continuam sendo sobrepostos com autoridade pelo Overlay original.
- C não implementado: foi perguntado se o adiamento da renomeação de variantes desligadas continuaria ou se o desenho seria retomado com compatibilidade de origem; sem resposta, mantém-se off/nothink e o none nativo fica intacto. Não se pode esconder C atrás do registro de conclusão de A/B.
- A integração do Subagent explícito do Todo96 teve pedido separado: recomenda-se que, antes de o Agent iniciar uma subtarefa, a resolução seja delegada ao getView público do Host dono e congelada, sem alterar a configuração e sem voltar ao modelo do pai; exige uma extensão estrita de protocolo, aguardando decisão do usuário.

## Registro de processo do Todo 96 (ainda não concluído)

- Primeiro grupo de testes de identidade compartilhada/Bot: 5 arquivos / 37 aprovados; mesmo com candidato vazio, a string antiga mantém identidade, modelo e variante explícitos. A remoção do contexto de migração do BotsRepo e do readMigrationAccountAccess do Host não afeta a migração real de configurações de conexão/OAuth.
- Automation/Wiki: removidos callbacks de injeção usados apenas para a migração, substituídos por armazenamento + transformação estática; 2 arquivos / 76 aprovados (a execução completa ainda precisa ser repetida). Mantidos a prioridade do novo campo, a distinção entre SQL NULL e JSON null, o CAS e a não reescrita de arquivos antigos.
- Session: primeiro foram acrescentados testes reais de recuperação em SQLite, reproduzindo três perdas de intenção original (Provider removido, modelo removido, variante inválida). Após a correção, 12 passaram; o Runtime ainda vincula apenas a seleção cuja validação no Registry teve sucesso, e o resultado da recuperação devolve a intenção salva.
- O Session Store removeu o callback de parsing de migração e manteve transação/CAS; os antigos testes de espera assíncrona de conta foram trocados por testes de importação offline sem interface de conta, idempotência concorrente e prioridade da nova seleção.
- A verificação de todo o repositório com knip reportou itens não usados já existentes, sem remoção em massa com base neles; dep:refs indicou referências de Host para os símbolos de protocolo, mas perdeu o workspace do Agent independente, e por isso foram usados rg extras para rastrear imports do Agent, strings de protocolo e testes, evitando remoções erradas.

### Verificação central e segunda revisão do Todo 96

- Workspace raiz, 28 arquivos / 438 aprovados: grupo completo de Bot, Subagents, Automation Repo, Wiki selection, ZCodeAgentService, identidade compartilhada, Account resolver, despacho do Host e Draft control. Agent, 6 arquivos / 73 aprovados: migração SQLite real, recuperação App/Protocol, inicialização de Subagent e recuperação fria. Na primeira execução dos testes do Agent atingiu-se o dist antigo de adapters; após reconstruir contracts/adapters a execução foi repetida, sem mascarar build antigo mudando asserções.
- `pnpm typecheck` da raiz, `pnpm lint` e typecheck do bootstrap do Agent aprovados; Lint com 41 warnings / 0 erros. A limpeza final de itens já não usados é contada à parte, sem afirmar zero warnings em todo o repositório.
- Removidos o RPC `session/resolveLegacyModelProvider`, o callback de montagem do Host e a injeção do Agent, todos dedicados apenas à migração antiga; a migração real de conexão de conta/consulta OAuth não foi tocada. O teste de recuperação do Protocolo cobre ao mesmo tempo continuous/replayable e afirma que a recuperação não dispara esse RPC de migração.
- O cache global entre Workspaces do menu de Bot exibia modelos de outro Host quando a View de destino falhava; o cache e o caminho de empréstimo local foram removidos, a seleção persistida original fica inalterada e a releitura funciona normalmente quando o destino é recuperado. O teste de regressão salva explicitamente um contexto real de Bot e cobre o mesmo caminho com identidade remota diferente, sem fingir troca bem-sucedida com um contexto de teste não persistido.
- Pro `desktop-e2e-20260908170825961-p95934-accbbb3745ff04c4`: SR87-01 e SR87-06 / SM96-02/05, duas aprovações. No segundo caso, após o Electron isolado ser encerrado, foi implantada uma seleção antiga em SQLite; a Team atual não afeta sua migração fixa para Individual, a requisição real do Run now usa Team/high, e a intenção original da tarefa e a coluna antiga de rollback são preservadas. Casos pending não foram promovidos automaticamente.
- Segunda revisão: sem nova versão de armazenamento; sem modificar mensagens históricas, seleções em execução ou Ticket de Off-Peak; sem adicionar sincronização antes do envio. A validação final do Registry no Runtime é mantida, mas a intenção original deixa de ser removida do resultado da recuperação por causa dela. Foi removida a chamada pré-migratória redundante de listAutomations antes do despacho do Desktop; o ensureReady real do Repo garante a conclusão da migração offline.
- Restante: o protocolo público de resolução do lado de execução para o Subagent explícito aguarda decisão; a importação do Markdown atual em memória será substituída pela migração no local do diretório do usuário do Todo97, e esse estado transitório não será tratado como conclusão final. SSH real e máquina real no celular ainda não foram reverificados.

## Implementação central e segunda revisão do Todo97

- Codec Markdown oficial compartilhado e migração de arquivos no Node; o Host e o Agent independente processam primeiro o diretório do usuário, e projeto/plugin não entram no escopo de escrita. Removidos a conversão de identidade em memória de todo o profile, a dupla leitura do estado intermediário em Markdown e o parser duplicado do Host.
- O JSON embutido é importado primeiro de forma unidirecional e gravado em disco, e só então o novo map é lido oficialmente; valores novos vazios/inválidos/sem variante não podem ressuscitar do map antigo de rollback.
- O rastreamento por armazenamento está em [tabela de auditoria](todo97-selection-storage-audit.md). O thoughtLevel da entry de Session foi confirmado como uma forma já publicada no staging, e foi movido do codec comum para a entrada de migração SQLite; o decoder de exibição de mensagens históricas é mantido, sem confundi-lo com a recuperação da seleção atual.
- Regressão ampliada com 61 arquivos/900 testes na raiz e 17 arquivos/201 no Agent aprovada. A segunda revisão acrescentou um teste vermelho de ambiguidade de codificação de Provider ID com prefixo custom:, e após a correção 3 arquivos/25 testes compartilhados passaram. typecheck/lint da raiz e typecheck do bootstrap do Agent aprovados.
- Pro `desktop-e2e-20260908172422561-p96860-3f1d8f499a4468d5`: três SE mais I20, quatro aprovações, validando separadamente os artefatos salvos e a requisição real do child; a execução final do código `desktop-e2e-20260908173630157-p97784-4db43b3562850f6d` também aprovou as mesmas quatro.
- Os pequenos bloqueios seguem registrados: a leitura de arquivos antigos do Wiki sem gravação em disco conflita com o princípio de gravação única em disco do 97, e uma decisão foi solicitada sem reescrita não autorizada. Máquina real no celular e SSH real não foram testados. Estados intermediários não publicados não são revertidos por migração, e a exceção dos Tickets de Off-Peak não muda.

## Regressão combinada final e revisão de qualidade recente

- [Revisão de qualidade do Todo88–97](todo88-97-final-quality-review.md) foi registrada em disco, incluindo dois casos novos de compatibilidade excessiva de campos introduzidos nesta própria rodada e achados da segunda revisão; eles foram restringidos com testes negativos. 13 arquivos/184 testes e 5 arquivos/25 da UI do Wiki passaram, com typecheck/lint da raiz aprovados (39 warnings/0 erros). As modificações já existentes e não commitadas foram mantidas, e apenas os dois itens não usados desta rodada foram limpos.
- Complementos recentes de configurações/conta: 29 arquivos/420 testes; complementos de migração de conexão e seleção: 6 arquivos/62 aprovados; os grupos têm sobreposição e as contagens não são somadas.
- Pro `desktop-e2e-20260908173912732-p98589-498cb410db57162d`: 13 aprovadas, 1 remota real pulada; após reconstruir com o código final, `desktop-e2e-20260908174309069-p99900-5e27de7ecbaf9767`: duas do Wiki, uma do Probe, uma do fallback de API e uma do Subagent I20, 5/5 aprovadas.
- Commitados: 94 `a56dc32c26`, 95A/B `9b0f11e996`, 96 núcleo `dd38abe9fb`, 97 núcleo `0c32ba2b59`. Os patches de segunda revisão e o resultado do envio são rastreados pelos commits correspondentes e pela resposta final; decisões pendentes não são escritas como implementação concluída.

### Envio e reverificação das versões commitadas

- Após os patches de segunda revisão, `a0f686fc38` passou por `git push origin HEAD:provider-refactor-e2e-recovery`. O lint de pre-push e os testes diretos/relacionados disparados pelos 103 arquivos alterados passaram, sem contornar hooks; o remoto real avançou de `7cd5f57462` para `a0f686fc38`.
- Sete arquivos de código/teste sobrepostos no workspace original tinham modificações não commitadas do usuário e não foram misturados no commit. Na cópia isolada do Pro esses sete arquivos foram substituídos pela versão do HEAD e, em seguida, rodaram-se os testes de Wiki, importação de Provider antigo e protocolo: 11 arquivos/198 aprovados, evitando depender de modificações não commitadas para um verde falso.
- Esta rodada não enviou m2, não fundiu o staging subsequente nem publicou a Web; os itens de celular/SSH real pulados e a revisão manual pending não foram tratados como concluídos. O objetivo permanece active, aguardando as decisões de 95C, 96 (protocolo) e 97 (Wiki).

### Reverificação do lado de execução do SA97-09

- Em `packages/bootstrap/tests/subagents.test.ts` do Agent foi completada a comparação de usuário/projeto/plugin na mesma rodada de carregamento: três arquivos antigos de Provider idênticos, duas execuções reais consecutivas do loader, arquivo do usuário alterado apenas na parte de Provider do model, e bytes do arquivo de projeto/plugin e a identidade antiga explícita inalterados. Isso não é apenas um julgamento pelo grafo estático de que plugin não migra; este item não se passa por verificação da requisição real da subtarefa.
- Dois arquivos relacionados de inicialização/loader do Agent, 9 testes aprovados; `pnpm typecheck` da raiz, `pnpm lint` (39 warnings/0 erros) e typecheck do bootstrap do Agent passaram novamente. Esta rodada apenas reforçou testes de proteção de escopo já decidido, sem alterar comportamento de produto e sem cruzar as três fronteiras aguardando decisão.