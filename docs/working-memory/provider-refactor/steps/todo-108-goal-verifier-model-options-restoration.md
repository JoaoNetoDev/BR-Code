# Todo 108: Restaurar o Nível de Pensamento e o Limite de Saída do Goal Verifier

> Status: implementação, teste de requisição real do Verifier e revisão item a item concluídos. 2026-09-10. A evidência de implementação/teste, a revisão de limites item a item e as limitações do ambiente real estão em [revisão de entrega deste lote](./provider-todos-105-113-delivery-review.md).

## Objetivo e Decisão

O Goal Verifier herda o modelo e a configuração de pensamento da Session no início da verificação, usando o limite de saída resolvido pelo modelo segundo o sistema de configuração atual; ele não pode forçar um nível de pensamento mais baixo por ser uma chamada interna nem impor um teto adicional de 5.000 Tokens.

Restaurar a semântica de produto original, mantendo as abstrações atuais de Provider / ModelSelection / ModelFactory, sem restaurar interfaces antigas nem antigas fontes de configuração.

## Fatos Confirmados e Causa Raiz

- Foi verificado que o `main` remoto está em `e7921fb5d484d9c9d22d2e638064163fd13143a6`. Seu Verifier lê o `defaultModelRef` e o `modelProviderOptions` do início da verificação, sem sobreposição independente do nível de pensamento.
- `resolveNormalRequestMaxOutputTokens` do main usa o `maxOutputTokens` já resolvido pelo Model; valores válidos são usados como estão, arredondados, e só em caso de ausência ou invalidez há fallback para 32.000. 32.000 não é um teto, e o Verifier não tem limite dedicado de 5.000.
- O Verifier atual ainda lê primeiro o ModelSelection da Session e cria o Model, mas o commit `5aaddd0bdf` mudou os parâmetros da requisição para `auxiliaryModelOptions(model)`: força `reasoningLevel.values[0]` e define `min(5000, maxOutputTokens.max)`.
- A causa raiz é ter enquadrado o Goal Verifier na política de chamadas auxiliares de baixo custo; ao unificar a implementação da chamada, o comportamento de negócio mudou junto, não sendo apenas uma adaptação de interface.
- Código relacionado: `apps/zcode-cli/packages/core/src/runtime/methods/target-completion-verification.ts`, `apps/zcode-cli/packages/core/src/model/auxiliary-model-options.ts`.

## Requisitos de Implementação

1. Remover do Verifier o uso das políticas acima de redução de nível e de teto de 5.000. A requisição herda a configuração de pensamento do Model vindo da criação, sem escolher separadamente o nível mais baixo, o mais alto ou desligar.
2. O limite de saída segue a configuração unificada atual de modelo e as regras de requisição, sem novos orçamentos, fallbacks ou tetos no Verifier. O 32.000 do main serve apenas como registro de comportamento histórico; a integridade da configuração atual já tem garantia unificada, e não se reintroduz o fallback antigo de Runtime para restaurar o comportamento.
3. O modelo é determinado no início da verificação; esta requisição, novas tentativas e a atribuição de uso usam o mesmo Model de execução. Alterar a seleção da Session no meio da verificação não pode modificar uma verificação já iniciada nem gravar de volta os parâmetros do Verifier na Session.

   ```text
   início da verificação
     -> ler o ModelSelection da Session
     -> criar o Model de execução pela entrada unificada existente
     -> requisição / novas tentativas / atribuição de uso compartilham esse Model

   durante isso, troca de seleção na Session -> afeta apenas as execuções criadas depois
   ```

4. Não modificar nem remover globalmente `auxiliaryModelOptions`; as políticas existentes de outras chamadas, como a geração de título, não estão no escopo desta rodada de restauração.
5. Não alterar o Prompt do Verifier, a análise de resultados, o tratamento de falhas, a semântica de cancelamento, as novas tentativas do Start Plan, a projeção de mensagens nem o mecanismo de autenticação do Provider; não aproveitar para implementar uma nova arquitetura de contas.

## Plano de Implementação Concreto (adição de decisão em 2026-09-10)

Com foco em remover localmente a política incorreta, sem adicionar camada de configuração, parser de parâmetros ou função auxiliar exclusiva do Verifier:

1. Manter as entradas de vínculo de execução existentes de `getSessionModelSelection()` e `createRuntimeModel(...)`.
2. Remover a importação e a chamada de `auxiliaryModelOptions` pelo Verifier, fornecendo diretamente na requisição `generateText`:

   ```ts
   options: {
     maxOutputTokens: input.model.optionSpecs.maxOutputTokens.max,
   },
   ```

