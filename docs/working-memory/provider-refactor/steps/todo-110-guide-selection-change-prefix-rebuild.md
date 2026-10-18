# Todo 110: Guide com a mesma seleção re-resolve, mas não dispara a reconstrução do prefixo System de troca de modelo

> Status: implementação, validação com requisições reais de Runtime e revisão item a item concluídas; o novo E2E de desktop GS/P06 não foi executado de fato. 2026-09-10. Evidências de implementação/teste, a revisão de cada fronteira e as limitações do ambiente real estão em [revisão de entrega deste lote](./provider-todos-105-113-delivery-review.md).

## Objetivo e decisão de prioridade máxima

Distinguir dois fatos: **re-resolução do Model de execução** e **mudança de ModelSelection**.

- Quando o Guide carrega uma ModelSelection, mesmo que a seleção não tenha mudado, ele precisa re-resolver a configuração pelo ponto de entrada unificado atual, validá-la e criar o Model de execução; mesmo Provider, modelo e nível não significam que a configuração não foi atualizada.
- O Model recém-resolvido é usado nas requisições seguintes; não se deve reutilizar o Model antigo, pular a resolução de configuração ou continuar usando os parâmetros de execução antigos só porque a Selection é a mesma.
- Somente uma mudança da própria Selection dispara a reconstrução do prefixo System de troca de modelo do Guide. Não se pode tomar "devolveu um Model" ou "o novo objeto Model é diferente do antigo" como condição de troca.
- Esta rodada corrige apenas o gatilho acima; não corrige o problema de congelamento de estilo de saída, não refatora a arquitetura de Provider, Selection, sincronização de conta ou agendamento do Guide.

Este documento substitui explicitamente o rascunho inicial discutido de "reutilizar o Model antigo com a mesma seleção, sem chamar a fábrica de modelos"; não implemente conforme esse rascunho.

## Problema atual e pontos de entrada relacionados

- `applySubmissionExecutionState()` em `apps/zcode-cli/packages/core/src/runtime/methods/turn-model.ts`, ao receber a Selection, cria e devolve um Model. A comparação de seleção existente apenas controla o evento de seleção de modelo da Session, não impede o retorno do Model.
- `apps/zcode-cli/packages/core/src/runtime/methods/turn-guide-drain.ts` atualmente verifica apenas `if (guideModel)`, em seguida substitui o Model de execução e chama `rebuildContextPrefix()`; o erro está em confundir obter um Model com ocorrer uma troca.
- O novo caminho de Turn / compact em `apps/zcode-cli/packages/core/src/runtime/methods/turn.ts` também usa essas funções públicas, então não se pode quebrar essas chamadas para modificar o comportamento público por causa do Guide.
- A seleção salva na Session pode diferir do modelo de execução já vinculado ao Loop atual: pontos de entrada como o Bot podem atualizar a Session. Portanto, se o Guide alterou a seleção desta execução, deve-se comparar com o Model real do Loop atual, e não apenas com o valor mutável da Session.

## Cadeia esperada

```text
O Guide é consumido na próxima fronteira de model-step já estabelecida
  -> o corpo do Guide é anexado normalmente
  -> registra a seleção de execução anterior à troca (vinda do Model do Loop atual)
  -> re-resolve / valida / cria o Model pelo ponto de entrada unificado já existente
  -> atualiza o Model de execução usado nas requisições seguintes
  -> compara a seleção do Guide com a seleção de execução anterior à troca
       igual -> não dispara a reconstrução do prefixo System de troca de modelo
       diferente -> segue a reconstrução existente do prefixo System de troca de modelo
  -> conclui normalmente os demais tratamentos do Guide (atribuição de entrada, modo, etc.)

Requisições de modelo já enviadas -> continuam usando o vínculo original, sem reescrita no meio do caminho
```

## Requisitos de implementação

