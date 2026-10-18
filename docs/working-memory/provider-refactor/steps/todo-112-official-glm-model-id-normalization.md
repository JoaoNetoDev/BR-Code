# Todo 112：Normalização de caixa do Model ID real do GLM oficial

> Status: normalização de IDs oficiais, migration incremental e verificação dos limites de rollback concluídas. 2026-09-10. Evidências de implementação/teste, revisão item a item dos limites e restrições do ambiente real estão em [revisão de entrega deste lote](./provider-todos-105-113-delivery-review.md).

## 1. Objetivo e escopo

O usuário pediu unificar o `modelId` real do GLM oficial, e não adicionar um nome de exibição ou apenas embelezar a UI. O estilo alvo é `GLM-5.3`, `GLM-5.3-Flash`, `GLM-5.2`, `GLM-5-Turbo`; nova seleção, gravação e requisição real usam o ID unificado.

- Trata-se apenas dos templates oficiais da Z.ai／BigModel e das origens de modelos de contas oficiais; não altera OpenRouter, OpenCode, MiniMax etc., nem reescreve custom Provider por nome de modelo.
- Não envolve cartões de cota, avisos de saldo, textos promocionais de planos nem suas funções de formatação.
- Não adiciona campo de nome de exibição, nem introduce conversão global de caixa na UI, na comparação genérica do Registry ou no Adapter de requisição.
- Não altera Provider ID, Access, protocolo, Base URL, nível de raciocínio ou capacidades do modelo. Adições e remoções de modelos ficam a cargo dos Todo correspondentes; não se usa a organização de caixa para restaurar modelos cuja remoção já foi decidida.

## 2. Fatos atuais e pontos que precisam ser modificados

### 2.1 Templates oficiais: alterar a lista e as regras exatas em conjunto

Em `config/provider/zcode-builtin.json`, atualmente `zai-api` e `bigmodel-api` têm 21 membros GLM em minúsculas cada, totalizando 42 `templateModelRules` de GLM.

- Alterar o `builtinModelIds` dos dois templates e, ao mesmo tempo, o `templateModelRules[].modelId` correspondente; este último faz correspondência estrita, não basta alterar a lista.
- Por exemplo `glm-5.3` → `GLM-5.3`, `glm-5.3-flash` → `GLM-5.3-Flash`, `glm-5-turbo` → `GLM-5-Turbo`.
- Antes da implementação, listar a grafia alvo de todos os modelos no escopo, cobrindo os demais modelos GLM e os sufixos FlashX, Air, de visão e de data; não é possível adivinhar a grafia canônica com um `toUpperCase()` geral, nem modificar números de versão, estrutura de separadores ou remover sufixos.
- A lista e as regras atuais são apenas a linha de base da investigação. Em coordenação com a divisão em quatro templates do [Todo111](./todo-111-zhipu-coding-plan-api-key-and-standard-api-templates.md): atualizar a lista e as regras exatas da API padrão oficial e da Coding Plan API conforme a identidade final dos templates, sem reintroduzir templates antigos nem repetir a renomeação.

### 2.2 Start: unificar na entrada da lista oficial de modelos

Em `packages/services/src/model-provider/zaiStartPlanBilling.ts`, `resolveZaiStartPlanBalanceModelIds()` extrai `model:<id>` das `capabilities` de saldo e, quando ausente, usa `show_name`; hoje apenas remove duplicatas ignorando caixa, preservando a grafia original na saída.

`codingPlanProviderAvailability.ts` repassa o resultado à resolução de conta, e `packages/provider/src/account-provider-resolution.ts` então o usa para substituir os `builtinModelIds` estáticos do Start. Portanto, alterar apenas o Built-in JSON é inefaz: ainda podem aparecer minúsculas após a atualização.

```text
Resposta oficial de saldo do Start (mantém os dados originais)
    -> extrai o model ID das capabilities
    -> normaliza e desduplica IDs GLM oficiais conhecidos
    -> lista de modelos do Account Provider
    -> Registry / seleção de modelo
    -> gravação e requisição real usam o ID real normalizado
```

