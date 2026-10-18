# Todo 64: reparo da execução real do Provider E2E e fechamento das evidências

> Status atual (2026-09-09): este Todo de verificação foi encerrado, e os itens restantes são tratados exclusivamente pelo [Todo102](todo-102-verification-debt-closeout.md), sem mais agendamento próprio. O status e as falhas abaixo são registros históricos, e o encerramento não significa que a falha original tenha passado.

> Status: concluído
>
> Data: 2026-09-02
>
> Baseline: `64d48f6eee`
>
> Relatório de implementação: criado sincronamente durante a execução
> `todo-64-provider-e2e-real-run-repair-closeout-implementation-report.md`
>
> Pré-requisitos: o Todo 52 concluiu a primeira rodada da migração E2E; o Todo 59 removeu a regra de seleção Account-first do Renderer; o Todo 60 removeu o reasoning budget fixo; o Todo 63 fechou a semântica de invalidação de Selection e o orçamento de requisições. Este Todo se baseia no resultado de execuções WDIO reais em um MacBook Pro, reparando o drift de testes, a implementação residual e bugs de produto realmente necessários.

## 1. Objetivo

Esta rodada não é deixar verde de forma mecânica as asserções que falharam, e sim fazer o E2E oficial do Desktop provar novamente a arquitetura atual de Provider:

```text
entradas reais de Config / Account / Personal
                    |
                    v
          Effective Provider Registry
                    |
                    v
     Host preferredSelection / Active Model
                    |
                    v
       comportamento da UI do Desktop e das requisições reais de modelo
```

Ao final, é preciso ser capaz de distinguir:

- o teste ainda constrói um Provider de API de Account antigo já removido ou um estado de Selection antigo;
- o Helper compartilhado ainda afirma campos de requisição já removidos;
- a condição de espera do teste não espera o estado oficial de Registry/Selection;
- problemas independentes de produto ou de teste, sem relação direta com Provider, descobertos por esta execução real;
- código de produção que realmente viola o Design atual.

Não se restaura o Schema antigo de Family, o branch Account-first do Renderer, o `budget_tokens` fixo, o seed antigo de Provider ou um segundo Registry só para fazer os testes passarem.

## 2. Princípios de execução e limites de parada

Este Todo carrega simultaneamente "reparo" e "localização", mas os dois devem ser estritamente separados:

```text
causa raiz, contrato e direção do reparo já claramente definida
                |
                v
fixar primeiro o teste que falha ou preservar a evidência de falha existente
                |
                v
reparar de forma completa o código de produção / Fixture / Helper
                |
                v
remover resíduos de mesma origem e concluir a regressão

causa raiz ainda não claramente definida
                |
                v
isolamento do Case + evidência de runtime
                |
                v
a causa raiz é única e o reparo é natural e compatível com o Design existente?
        |                           |
       sim                         não
        |                           |
        v                           v
fixar a evidência de falha e     não alterar semântica de produção
reparar diretamente                   nem asserções
                              registrar a evidência e pedir decisão
```

Na execução, respeite os seguintes limites rígidos:

1. Questões já decididas precisam ser reparadas por completo, sem atalhos como afrouxar asserções, restaurar campos antigos ou adicionar especializações de produto; o polling de Personal Config permite de 1 a 3 segundos de propagação limitada, conforme a decisão posterior.
2. Questões não localizadas precisam provar primeiro o ponto de falha mais inicial; não se pode adivinhar a causa raiz em produção a partir do timeout final da UI.
3. Se a evidência aponta unicamente para a Fixture, o Helper, a condição de espera ou o isolamento do caso de teste, e o reparo não altera o contrato de produto, ele pode ser feito diretamente.
4. Se o reparo alterar a semântica de produto de Provider, Model Selection, Repo Wiki, Compact, Quota ou Account, interrompa o item imediatamente e peça uma decisão.
5. Após cada reparo, revisar os chamadores e testes de mesma origem e remover branches de compatibilidade já inválidos, Helpers duplicados e asserções residuais.
6. Cases já aprovados não podem ter sua semântica alterada para acomodar um Case que falha; é preciso provar com os grupos afetados e o conjunto final que não houve regressão.
7. O relatório de implementação precisa ser mantido durante toda a execução, e não escrito de memória no final.

