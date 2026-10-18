# Matriz de cobertura E2E da trajetória de chamadas de modelo

Este documento define a semântica de aceitação end-to-end do Model Trajectory Viewer. O limiar de cobertura é calculado sobre as linhas alteradas de TypeScript/TSX agregadas no intervalo fixo e atribuíveis à capacidade de trajetória de chamadas
`1f015ca1726a4e1f932c6e87b8b7ce64623317af..f5ce7b4b360eaec0a396b55f1e2ad36586ecd837`,
com meta não inferior a 95%. O conjunto de atribuição é fixo em
`3e00cec9d0`, `bfcef0c9c4`, `1d434a6dda`, `65156894ac`, `274ebbd8f4`, `f5ce7b4b36`,
correspondendo a rolagem nativa, gravação de reasoning, projeção de tool metadata, UX da trajetória, busca de conteúdo e leitura limitada da cauda;
não se pode incluir no denominador mudanças sem relação que entraram no staging no mesmo período, como provider, media, settings ou tracing genérico de ações de task.
Documentação pura, código de teste, dicionários de tradução e CSS puro ficam fora do denominador de linhas executáveis, mas os respectivos elementos visuais e textos precisam ser cobertos por asserções E2E.
O Renderer usa cobertura Istanbul; Desktop host / CLI usam cobertura V8. A expansão padrão de `094ac1c5a1` é o comportamento atual acima do limite superior: o E2E mantém a asserção de regressão, mas ela não entra neste denominador fixo.

## Dimensões de estado e podagem

| Dimensão | Estados aceitos | Podagem |
| --- | --- | --- |
| Dados | records, `error-text`, record error; registros completos e registros compatíveis com o formato antigo | loading/empty/read-error do Pane são estados genéricos já existentes e não entram no E2E de changed-line deste refactor de UX; a semântica de projeção do JSONL é independente do fabricante do modelo |
| Tipo de conteúdo | System, User, Reasoning, Assistant, Tool Call, Tool Result, record error | Não se faz o produto cartesiano dos seis tipos de conteúdo; a cobertura vem em uma fixture composta |
| Expansão | Expandido por padrão, recolhido em linha única, todos, tipos customizados, corpo transbordando | Não se repete a mesma asserção de toggle item a item |
| Busca | Sem resultado, resultado único, múltiplos resultados, navegação anterior/seguinte, acerto em trecho recolhido, acerto fora da região virtual | Normalização de maiúsculas e espaços fica por conta dos testes unitários; o E2E valida a cadeia de produto |
| Lista | Listas curtas, virtualização de listas longas, medição dinâmica de altura após expandir | Não se repete a execução por uma contagem fixa de registros; a lista longa representa o limite de escala |
| Viewport | Largura padrão do Desktop, barra lateral estreita | `/remote` não cria um novo Agent runtime; a compatibilidade do host compartilhado é coberta por componentes e pela regressão de remote existente |

## Cases aceitos

| ID | Setup | Action | Assertions | Consolidação de automação |
| --- | --- | --- | --- | --- |
| TRJ01 | main-turn real que cria task/session; ler primeiro o model-io realmente escrito pela CLI e depois anexar registros determinísticos com os seis tipos de conteúdo | Fixar explicitamente `zh-CN` e abrir a trajetória de chamadas pelo menu de contexto da task real | Os registros reais da CLI contêm response/reasoning do main-turn; o Host lê o arquivo da task atual; origem, finish reason e os seis tipos de conteúdo são projetados corretamente por atributos semânticos estáveis; textos representativos em chinês, tokens, duração, tool name/id estão corretos e as asserções funcionais não dependem do texto de exibição em inglês | live writer/host-read spec |
| TRJ02 | Injetar JSONL compatível: full → delta, tool metadata de topo, `error-text`, record error | Abrir a trajetória e expandir a linha de erro | O novo user visível após reconstruir o delta não repete o assistant antigo como Input; tool name/id são separados; o resumo do erro vem do value; a expansão usa estilo destructive; record error é visível | fixture projection spec |
| TRJ03 | Conteúdo composto com corpo normal e corpo muito alto | Verificar a expansão padrão, clicar na linha inteira para recolher e expandir de novo, copiar, expandir/recolher o texto transbordante completo | Expandido por padrão; a linha inteira recolhe e se restaura; a cópia só funciona no estado expandido; a máscara do corpo muito alto e o pill centralizado de expandir funcionam; as quebras de linha são preservadas | interaction spec |
| TRJ04 | Os seis tipos de conteúdo presentes ao mesmo tempo | Expandir/recolher tudo; alternar Reasoning e Tool Result separadamente no menu | O estado em massa entra em vigor imediatamente; as duas chaves customizadas só afetam o tipo alvo; comandos posteriores sobrescrevem o override anterior de linha única | interaction spec |
| TRJ05 | Gerar dados com mais chamadas que o limiar de virtualização, com várias linhas de alturas diferentes | Rolar até o meio, expandir uma linha com key estável, rolar para fora da janela de montagem e voltar | Só os registros próximos à janela são renderizados; a medição dinâmica não se sobrepõe; o header fica fixo no topo; o estado de expansão se mantém após desmontagem/remontagem reais | virtual/search spec |
| TRJ06 | Vários acertos distribuídos entre registros já renderizados | Buscar, anterior/seguinte, fechar a busca | O total e o índice estão corretos; o acerto ativo se distingue do comum por estilo; a navegação não pisca; ao fechar, o realce é limpo e o estado de expansão do usuário é restaurado | virtual/search spec |
| TRJ07 | O único acerto está em um corpo recolhido e fora da janela virtual | Buscar e navegar até o acerto | O registro alvo rola para dentro da viewport e a linha correspondente expande automaticamente, com o acerto realçado e posicionado ao centro | virtual/search spec |
| TRJ08 | Barra lateral estreita e tool name/id completos | Estreitar o renderer do Desktop | A página não tem rolagem horizontal; o tool name fica completo; a borda direita da coluna de ações visível tem erro de no máximo 2px | narrow-layout spec |
| TRJ09 | Criar um model-io esparso de mais de 32 MiB, com um registro recent completo anexado ao final | Atualizar a trajetória de chamadas | O Host lê apenas a cauda limitada, descarta a linha parcial do início, mantém o registro recent e exibe o aviso de truncamento | bounded-tail spec |