3. Não passar valor de sobreposição em `reasoningLevel`; a lógica existente de preparação de requisição do Model faz a mesclagem dos parâmetros vinculados e a validação unificada. Não reavaliar nomes de níveis nem escolher um nível padrão dentro do Verifier.
4. Não é possível remover todo o `options`: o Turn comum atual usa explicitamente o limite de saída declarado pelo modelo em `turn-model-step.ts`, e o ModelFactory não é responsável por preencher o orçamento de saída da requisição; o Verifier segue o mesmo limite.
5. Não modificar globalmente `auxiliaryModelOptions` por causa desta correção, não restaurar os caminhos antigos de leitura `defaultModelRef` / `modelProviderOptions` e não adicionar fallback de 32.000 nem novas constantes de orçamento.
6. Deixar um comentário curto em chinês no ponto modificado, explicando que o Verifier não pode aplicar a política de redução/teto das chamadas auxiliares de baixo custo. Não é preciso abstrair mais uma camada só para essa leitura direta do valor.

## Testes e Aceitação

- [x] Adicionar primeiro testes de regressão com poder de diferenciação, e só então modificar o código; afirmar os parâmetros realmente usados após a mesclagem na requisição do Model, não apenas o Selection no momento da criação.
- [x] Com a Session numa seleção que não seja o nível mais baixo (como high / max), verificar que a requisição real mantém esse nível; o nível desligado também é preservado, sem forçar a ativação.
- [x] Quando o nível de pensamento não é especificado explicitamente, seguir a semântica de resolução do Model unificado atual, sem que o Verifier acrescente um conjunto próprio de padrões.
- [x] Limite de saída acima de 5.000 e abaixo de 5.000 seguem a configuração do modelo; cobrir 64.000, para evitar restaurar por engano um teto unificado de 32.000.
- [x] Troca da seleção da Session durante a verificação, novas tentativas e registro de uso continuam usando o Model de execução inicial; a Session não é contaminada por parâmetros auxiliares.
- [x] Reverificar que os parâmetros das outras chamadas auxiliares não mudaram, e que a projeção de mensagens, o cancelamento e os caminhos existentes de nova tentativa do Verifier não sofreram regressão.
- [x] Executar os testes direcionados, a checagem de tipos e o lint relevantes ao longo de todo o lote; revisar se a restauração do negócio e a abstração atual são satisfeitas simultaneamente, sem repetir regressão completa nem validação Pro item a item por uma mudança pequena.
- [x] Atualizar os registros de implementação e verificação, e fazer o commit do código; descrever explicitamente as partes não testadas, sem registrar captura local de parâmetros como validação real de fornecedor aprovada.

## Critério de Conclusão

O Verifier não força mais a redução de nível nem impõe teto adicional de 5.000; mantém o limite de criação unificada de Model e de execução já vinculada, com as regressões relacionadas passando e a revisão concluída. Gravar este documento não equivale à conclusão da correção.

## Registro de Implementação e Revisão

- Removida a política de chamada auxiliar do Verifier; passa-se explicitamente apenas o limite de saída do Model atual, sem camada auxiliar nem fallback de orçamento.
- Adicionado `adapters/tests/goal-verifier-model-options.test.ts`: Runtime real + SQLite + preparação de requisição do ExecutableModel, capturando os parâmetros após a mesclagem. Antes da correção, os três casos high/max/sem nível explícito falhavam; depois, 5/5 passam, incluindo 4.000, 64.000, 128.000 e a troca de seleção da Session durante a nova tentativa enquanto o Start está ocupado.
- As 22 verificações direcionadas existentes de Verifier/verification do Core passam: vínculo de uso, cancelamento, novas tentativas, projeção de mídia, loop de objetivo e limites de fila preservados. Duas asserções antigas da política de 5.000 foram corrigidas.
- Revisão item a item: entradas de Factory/Selection inalteradas; apenas um Model vinculado por verificação; requisição, novas tentativas e usage o compartilham; sem gravação de volta na Session; outras chamadas auxiliary e helpers inalterados; Prompt, análise e política de falha inalterados.
- `pnpm typecheck` e `pnpm lint` na raiz passam (41 warnings existentes, 0 erros); checagem de tipos dos Adapters passa. A regressão final do lote é fechada separadamente; o que está acima é evidência de execução local sem rede, não validação online de fornecedor.