- Tratar a grafia alvo dos GLM conhecidos nesse limite da lista oficial; modelos desconhecidos permanecem como estão; não reescrever a resposta de saldo nem deixar a normalização se espalhar para outros Provider ou para a exibição de cota.
- Preservar a semântica existente de benefícios, lista vazia, pending e desduplicação; o mapeamento não pode adicionar modelos que o servidor não concedeu.
- As listas estáticas atuais das contas pessoal／empresa e de off-peak já usam o estilo de maiúsculas acima; basta conferir a consistência; não alterar Ticket de off-peak já vinculado, execuções já fixadas nem a identidade de seus modelos.

### 2.3 Cadeia pública de consumo não muda

- A regra de recomendação `modelMatch` em `packages/provider/src/config/model-config.ts` já ignora caixa, não é preciso reescrever as regras genéricas; as regras exatas de template／Provider continuam com correspondência estrita.
- `effective-model-selection.ts`, a validação de modelos e o Registry continuam comparando por identidade exata; não se pode afrouxar todos os fornecedores só por esta organização da lista oficial.
- A lista de configurações e chat／automação／Subagent／Wiki compartilham o resultado de Registry／Selection View, sem conversão de exibição adicionar em cada superfície; seus rascunhos, momentos de gravação e posse da persistência permanecem inalterados.
- O Adapter hoje repassa o `modelId` vinculado ao SDK tal como está; manter esse comportamento; não criar atalho do tipo "exibe maiúscula, requisição volta escondido para minúscula".

## 3. Limites de compatibilidade já decididos

### 3.1 Seleções antigas em minúsculas e overrides pessoais

Seleções antigas em minúsculas, overrides exatos de modelos pessoais, membros／ordenação pessoais não se atualizam automaticamente com a renomeação do Built-in. Com a correspondência estrita da nova lista, essas referências antigas podem deixar de valer ou deixar de ter efeito.

- A decisão de "não migrar" do Todo111 fica limitada aos dois templates ainda não usados e não se estende automaticamente a todo o histórico de seleções do Start nem às configurações pessoais do usuário.
- Decisão complementar do usuário: no ponto de entrada de migração das seleções existentes, normalizar a caixa dos IDs de modelos antigos que pertencem claramente ao GLM oficial conforme a tabela de renomeação já definida nesta rodada, aumentando a robustez da migração; não estender a provedores de terceiros, Provider customizado ou à correspondência pública em tempo de execução, nem criar um sistema de migração separado para isso.
- Nesta rodada não se estende adicionalmente a migração de overrides exatos／membros／ordenação de modelos pessoais, nem se confunde isso com a migração de Seleções antigas; deixa de ser um item pendente de confirmação.
- Em qualquer caso, o modelo real de execução em mensagens históricas e os registros de uso de estatísticas não são reescritos pela nova nomenclatura; execuções já em andamento também não são retomadas nem trocadas de modelo.

### 3.2 Aceitação pelo endpoint oficial

Alterar o ID real muda o `model` na requisição real. O usuário já confirmou explicitamente que o endpoint oficial desta rodada aceita a caixa alvo, e isso é a premissa da implementação; não se exige nova decisão nem prova de compatibilidade via rede como gate de início ou de encerramento.

- A implementação ainda precisa verificar que lista, regras exatas, resultado da migração e ID final da requisição são consistentes, sem trocar silenciosamente por uma solução de nome de exibição nem converter para minúsculas em tempo de execução.
- Esta evidência é a confirmação do usuário, e não deve ser registrada como já verificada por requisição real nesta rodada; se a implementação gerar evidência real contrária, registrar o problema concreto sem ampliar previamente o escopo de compatibilidade de terceiros.

## 4. Implementação, testes e critérios de conclusão