## Responsabilidade de cobertura

| Camada | Responsabilidade do E2E | Testes complementares |
| --- | --- | --- |
| CLI writer | TRJ01 verifica a gravação real do reasoningText | runner unit verifica extração e append limitado |
| Service projection | TRJ01/TRJ02 verificam leitura de arquivo, delta e metadados de tool/error atravessando as camadas | modelTrajectory unit cobre linhas anômalas e limit |
| UI rendering | TRJ01-TRJ04/TRJ08 | formatter puro e estado de expansão em teste unitário |
| Virtualization/search | TRJ05-TRJ07 | lógica pura de search/highlight em teste unitário |

## Regras de auditoria de 95%

1. Ao rodar o trajectory E2E, definir `ZCODE_E2E_COVERAGE=1`.
2. Depois de combinar os relatórios Istanbul do Renderer e V8 do Node, filtrar apenas as linhas executáveis relevantes alteradas dentro do intervalo fixo e introduzidas pelos commits de trajectory acima; a atribuição vem do blame na revision alvo, e as linhas executáveis TS/TSX são determinadas pela linha inicial de statement do Babel/Istanbul.
3. Todo case precisa ter setup, action e assertion; código apenas atravessado não conta como cobertura semântica.
4. Se a agregação ficar abaixo de 95%, primeiro complemente cases/asserções com significado de produto; não é permitido forjar cobertura com chamadas sem asserção.
5. Ao final, rodar também `typecheck:e2e`, o `typecheck` da raiz, `lint` e a verificação de fixtures.

## Evidências históricas de execução (2026-08-24)

- Case formal: `conversation-session-model-trajectory-viewer.test.ts`; TRJ01–TRJ08 foram todos consolidados automaticamente em uma única execução real da cadeia Desktop/host, e passaram pela revisão humana e pela auditoria formal de admissão.
- A fixture de provider local do case e o manifest passaram em `e2e:fixture:check`; o arquivo model-io em tempo de execução é criado pela spec com o id de task real.
- A execução oficial com `ZCODE_E2E_COVERAGE=1` passou, com artifact run id:
  `desktop-e2e-20260824030501067-p90124-d7b5300b50c7a917`.
- Após combinar os relatórios de source do Renderer/host com o dist V8 do CLI, foram contabilizadas conservadoramente todas as 27 linhas novas do CLI nesta rodada,
  com acerto de changed-line em **1382 / 1437 (96.17%)**, acima do limiar de 95%.
- Os novos caminhos de generate, stream e normalização de reasoning do `runner-debug` do CLI tiveram acerto no mesmo relatório V8;
  o conteúdo do array de reasoning e os limites de valor nulo continuam com asserções precisas no runner unit.

Essa evidência é anterior à correção de leitura limitada da cauda em `f5ce7b4b36`; ela só prova a cobertura do refactor de UX na época e não serve como comprovação final do limiar de 95% atual. A auditoria atual precisa gerar novamente a evidência de uma única execução sobre TRJ01–TRJ09 e o denominador fixo.

## Evidências atuais de execução (2026-08-27)

- Case formal: `conversation-session-model-trajectory-viewer.test.ts`; replay oficial único de TRJ01–TRJ09
  passou; run id após reconstrução completa: `desktop-e2e-20260827-131338-656`, exit code `0`, first-time pass
  rate `100%`.
- Fixture local DeepSeek do case combinada explicitamente com a fixture comum; o caso primeiro deixa o main-turn real da CLI escrever um model-io contendo
  `response.reasoningText`, depois anexa registros determinísticos e entra no Pane pelo menu de contexto da task real.
- A mesma execução coleta Istanbul do Renderer, V8 do Host e V8 do CLI. O resultado da auditoria de interseção entre blame da revision fixa e
  linhas executáveis é:

| Origem da cobertura | Acertos / linhas executáveis alteradas | Cobertura |
| --- | ------------------------------: | ---------: |
| Renderer Istanbul |                       397 / 413 |     96.13% |
| Host V8           |                         37 / 38 |     97.37% |
| CLI V8            |                           6 / 6 |       100% |
| Total             |                   **440 / 457** | **96.28%** |

- O relatório do CLI cai no `runner-debug.js` compilado; as linhas executáveis de source correspondentes de generate/stream
  `reasoningText` e `modelIOReasoningText` tiveram acerto no mesmo relatório V8. As 17 linhas sem acerto são principalmente componentes antigos
  inalcançáveis e não referenciados, catch de falha de cópia, fallback sem conteúdo, catch de payload não serializável e a correção de rolagem
  quando o range da busca já está fora da viewport; elas não afetam o limiar de 95% e nenhum acerto foi fabricado com chamada sem asserção.