## 3. Baseline da execução real

No MacBook Pro, com diretório de execução limpo e o commit `64d48f6eee`, o Desktop WDIO foi executado agrupado por spec. Para cada spec, foi tomado o resultado da última execução:

| Resultado        | Quantidade |
| ---------------- | ---------: |
| Passou           |         43 |
| Falhou           |         12 |
| Pulado por ambiente |       1 |

O pulado por ambiente é o cenário de Remote SSH. Ele não pode contar como aprovação, mas também não pode ser julgado como falha de produto na ausência das credenciais do alvo; continua marcado como `blocked-environment`, e o comando reproduzível é preservado.

Os principais encadeamentos de Provider já aprovados incluem:

- Bot terminal, cartões interativos do Feishu e lifecycle de streaming;
- a maior parte dos cenários das páginas principais de Coding Plan/Team Plan, de Usage, Quota e da recuperação de OAuth;
- recuperação a frio da Context Window;
- orçamento principal de Model Output Token e dois grupos de smoke reais de múltiplos turnos;
- recuperação e troca de Turbo;
- o WebView de Coding Plan Upgrade, que passou depois de corrigir o ambiente de execução;
- criação e gestão de Automation.

Portanto, esses encadeamentos já aprovados não podem ser modificados de novo para acomodar casos que falham.

## 4. Status de decisão das 12 falhas atuais

| Categoria             | Case                | Falha atual                                       | Decisão atual                                                                                     |
| --------------------- | ------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Template/UI           | MP-UI-01            | depois de criar, não volta aos detalhes do novo Provider | localizada e reparada: o teste usa detalhes de Provider que podem não ter botão de edição de nome, e passou a afirmar pela identidade de navegação selecionada |
| Model JSON UI         | MP-UI-06            | esperava `"{}"`, recebeu string vazia            | definida: atualizar a asserção antiga de placeholder                                            |
| Template + primeiro envio        | I08                 | a espera pelo salvamento da Personal Rule nunca é satisfeita | localizada e reparada: o Helper lia `maxOutputTokens.default` errado, e o campo oficial é `.max`      |
| Repo Wiki             | Repo Wiki settings  | `ready-empty` não aparece                        | definida: remover a asserção E2E sem modelo e não essencial, sem adicionar uma Fixture sem Provider  |
| Repo Wiki             | Repo Wiki produces  | o botão de gerar continua disabled               | definida: a seleção de modelo perde o reasoning e passa a reaproveitar a Completion de Selection unificada |
| Output Token          | OTB08-OTB10         | OTB09 ainda afirma o cap antigo de 41,665        | localizada e reparada: a âncora de usage já cobria o assistant anterior, e o valor correto é 41,671 |
| Reasoning             | I20                 | o Helper exige `thinking.budget_tokens`          | definida: remover a asserção compartilhada sem base de contrato                                   |
| Restart Selection     | I26                 | o Recent completo do Team Plan não é recuperado  | definida: seed completo + readiness do Registry; só se ainda falhar é que a cadeia de recuperação de produção é reparada |
| Restart Fallback      | I27                 | depois do Recent antigo do Start Plan invalidar, ainda espera o primeiro modelo de Account | corrigido para voltar ao Configured Default do Host, sem restaurar o Account-first do Renderer     |
| Restart Fallback      | I28                 | depois do Recent de modelo removido invalidar, ainda espera o primeiro modelo de Account | corrigido para voltar ao Configured Default do Host, sem restaurar o Account-first do Renderer     |
| Settings Transition   | I31                 | o modelo não-primeiro do Team Plan não é mantido | definida: passa a verificar a ida e volta pela página de configurações e remove o transition state sem consumidor |
| Quota Reminder        | QR-E2E-09           | o reminder da primeira reset opportunity não aparece | passou isolado e na spec completa de Coding Plan, é ruído de isolamento de execução antiga, sem mudança de produção |