Detalhamento de execução: o Todo109 congelou a conversão do banco em uma migration com checksum, portanto scripts históricos não podem ser modificados.
Sobre o mecanismo de banco já existente, acrescenta-se Agent `0021` / App `0003`, modificando apenas o `session_entry` atual
`runtime/model_selection.modelSelection.modelId` e `automations.model_selection.modelId`.
Aceitam-se apenas IDs explicitamente de conta oficial; não tocar em Personal ID, mensagens/partes históricas, automation_runs,
session_input, Ticket de off-peak, campos antigos ou timestamps. O SQL da migration congela constantes e não depende do catálogo de recomendações em tempo real.
Importações antigas de Subagent／Bot／Wiki fora do banco continuam fazendo a mesma normalização de IDs conhecidos em seus próprios pontos de migração já existentes.

Grafia exata da implementação (apenas caixa, sem alterar versões, separadores e números): `GLM-5.3`, `GLM-5.3-Flash`,
`GLM-5V-Turbo`, `GLM-5.2`, `GLM-5.1`, `GLM-5.1-Highspeed`, `GLM-5`, `GLM-5-Turbo`,
`GLM-4.7`, `GLM-4.7-FlashX`, `GLM-4.7-Flash`, `GLM-4.6`, `GLM-4.5-Air`, `GLM-4.5`,
`GLM-4.6V`, `GLM-4.6V-Flash`, `GLM-4.6V-FlashX`, `GLM-4.1V-Thinking-FlashX`,
`GLM-4.1V-Thinking-Flash`, `GLM-4-FlashX-250414`, `GLM-4-Flash-250414`, `GLM-4V-Flash`.
Os templates comuns `zai-standard-api` / `bigmodel-standard-api` usam o catálogo largo original; os templates de plano `zai-api` /
`bigmodel-api` mantêm apenas os dois modelos confirmados pelo Todo111. Membros não GLM permanecem como estão; GLM desconhecidos não têm grafia adivinhada.

- [x] Atualizar primeiro as specs relacionadas, listando a tabela exata de renomeação de todos os GLM no escopo e a atribuição final aos templates.
- [x] Adicionar primeiro testes com poder discriminante e só então implementar as mudanças de lista／regras exatas e da entrada de lista do Start; cobrir variantes de caixa, entradas duplicadas, modelos desconhecidos, lista vazia e não ampliação do conjunto de capabilities.
- [x] Membros dos templates oficiais correspondem às regras exatas; os estados de enablement, capabilities e configuração de raciocínio existentes ficam inalterados; GLM de terceiros com o mesmo nome, modelos customizados e não GLM ficam inalterados.
- [x] Conferir que a seleção pública continua com correspondência exata, que overrides pessoais e seleções antigas seguem a decisão final; não alterar mensagens históricas／estatísticas de uso nem introduzir atalho novo de execução de Selection.
- [x] E2E interativo direcionado para conferir que o que aparece nas configurações／seleção de modelo oficiais é o ID real e que o vínculo real e o wire usam o mesmo ID; reutilizar a cadeia de entrega original local e remota, sem mudar os limites de continuous do desktop／replayable do celular.
- [x] Executar na rodada os testes unitários relacionados, verificação de tipos, lint e asserções de ID de requisição, sem repetir regressão completa para cada modelo; a aceitação de caixa pelo endpoint oficial segue a confirmação do usuário, sem gate de aceitação via rede.
- [x] Revisar todos os destinos de renomeação, as restrições de escopo oficial e a interseção com o Todo111, submeter o código e as evidências, sem push automático.

Só é possível declarar conclusão depois que todo o escopo aprovado for implementado, revisado e verificado; atualmente não há itens pendentes de decisão e o escopo da migração não é ampliado por causa da discussão de encerramento.

## 5. Registro da investigação

Desta vez foi usado o modo impact-only do feature-boundary-planner, chegando ao escopo de impacto acima pela enumeração de configurações e pela verificação estática de referências exatas; não há ferramenta codegraph disponível e nenhum teste foi executado. Sugere-se que o mapa de funcionalidades futuremente inclua a relação de origem "normalização da lista oficial de modelos do Start" até o Registry; o grafo não foi alterado nesta rodada. A investigação não é prova prática da compatibilidade de caixa da interface.