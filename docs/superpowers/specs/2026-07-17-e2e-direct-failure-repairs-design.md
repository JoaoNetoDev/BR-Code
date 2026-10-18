# Design de Correção dos 11 Falhas de E2E Reparáveis Diretamente

## Escopo

Desta vez são corrigidas apenas as 11 falhas do `summary.json` já confirmadas como tratáveis diretamente:

- 6 casos Turbo provider (I35～I39, I42): completar o reconhecimento de spec do mock do WDIO Coding Plan.
- 2 casos DeepSeek (I25, I29): o replay case-local cobre simultaneamente o `/chat/completions` OpenAI do
  provider seed e o `/messages` Anthropic para o qual a janela reiniciada pode restaurar primeiro; o case
  verifica apenas provider/model, sem trazer a corrida do protocolo de transporte para dentro da semântica.
- `conversation-session-v4-refresh-permission`: parar de depender do texto da regra exata, oculto por decisão
  de design do produto, e localizar "Sempre permitir" pela semântica estável da opção de permissão.
- `conversation-session-v4-queue`: a asserção do toast de conflito de fila aceita ao mesmo tempo os textos em
  chinês e em inglês suportados pelo produto.
- `conversation-session-v4-load-older`: registrar a âncora real do turn visível ao disparar o carregamento de
  páginas anteriores e corrigir o viewport pela diferença de geometria do DOM após o prepend; a diferença de
  altura total existente é mantida como fallback quando não há âncora no DOM.

I27 e I28 não estão no escopo desta vez; mesmo que a correção compartilhada altere seus resultados, eles não
são declarados como corrigidos.

## Causa Raiz e Limites

### Contrato de inicialização de provider e replay

Após separar o spec do Turbo, `shouldUseCodingPlanTeamMock` continua reconhecendo apenas o spec antigo, o que
deixa o provider registry sem Coding Plan disponível. O provider de inicialização do DeepSeek já usa
`anthropic-messages`, mas os dois fixtures antigos ainda casam `/chat/completions` e devolvem SSE da OpenAI.

```text
formal spec -> WDIO spec gate -> Coding Plan mock -> provider registry -> toolbar/session
                                  ^
                                  | 漏掉两个拆分后的 Turbo spec

startup DeepSeek(apiFormat=anthropic-messages) -> POST /anthropic/v1/messages
seeded DeepSeek(apiFormat=openai-compatible)   -> POST /chat/completions
case-local fixture                             -> 两种稳定响应合同
```

A correção atualiza apenas a infraestrutura de E2E e os fixtures, sem alterar a lógica de produto do
provider.

### Localização da opção de permissão

A regra exata não é exibida por decisão de design de produto já definida, portanto o helper de E2E não pode
mais usar `data-permission-rule-scopes` para inferir allow-always. O `PermissionDialog` expõe o display kind
normalizado nos botões de opção, e o helper seleciona por `allowAlways`. O case de refresh continua provando
a restauração da regra por "o diálogo reaparece, a aprovação funciona e o comando exato repetido não pergunta
de novo", sem afirmar o texto oculto.

### Aviso de conflito de rascunho na fila

```text
workspace locale=zh-CN -> 产品显示中文 toast
                           |
旧 E2E 只匹配英文 ----------+-> 误报 toast 缺失
```

O log de runtime confirma que o produto bloqueou corretamente o cancelamento e exibiu o toast em chinês; a falha vem
de o teste herdar o locale do workspace e continuar casando apenas o inglês. A asserção passa a aceitar os
textos em chinês e inglês da mesma chave i18n, sem modificar o comportamento de admissão da fila, o
continuous do desktop nem o replayable da Web.

### Âncora do load older

```text
用户接近顶部
  -> 记录首个可见 turnId + viewport offset
  -> onLoadOlder
  -> prepend commit
  -> 同一 turn 新 offset - 旧 offset
  -> scrollTop += delta（绘制前）
```

A lógica antiga comparava apenas `virtualizer.getTotalSize()`: quando a nova altura estimada pelo prepend
ainda não entrou nesse valor, o delta é 0, e o commit seguinte já perdeu a janela de detecção de "a primeira
linha ficou menor". A âncora real do DOM tem prioridade, e o fallback da diferença de altura total existente
mantém a compatibilidade com janelas virtualizadas cuja âncora ainda não foi montada.

## Verificação

- Testes unitários de nível de segundo cobrem o Turbo spec gate, o permission option kind e o delta da
  âncora de prepend.
- Os dois specs de model-provider executam a verificação de fixtures.
- Executar os testes direcionados de UI/desktop afetados.
- Por fim, executar `pnpm typecheck` e `pnpm lint` na raiz.