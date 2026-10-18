# Todo159: orçamento de saída do teste de conectividade unificado em 512 tokens

Status: pendente de execução; em 2026-09-17 o usuário confirmou o valor alvo de 512. Esta rodada registra
apenas o Todo e as evidências da investigação, sem modificar código do produto nem a configuração do Air.

## Problema e evidências reais

O ZCode 3.12.2 no MacBook Air falhou ao testar OpenCode Go (Responses) com o modelo `gpt-5.6-luna` na página
de configurações. As duas requisições de 2026-09-17 18:00:03 e 18:00:06 (Asia/Shanghai) retornaram HTTP 400;
as requisições continham `reasoning.effort: "none"` e `max_output_tokens: 1`.

- Reproduzindo com a Key, o endereço, o prompt e os parâmetros de requisição originais do Air, o erro bruto
  do servidor foi: `[integer_below_min_value] Invalid 'max_output_tokens': integer below minimum value. Expected a value >= 16, but got 1 instead.`
- A requisição de controle, alterando apenas `max_output_tokens` para `16`, retornou HTTP 200, texto normal e
  `response.completed`. Essa evidência prova que a falha de conexão foi disparada pelo limite inferior do
  orçamento de saída; 512 ainda não foi testado na prática, portanto o resultado de controle com 16 não pode
  ser registrado como aceitação de 512.
- Os registros originais das falhas ficam no `~/.zcode/cli/log/zcode-2026-09-17.jsonl` e no
  `~/.zcode/cli/rollout/model-io-sess_8c93aadb-89ce-4f3e-bee9-8aaa0de12488.jsonl` do Air. O documento não
  guarda a Key.
- O [ponto de entrada do teste de conectividade do Core](../../../../apps/zcode-cli/packages/core/src/runtime/methods/workspace-generate-text.ts)
  atual fixa `CONNECTIVITY_PROBE_MAX_OUTPUT_TOKENS` em `1`; a
  [normalização de erros](../../../../apps/zcode-cli/packages/adapters/src/model/failure-classifier.ts)
  exibe esse 400 como o `Provider rejected the model request.` genérico. A otimização das mensagens de erro
  não faz parte deste item.

## Alvo e limites confirmados

1. O orçamento de saída independente de `testModelConnectivity()` no Core muda uniformemente de `1` para
   `512`, valendo para o teste de conectividade de todos os Providers, sem adicionar caso especial para
   Luna/OpenCode e sem elevar o orçamento dinamicamente em caso de falha.
2. Continua-se tomando o primeiro item da escala ordenada pública de raciocínio do modelo; o texto do system
   `You are ZCode connectivity probe.`, o user `hi`, seus papéis e sua ordem mantêm o contrato original, sem
   misturar histórico nem ferramentas.
3. Preservam-se o fluxo normal e o tratamento de erros: finish normal (incluindo length) é sucesso, corpo
   vazio é permitido; error, ausência de finish, timeout, autenticação e rejeição de parâmetros continuam
   falhando. Mantém-se o retry existente para resposta vazia, também com orçamento 512.
4. Apenas o orçamento do teste de conectividade muda. Sessões comuns, orçamentos de geração auxiliar (Git,
   títulos, etc.), o limite de capacidade de saída do modelo, as configurações e seleções salvas pelo
   usuário permanecem inalterados; nenhuma configuração, protocolo, persistência ou migração é adicionada.
5. A estratégia de orçamento continua sendo mantida exclusivamente pelo ponto de entrada de teste de
   conectividade do Core; desktop, worker remoto e shared-host do celular reutilizam a cadeia existente,
   preservando as boundaries de workspaceIdentity, owner e continuous/replayable.

Este item substitui a decisão de “teste de conectividade fixo em 1 token” do
[Todo144](todo-144-connectivity-one-token-budget.md); os demais contratos e registros históricos de validação
são mantidos. 512 é o valor alvo definido desta vez e não representa compatibilidade verificada com todos os
provedores upstream.

## Implementação e aceitação

- [ ] Atualizar primeiro, para 512, as descrições ainda aplicáveis do orçamento do teste de conectividade na
  [Especificação de teste de conectividade das Settings](../design/registry/settings.md), nos
  [Casos de teste de conectividade do desktop](../../../testing/desktop-local-model-provider-p0-e2e-cases.md)
  e no [Contrato de requisição do OpenRouter](../../../openrouter-reasoning-request-contract.md),
  preservando os testes de Adapter com baixo orçamento que não têm relação com este item.
- [ ] Atualizar primeiro os
  [Testes do Core](../../../../apps/zcode-cli/packages/core/tests/workspace-generate-text-streaming.test.ts)
  para provar que a implementação antiga não atende a 512, e só então alterar a constante de produção.
  Continuar validando o nível mínimo de raciocínio, o prompt fixo, sucesso com stop/length sem corpo, falha
  com stream anormal/sem finish e a confirmação de que o orçamento auxiliar de Git continua em 5.000.
- [ ] Atualizar os [Testes de wire do Adapter](../../../../apps/zcode-cli/packages/adapters/tests/connectivity-probe-wire.test.ts):
  os valores realmente serializados `max_tokens` do Anthropic, `max_completion_tokens` do Chat e
  `max_output_tokens` do Responses devem ser 512; preservar os mapeamentos de protocolo, o prompt e as
  asserções de identidade.
- [ ] Atualizar o
  [E2E de teste de conectividade](../../../../packages/desktop/test/e2e/settings/manual-review/pending/provider-connectivity-prompt.test.ts)
  e o
  [E2E de fallback de reasoning](../../../../packages/desktop/test/e2e/settings/manual-review/pending/provider-reasoning-fallback.test.ts).
  Validar por clique na linha real do modelo que o budget de wire é 512, que finish normal tem sucesso, que
  400 ainda falha e que a seleção Personal/sessão não muda; adicionar um cenário de regressão em Responses
  que rejeite orçamentos abaixo de 16, reproduzindo as condições de falha do Luna desta vez.
- [ ] Testar na prática o Air com OpenCode Go / `gpt-5.6-luna` em 512 concluindo normalmente o teste de
  conectividade, registrando versão executada, orçamento da requisição e estado final; não substituir a
  aceitação do App modificado pelo comparativo direto de API com 16 tokens desta vez.
- [ ] Executar os testes relevantes, typecheck, lint, verificação de arquitetura e os E2E afetados conforme
  as regras da raiz e do subnível CLI; cobrir os caminhos de desktop/celular afetados, registrando
  explicitamente itens não verificados quando houver bloqueio de ambiente remoto ou móvel. Após as validações
  necessárias passarem, revisar o próprio diff e commitar.

A entrega atual é apenas a lista de pendências acima; o código, as requisições reais com 512 e a aceitação
do App modificado ainda aguardam execução.