As falhas iniciais de CPUW-01/03 vieram do ambiente de execução do WebView e ambas passaram na reexecução com o mesmo código, entrando assim fora do escopo de reparo de código. Se falhar de novo, primeiro repare o ambiente de execução ou a Fixture e não restaure o comportamento antigo da API de Account.

As 12 falhas iniciais receberam evidência definida. O reparo envolveu apenas bugs de produção sob o contrato atual, drift de teste/Fixture/Helper e isolamento de execução; não restou nenhuma questão em aberto que exigisse nova semântica de produto.

## 5. Semântica única de seleção de modelo

### 5.1 Prioridade geral

```text
seleção explícita do Draft atual (válida)
              |
              v
Workspace Recent Selection (válida)
              |
              v
Host ModelSelectionView.preferredSelection
```

O `preferredSelection` do Host continua tendo uma única regra geral:

```text
Configured Default válido
          |
          +-- existe --> usá-lo
          |
          `-- não existe/inválido
                    |
                    v
          primeiro Provider visível do Registry ordenado
                    |
                    v
          primeiro modelo disponível desse Provider
```

Os Account Providers já são ordenados antes dos Providers comuns, e o modelo recomendado já é ordenado antes dos outros modelos do mesmo Provider. Portanto, sem um Configured Default válido, o fallback geral do Registry pode cair naturalmente no modelo recomendado do Account Provider atual. Esse é o resultado de uma ordenação unificada, e não uma especialização Account-first do Renderer.

O Account Overlay só muda os fatos de acesso à conta do Provider, o entitlement e a associação de modelos; o Renderer não entende Start, Individual ou Team e não lê por conta própria a Account Connection para escolher `models[0]`.

### 5.2 Completion de reasoning da nova Selection

`completeNewModelSelection()` é a única entrada de completion para criar uma Selection completa:

```text
entrada providerId + modelId
          |
          v
encontrar o Model alvo no Registry
          |
          +-- já tem reasoningLevel --> manter como está
          |
          `-- sem reasoningLevel --> pega o values.at(-1)
```

`reasoningLevel.values` é ordenado do mais baixo ao mais alto, então uma seleção nova de usuário comum recebe por padrão o último nível. Modelos auxiliares como título e Git Commit continuam usando diretamente `values[0]` quando precisam explicitamente do nível mais baixo disponível; os dois comportamentos não podem virar uma política global única.

A seleção de modelo do Repo Wiki precisa reaproveitar essa entrada, e não pode apenas salvar `providerId/modelId` nem deduzir `values.at(-1)` copiando a lógica no Renderer.

### 5.3 I26

O Recent Selection de I26 aponta para um modelo não-primeiro ainda válido dentro do Team Plan atual. O objetivo não muda: preservar essa seleção completa após o cold start.

Passos do reparo:

1. O Seed escreve o `providerId + modelId + reasoningLevel` completos.
2. O Account Scenario fornece explicitamente aquele Team Provider e os membros de modelo.
3. Esperar que a revision do Effective Registry já contenha o modelo e só então afirmar a barra de ferramentas.
4. Após o primeiro envio, afirmar que a requisição real continua roteada para aquele Provider/Model/Reasoning.

Só se essa entrada completa ainda voltar ao modelo padrão é que se trata de bug na cadeia de recuperação de produção; a expectativa não pode ser alterada antes.

### 5.4 I27 / I28

A expectativa antiga dos dois Cases pressupõe a regra Account-first já removida. A semântica oficial atual é:

```text
Recent inválido
    +
Configured Default = DeepSeek e válido
                    |
                    v
              Host preferredSelection
                    |
                    v
             Configured Default
```

- I27: o Recent é uma seleção antiga do Start Plan já invalidada.
- I28: o Recent é um modelo que já foi removido dos membros do Provider.

O reparo completa a Fixture com o replay do DeepSeek e espera e afirma a requisição real por identidade de Provider/Model; o branch Account-first não pode ser restaurado no Renderer. Só quando o Configured Default não existe ou é inválido a ordem de publicação do Registry assume o fallback final.

### 5.5 I31