1. A comparação da seleção abrange `providerId`, `modelId` e `options.reasoningLevel`, seguindo o contrato completo de Selection já existente; trocar de Provider, trocar de modelo ou trocar apenas o nível de raciocínio contam como mudança. Não comparar por nome de exibição, referência de objeto ou pela configuração completa do modelo.
2. Expressar separadamente, em fronteiras existentes adequadas, o `model` resultante da resolução e o `selectionChanged`. Pode-se fazer isso por meio de um pequeno resultado de retorno ou de um cálculo local do Guide; não se exige adicionar um serviço de estado, cache ou campo persistido duplicado para um único booleano.
3. `selectionChanged` controla apenas a reconstrução do prefixo exclusivo desta troca de modelo; não controla se o Model é re-resolvido. Quando a seleção é a mesma mas a configuração foi atualizada, as requisições reais seguintes devem usar a configuração do novo Model.
4. Não retornar cedo no início da função pública de aplicação com base em "seleção igual"; não usar o Model antigo como `preparedModel` para contornar a resolução desta vez. A criação de modelo de um novo Turn normal e os usos existentes de prepared-model permanecem inalterados.
5. Preserve as semânticas existentes de commit, persistência e evento da seleção da Session; o evento de mudança da Session e a necessidade de reconstruir o prefixo para a execução atual não são o mesmo julgamento e não podem ser substituídos simplesmente pelo mesmo booleano. Quando Session / execução / Guide têm as três seleções coincidentes, não devem ser gerados eventos falsos de troca de modelo.
6. O corpo do Guide, a atualização de modo, a atribuição de query / message, a mesclagem de restrições de ferramentas e o reset da detecção de ferramentas duplicadas continuam sendo tratados normalmente, sem serem pulados por não haver reconstrução de prefixo. Um Guide sem Selection mantém o comportamento original.
7. Em uma troca real de modelo, continue usando a validação da fábrica existente e a fronteira de troca, sem trocar silenciosamente por outro modelo e sem engolir falhas de resolução. Vinculação temporária de escopo de execução, Off-Peak e as proteções de herança existentes permanecem inalterados.
8. Deixe um comentário em chinês no ponto da correção explicando que "re-resolver a configuração não equivale a mudança de seleção". Mantenha o mecanismo unificado de consumo do Model a jusante e não crie uma segunda fonte de parâmetros de requisição.
9. Atualize as formulações genéricas existentes em spec / diagramas funcionais que dizem que "o Guide sempre cria e reconstrói o contexto de modelo", explicitando as condições diferentes de re-resolução e de reconstrução de prefixo; não modifique todo o contrato de congelamento de contexto.

## Fora de escopo explícito

- Não corrigir o segundo problema, em que, em uma troca real de modelo, o construtor de prefixo lê o output style mais recente enquanto o reminder ainda usa o estilo congelado do turno. Este problema permanece independente e não se deve alegar que foi resolvido com a conclusão deste Todo.
- Não mascarar o segundo problema removendo o reminder, atualizando-o mais cedo ou recarregando toda a configuração congelada.
- Não alterar o admission do Guide, FIFO, os momentos de commit / salvamento, o fluxo desktop continuous nem o mobile replayable, e não adicionar nova barreira de sincronização antes do envio.
- Não modificar de passagem migrações de banco, comandos do Bot, regras de configuração de Provider ou outras estratégias auxiliares de chamada.

## Testes e aceitação

Escreva primeiro os testes, depois implemente; organize a regressão dirigida e a revisão por lote inteiro, sem repetir regressão completa ou validação Pro para cada item pequeno.