O que o I31 realmente faz hoje é: com Team Plan/`GLM-5.3-Flash` já selecionado, abrir a página de configurações, selecionar o mesmo Team Plan de novo e esperar que o modelo seja mantido.

O problema original tem duas camadas:

1. O Select nativo não garante `onValueChange` ao "selecionar de novo o valor atual", e o teste não pode tratar isso como uma troca de conexão.
2. O `modelProviderFamilyConnectionTransitionSeq` hoje só tem produtor e nenhum consumidor real; ele não forma uma reconciliação e é apenas estado residual.

O I31 passa a verificar que "a ida e volta pela página de configurações não quebra um modelo não-primeiro válido dentro do Team Plan atual":

- Fazer Seed da Team Selection completa;
- Entrar na página de configurações e confirmar que continua sendo a mesma Team Connection;
- Voltar ao workspace sem depender da resseleção da option atual;
- Verificar que a barra de ferramentas e a requisição de primeiro envio continuam no modelo e no reasoning originais.

Ao realmente trocar para outra identidade de Team, não há garantia de que o modelo antigo ainda pertença ao novo Provider, e isso não entra no I31. Se essa regra de produto for necessária no futuro, ela deve ter um caso separado.

Depois de confirmar a ausência de consumidores, remover a transition sequence, a mark action, o helper de reconciliação de selection inalterada e os pseudo-testes correspondentes, sem manter estado "que talvez seja útil depois".

## 6. Fechamento das asserções de reasoning na requisição

O Model Option Map oficial já não promete gerar um `thinking.budget_tokens` fixo. Os fatos de requisição capturados por I20 são:

```text
Parent                thinking.type=enabled, output_config.effort=max
Child                 thinking.type=enabled, output_config.effort=high
Parent continuation   thinking.type=enabled, output_config.effort=max
```

Isso já prova por completo o isolamento de reasoning entre Agent pai e filho e a continuidade da sessão pai. Reparar `assertUpstreamThoughtLevelCapture()`:

- Manter as asserções de route, model, text, `thinking.type` e `output_config.effort`;
- Remover a exigência rígida do Helper compartilhado por `thinking.budget_tokens > 0`;
- Se alguma Model Rule específica mapear budget no futuro, afirmar isso apenas na Fixture exclusiva daquele modelo;
- Verificar sincronamente todos os Cases oficiais e pending que referenciam este Helper, evitando que a mesma asserção antiga reapareça no próximo lote.

O modelo auxiliar que "usa o nível de reasoning disponível mais baixo" continua tomando direto o `values[0]` ordenado; o nível padrão das novas seleções comuns continua sendo decidido pelas regras de Selection atuais. Os dois não podem ser escritos como uma política global única.

## 7. Reparos de infraestrutura comum do E2E

### 7.1 Selection Seed

O `seedPersistedModelSelection()` oficial permite por padrão escrever apenas a Selection completa:

```ts
{
  providerId,
  modelId,
  reasoningLevel,
}
```

- `reasoningLevel` passa a ser obrigatório, e todos os pontos de chamada oficiais são atualizados.
- Ao validar especificamente migração de dados antigos, usa-se um seed raw/legacy com nome explícito, sem deixar o Helper comum fabricar dados ilegais silenciosamente.
- O Helper não adivinha o reasoning pelo nome do modelo e não lê a UI para reescrever a Fixture.

### 7.2 Account Scenario Seed

Passa a ser `seedAccountScenario(...)` que expressa uniformemente o Account Provider, a identidade Team, o entitlement e os membros de modelo dinâmicos. A exibição de Family e a seleção de conexão que ainda precisam ser mantidas continuam passando pelo Schema oficial; o teste não pode mais montar diretamente um Provider de API de Account já removido nem campos antigos já inválidos.

### 7.3 Esperas de Registry/Selection

Passa a existir de forma unificada ou consolidada a semântica de espera:

```text
waitForEffectiveProvider(providerId)
waitForSelectableModel(providerId, modelId)
waitForSelectedModel(providerId, modelId, reasoningLevel)
```

Essas esperas observam o resultado de Registry/Selection realmente visível ao usuário, não criam um Registry exclusivo do E2E nem leem Snapshot interno de produção.

O salvamento de Personal Config até valer no Worker admite uma diferença de tempo de até 1 a 3 segundos; polling/espera com limite pode ser usado, mas nunca sleep fixo no lugar da asserção de estado final.

### 7.4 Criação por Template

MP-UI-01 e I08 primeiro reproduzem em conjunto se o cartão de Template dispara uma ou duas criações:

```text
um clique do usuário
    |
    +--> uma mutation de create
    +--> um Personal Provider Overlay
    `--> entra automaticamente nos detalhes do novo Provider
```

- Se o helper do E2E clicar no cartão e ainda assim submeter de novo, remover a ação duplicada.
- Se o evento de produção gerar bubbling/reentrância e produzir duas mutations, escrever primeiro um teste E2E/de componente que falha e só então reparar a fronteira de eventos de produção.
- A espera de criação bem-sucedida se baseia no Provider ID devolvido ou no novo Personal Overlay, e não pode depender de correspondência difusa por nome.
- Depois de criar, adicionar o modelo e esperar que o Registry permita seleção, e só então concluir a asserção de requisição de primeiro envio de I08.

### 7.5 Placeholder de JSON

MP-UI-06 deve distinguir conforme o contrato atual:

- Overlay vazio: o value do textarea é vazio e `{}` aparece apenas como placeholder;
- O usuário escreve explicitamente `{}`: aí o value é `"{}"`;
- JSON somente leitura efetivo: continua exibindo o valor realmente analisado.

Atualizar as asserções e não tratar o placeholder como Personal Config já salvo.

## 8. Reparos específicos de problemas já definidos

### 8.1 Repo Wiki settings

A responsabilidade central desse Case é gerar os controles de configuração e ele não deve mais carregar um E2E de produto do tipo "sem Provider":

- Remover a asserção da faixa `ready-empty` e da obrigação de o botão de gerar estar desabilitado;
- Não adicionar uma Fixture sem Provider;
- Usar um Provider E2E comum para concluir as asserções de valor padrão, seleção e limites de entrada das configurações;
- Manter a cobertura do teste unitário de `repoWikiModelState` para a Ready View vazia;
- Remover também, na documentação do E2E de Repo Wiki, a entrada específica sem Provider.

### 8.2 Repo Wiki produces

O bug real atual é que, depois que o usuário escolhe no menu de modelos, só a identidade é salva e a Selection completa que o Host já havia completado é sobrescrita:

```text
preferredSelection completa
        |
usuário clica no menu de modelos
        |
parseModelPickerValue() só devolve providerId/modelId
        |
reasoningLevel se perde
        |