- [x] Selection completa igual, configuração inalterada: a fábrica de modelos ainda é chamada e o Model resultante da re-resolução é usado a seguir; o System não é reconstruído e o corpo do Guide entra normalmente na requisição.
- [x] Selection completa igual, configuração alterada: usar uma mudança de configuração observável (como uma mudança válida no limite de saída), afirmar que a requisição real seguinte adota a nova configuração, enquanto o prefixo System não muda por causa da lógica de troca de modelo. Não basta afirmar apenas a chamada da fábrica ou apenas comparar objetos Model.
- [x] Mesma Selection com mudança de modo de execução: o modo é aplicado normalmente, o prefixo não é reconstruído pela lógica de troca de modelo; a atribuição de entrada e os demais estados do Guide não se perdem.
- [x] Mudanças分别 em Provider, modelo e nível de raciocínio, modelo e nível de raciocínio: o comportamento real de troca existente é preservado, as requisições seguintes usam o novo Model e o prefixo é reconstruído conforme as regras atuais.
- [x] Guides consecutivos A→B, B→B: ambos resolvem normalmente e apenas o primeiro dispara a reconstrução do prefixo de troca de modelo.
- [x] Seleção salva na Session diferente da seleção de execução do Loop: a condição de reconstrução se baseia no Loop; o salvamento / evento da Session continua seguindo a semântica original de commit, sem misturar os dois julgamentos de mudança.
- [x] Ausência de Selection, falha de resolução, vinculação temporária de escopo de execução e o caminho em que o próximo turno continua escolhendo o mesmo modelo não têm regressão.
- [x] Usar o Runtime real com um modelo de teste offline para capturar as requisições antes e depois: mudar o output style durante a execução e submeter um Guide com a mesma seleção; o corpo aparece e o prefixo System não muda por isso; não alegar com base nisso que o problema de congelamento de estilo na troca real de modelo também foi corrigido.
- [x] Conferir os E2E de interação existentes do Guide e complementar ou atualizar os casos mínimos com poder discriminante; preservar a fronteira de consumo do CLI compartilhado entre desktop / celular e não escrever aprovação de um único dispositivo como aprovação real em todos.
- [x] Executar no lote inteiro os testes dirigidos relacionados, `pnpm typecheck` e `pnpm lint`, revisando as chamadas públicas, o uso a jusante do novo Model, a persistência e as semânticas de congelamento fora de escopo.
- [x] Atualizar os registros de implementação, validação e limitações restantes e commitar; separar o que está pendente de teste do que já passou.

## Critério de conclusão

Um Guide com a mesma seleção obtém a configuração de modelo atualizada, as requisições seguintes usam corretamente o novo Model, sem disparar indevidamente a reconstrução do System de troca de modelo; uma mudança real de seleção ainda troca normalmente. Os testes e a revisão relacionados estão concluídos, sem ter misturado o problema de congelamento de output style para esta correção ou para a declaração de conclusão.

## Registro de implementação e revisão

- Reutilizada a comparação completa de seleção de `turn-model`, controlando a reconstrução apenas no Guide; a comparação é entre o Model antigo do Loop e o novo Model, e não a Session mutável ou a referência de objeto. A lógica da Factory e do commit da Session não mudou; não há retorno antecipado nem bypass de prepared-model.
- `guide-model-refresh.test.ts` captura requisições com o Runtime real; a implementação antiga falhava em 5 cenários de mesma seleção/Guide consecutivo; após a correção, passam 9 cenários, incluindo mudanças reais de Provider/modelo/nível e a divergência bidirecional Session/Loop. O limite de saída foi de 8.000 para 16.000, a requisição seguinte usa o novo valor enquanto o System mantém o antigo, e texto/modo/atribuição do Guide funcionam normalmente.
- Regressão dirigida de 5 arquivos e 186 casos passou (os testes acima, os testes antigos de Guide, o lifecycle/selection de Model do Runtime e o tool loop completo); a checagem de tipos do Core passou.
- Revisão item a item: o ramo de execution scope inalterado; sem seleção, falha de resolução, novo Turn e prepared-model seguem o caminho original; a requisição atual não é afetada; restrições de ferramentas, detecção de ferramentas duplicadas e atualização de message/query permanecem fora do julgamento de reconstrução. Nenhum estado de sincronização/persistência/projeção foi adicionado, e o segundo problema de congelamento de output style não foi tocado.
- GS/P06 recebeu asserções reais de prefixo na primeira requisição / em Guides consecutivos, com catalog/matrix sincronizado. Essa nova asserção E2E ainda aguarda a validação de desktop do lote inteiro; não se pode reutilizar a antiga marcação formal para fingir que passou nesta rodada.