invalid-explicit -> Generate desabilitado
```

Requisitos do reparo:

- O evento de seleção de modelo chama `completeNewModelSelection(modelSelectionView, identity)`;
- Grava o `providerId/modelId/options.reasoningLevel` completos no Repo Wiki Draft;
- Não afrouxar o gate `ready` do Generate;
- Não adicionar fallback exclusivo do Repo Wiki nem algoritmo de reasoning padrão;
- Acrescentar testes provando que a Selection completa é mantida ao reselecionar o modelo atual, trocar de modelo e trocar o reasoning.

## 9. Plano de evidências para problemas ainda não localizados

### 9.1 MP-UI-01 / I08

Durante um único clique real de usuário, registrar:

- o número de ativações de pointer/click do cartão de Template;
- o número de chamadas de create mutation e o Provider ID devolvido;
- o número de escritas do Personal Overlay;
- o valor de navegação selecionado;
- se o Helper do E2E executou outra ação de criação depois do clique.

Se a mutation de produção ocorre só uma vez, remover a ação duplicada do teste ou corrigir a espera; se houver reentrância em produção, fixar primeiro a falha de componente/E2E e só então reparar a fronteira de eventos. Não se pode mascarar instâncias duplicadas com correspondência difusa por nome.

### 9.2 OTB08-OTB10

Manter os objetivos de produto de reserve de 21K, cap de preflight e compact reativo. Para a segunda requisição, coletar:

- se a requisição real foi de fato enviada;
- se a lane de replay corresponde;
- se o compact foi concluído;
- se a completion do assistant foi perdida por admission, fixture ou espera da UI.

Só se altera o código de produção quando a evidência provar que o comportamento de orçamento/compact de produção está errado; se a requisição estiver correta e o replay não tiver resposta, o reparo é na Fixture ou no Helper de espera.

### 9.3 QR-E2E-09

Seu upstream de fato depende de Account Provider, Model Selection e entitlement, mas o alvo da asserção é o reminder da reset opportunity `initial`. QR-E2E-10, QR-E2E-04 e a maior parte da cadeia principal de Coding Plan/Quota já passaram, então não se pode assumir primeiro que o Provider está quebrado por completo.

Isolar o Case único e depois comparar com a spec inteira:

- se a requisição de reset opportunity foi enviada;
- se a Fixture de status/opportunity devolve uma quantidade válida e um tempo de expiração;
- se `displayedProviderId`, entitlement e o trigger de Context existem;
- se o DOM do reminder foi criado e recolhido imediatamente por um evento de ponteiro;
- se o store de dismissal de nível de janela já registrou a mesma opportunity;
- se o Case anterior poluiu o estado.

Se o Case único passar e o grupo falhar, o reparo é por isolamento de caso; se o Case único ainda falhar, a localização segue a ordem da fonte de Account, da Fixture e da implementação do reminder inicial. Não se pode fazer o reminder aparecer modificando a ordenação do Account Provider.

## 10. Fases de implementação

### Fase A: criar o relatório de implementação e reparar a infraestrutura comum

1. Criar o relatório de implementação, registrando o SHA do baseline, o diretório de execução, os comandos, os artefatos iniciais e a tabela de status dos 12 Cases.
2. Fazer o seed oficial de Selection carregar o reasoning obrigatoriamente.
3. Consolidar o Account Scenario e os Helpers de readiness de Provider/Model.
4. Corrigir as asserções de placeholder de JSON.
5. Remover a asserção de budget fixo do Helper compartilhado de reasoning.

Após a fase, fazer review confirmando que não há campo antigo novo, hardcode de nome de modelo, injeção direta de Registry ou espera sem limite; a janela já decidida de propagação de polling de 1 a 3 segundos é a única exceção.

### Fase B: reparar os Cases de Selection

1. Reparar a Selection completa do Repo Wiki e remover as asserções E2E desnecessárias do cenário sem modelo.
2. Reparar a recuperação completa do Recent em I26.
3. Reparar a Fixture e as asserções de I27/I28 pelo Host preferred genérico + Configured Default.
4. Reescrever I31 como ida e volta pela página de configurações e remover o transition state sem consumidor.
5. Confirmar por requisição real a identidade de Provider/Model/Reasoning.

Após a fase, fazer review confirmando que o Renderer não tem branch Account-first e que o Configured Default continua tendo prioridade sobre o fallback do Registry.

### Fase C: localizar em runtime e tratar as causas raízes em aberto

1. Localizar em conjunto MP-UI-01/I08 e determinar se a criação duplicada acontece no Helper ou na mutation de produção.
2. Localizar o ponto de falha mais inicial da requisição, do replay, do compact e da completion em OTB08-10.
3. Executar QR-E2E-09 isolado e em grupo e localizar o problema de fonte de Account, de Fixture ou de isolamento do reminder.

Quando a causa raiz for única e o reparo natural, fixa-se primeiro a evidência de falha e se executa diretamente; na dúvida, ou quando for preciso mudar o Design existente, o item não é modificado e vai para o relatório de implementação pedindo decisão.

### Fase D: fechar evidências, relatório de implementação e documentação

1. Atualizar o estado real do Conversation Case Catalog e do Coverage Matrix.
2. Preservar o registro histórico de execução no Todo 57, referenciando o baseline atual deste Todo sem sobrescrever a evidência antiga para fingir que passava na época.
3. Salvar o caminho dos artefatos do MacBook Pro, os comandos, o SHA do commit e o resumo dos resultados.
4. Os Cases em ambiente SSH continuam registrados como `blocked-environment`, com a condição para reexecução.
5. Concluir o relatório de implementação descrevendo item a item a causa raiz, os arquivos alterados, os resíduos removidos, os comandos de teste, os artefatos, os resultados e os riscos remanescentes.

## 11. Contrato do relatório de implementação

O relatório de implementação precisa ser um arquivo independente, sem reescrever o status de planejamento do Todo como narrativa pós-facto. Deve conter no mínimo:

```text
baseline da implementação
├─ SHA de início/fim
├─ diretório de execução do MacBook Pro e versões das ferramentas
└─ evidência inicial de 43 pass / 12 fail / 1 blocked

registro por Case
├─ falha original e artefato
├─ ponto de falha mais inicial
├─ classificação da causa raiz: production / fixture / helper / isolation / environment
├─ se envolve alguma decisão de produto existente
├─ reparo real e itens removidos
├─ resultados direcionados, de grupo e totais
└─ itens não modificados e o motivo

revisão final
├─ verificação da abstração de Provider/Selection
├─ busca de campos antigos e lógicas de especialização removidos
├─ resultados de typecheck/lint/unit/E2E
├─ condição de blocked-environment
└─ riscos remanescentes e itens aguardando decisão
```

Todo Case ainda não localizado ou não aprovado precisa ser mantido explicitamente no relatório e não pode ser varrido para debaixo do tapete com "sem relação com Provider" ou "oscilação de ambiente".

## 12. Plano de verificação

Executar em ordem crescente de risco:

1. Testes unitários dos Helpers/Store/Selection afetados.
2. `pnpm --filter @zcode/desktop typecheck:e2e`.
3. Verificação de fixtures e da configuração case-local.
4. Executar isoladamente os 12 Cases que falhavam, preservando o artefato de cada um.
5. Reexecutar os grupos afetados por spec e confirmar que não há poluição por ordem de Case.
6. Reexecutar a lista atualmente afetada, com o objetivo de que todos os Cases com as condições locais de ambiente passem; o SSH só entra na contagem depois que as cred estiverem completas.
7. `pnpm typecheck`.
8. `pnpm lint`.
9. `pnpm test:unit`.
10. `pnpm audit:conversation-session-coverage`.
11. Verificação de formato dos arquivos modificados e `git diff --check`.

Se um Case isolado passa e o grupo falha, trata-se como bug de vazamento de estado/isolamento de Fixture, e a execução em grupo não pode ser removida do gate.

## 13. Critérios de conclusão

- O seed de Selection deixa de fabricar por padrão dados novos e inválidos sem reasoning.
- I26 preserva um modelo não-primeiro válido do Team Plan.
- I27/I28 voltam pelo Host preferred a um Configured Default válido, sem especialização Account-first no Renderer.
- I31 não depende de reselecionar a mesma option do Select, e o transition state sem consumidor foi limpo.
- O Helper compartilhado de reasoning do DeepSeek deixa de exigir o `budget_tokens` removido do Option Map oficial.
- Um clique em Template cria um só Provider e entra atomicamente nos detalhes dele; I08 consegue fazer o primeiro envio pela identidade da instância.
- As asserções de Overlay JSON vazio e de placeholder são coerentes.
- Selecionar modelo no Repo Wiki sempre forma uma Selection completa, e o E2E de configurações não carrega mais o cenário desnecessário sem modelo.
- MP-UI-01/I08, OTB08-10 e QR-E2E-09 têm causa raiz definida e testes correspondentes, sem alterar asserções por suposição.
- Todos os Cases com condições de ambiente passam na lista atualmente afetada; os itens pulados por ambiente são listados separadamente.
- Não se remove a exibição e a seleção de conexão de Family que ainda precisam ser mantidas, nem se restaura o Provider de API de Account já removido; não se adiciona uma segunda autoridade de configuração ou de Registry, e nenhum ID de modelo concreto dirige o comportamento de produção.
- O relatório de implementação independente registra por completo o resultado de cada falha, as evidências de execução, os itens em aberto e a revisão final.
- O commit final usa Conventional Commit e inclui o trailer da sessão de Agent atual; sem um Session ID confirmável, não é permitido adivinhar nem commitar.