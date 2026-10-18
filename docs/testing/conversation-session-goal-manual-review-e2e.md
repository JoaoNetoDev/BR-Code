# Conversation Session Goal Manual Review E2E

## Contexto

Este é um conjunto de E2E de julgamento humano, de um período especial. O objetivo não é fixar imediatamente as expectativas do produto em asserções estritas, mas primeiro rodar automaticamente os caminhos relacionados a goal, gerando screenshots, estado da UI, estado da queue, compact marker, blocos de chamada de ferramenta e captura de rede do DeepSeek, para facilitar o review humano do comportamento.

Esse tipo de caso não substitui a regressão formal. Depois da confirmação humana, os caminhos estáveis precisam ser consolidados em E2E comuns, com asserções de UI, protocolo, logs, arquivos e camada de rede.

## Como executar

A execução completa de E2E desktop não roda o manual review spec por padrão. É preciso habilitar explicitamente:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 \
E2E_PROVIDER_API_KEY=<real-provider-key> \
pnpm exec wdio run wdio.conf.ts \
  --spec ./test/e2e/conversation-session/conversation-session-goal-run-cases.test.ts
```

O modo manual review força o uso da cadeia real de captura do DeepSeek v4 flash, sem passar pelo fixture de replay. Após a execução, os artefatos ficam em:

```text
packages/desktop/.e2e-artifacts/<run-id>/manual-review/goal-run-cases/
```

Cada caso gera:

- `steps.ndjson`: registro estruturado de cada passo.
- `summary.md`: resumo para review humano.
- `*.png`: screenshots dos passos-chave.
- Arquivos de captura do DeepSeek no nível superior: a captura de rede para a qual `E2E_PROVIDER_CAPTURE_PATH` aponta.

Por padrão, o proxy de captura coloca a CA e os arquivos de captura em `packages/desktop/.e2e-network-capture/`. Esse diretório não pode ficar dentro de `.e2e-home`, porque o WDIO limpa `.e2e-home` antes de iniciar cada session para garantir o isolamento dos testes; se a CA for apagada pelo reset, o subprocesso do agent falha direto com `ENOENT` ao ler `httpProxyCaCertPath`.

O modo capture precisa capturar apenas as requisições reais ao provider DeepSeek. Por padrão, `NO_PROXY` contorna `localhost`, `js.stripe.com`, `zcode.z.ai` e `cdn.zcode-ai.com`, evitando que requisições de telemetry/CDN da fase de startup do app gerem alertas de certificado irrelevantes ao entrarem no proxy MITM.

## Estado de startup predefinido

Os casos de manual review não devem gastar tempo repetindo login e configurando modelo. O `beforeSession` do WDIO, depois de resetar `.e2e-home`, predefine diretamente:

- `setting.json`: grava `providerFamilyDomain=zai`, `providerFamilyDomainMigrated=true` e `modelProviderFamilyModes.zai=apiKey`, evitando que a página de boas-vindas peça login novamente.
- `credentials.json`: grava um token placeholder exclusivo do e2e, usado apenas para passar pela guarda de startup local.
- `model-providers.json` e o `config.json` da CLI: gravam `e2e-upstream/deepseek-v4-flash`.
- `httpProxy` e `httpProxyCaCertPath` no modo capture: injetados no subprocesso do agent pela semântica de proxy da página de configurações, garantindo que as requisições reais ao DeepSeek entrem no proxy de captura.

`prepareConversationE2E()` tenta primeiro entrar direto no workspace padrão; só recorre ao login via API Key na UI quando a predefinição está ausente. O helper do DeepSeek, ao detectar que o provider predefinido já está disponível, também pula a página de configurações e só faz uma correção pela UI quando o modelo atual da barra de ferramentas difere.

## Requisito de chamadas de ferramentas somente-leitura

O prompt de goal precisa exigir que o agent use ferramentas somente-leitura, evitando que ele retorne apenas texto puro. O prompt atual de manual review exige pelo menos a tentativa de:

- `Glob`: localizar arquivos do projeto.
- `Grep`: buscar conteúdo relacionado a goal / conversation-session.
- `Read`: ler os arquivos encontrados.

O prompt também proíbe explicitamente `Edit`, `Write`, exclusão, movimentação, instalação, commit e outras operações com efeito colateral. O teste não fixa como asserção que “o conteúdo das chamadas de ferramentas está totalmente correto”, mas registra os blocos de tool call que aparecem na UI para julgamento humano.

## Caminhos de execução cobertos atualmente

- completed + sem goal + `/goal`
- completed + com goal existente + `/goal`
- running + sem goal + `/goal`
- running + com goal existente + `/goal`
- goal running + stop
- interrupted held queue + `/goal`
- edição, exclusão e reordenação de goal na held queue
- manual compacting + `/goal`
- auto compact antes de goal enfileirado
- troca de sessão + goal

No cenário de manual compact, exige-se apenas produzir evidência observável de marker / streaming / queue após a operação `/compact`; não se afirma, na fase de manual review, que a compactação necessariamente funcionou. Com DeepSeek real e uma context window muito pequena, o manual compact pode se entrelaçar com o auto compact, e o marker pode ser `started`, `failed` ou assumido pelo auto compact — tudo isso é entregue primeiro ao review humano.

## Prompts aguardando reprodução humana

Estes prompts são consolidados primeiro como entradas de reprodução humana, não entram nas estatísticas de validação automática e não representam asserções WDIO existentes. Depois de confirmar os pontos de observação e as expectativas do produto, decide-se se serão convertidos em E2E estáveis.

### MR-GOAL-PROMPT-01 — Restauração do timeline após continuação automática de goal longo

Objetivo: reproduzir o cenário em que, após o goal continuar automaticamente por várias rodadas, a UI renderiza de uma só vez o `goalVerificationTimeline` histórico ao voltar para o primeiro plano/recarregar, parecendo visualmente vários verifiers empilhados.

Entrada:

```text
/goal 帮我写一个10万字论文，解释AI存在的意义，直接开始输出，不用写到文件里
```

Operação manual:

1. Criar uma nova task local no desktop.
2. Enviar o prompt `/goal` acima.
3. Esperar chegar à 2ª/3ª rodada, sem parar.
4. Em alguma rodada em que o corpo da resposta da assistant termina e entra perto do verifier, tirar a UI do primeiro plano: trocar para outra task, trocar para outro workspace ou fechar a janela e reabrir.
5. Esperar cerca de 60 segundos, deixando o background completar algumas rodadas de `turn -> verifier -> continuation`.
6. Voltar à task original e observar se o goal verifier timeline exibe claramente as rodadas, a ordem e a relação temporal.

Observação opcional de logs:

```bash
tail -f ~/.zcode/cli/log/zcode-$(date +%F).jsonl | rg "target\.continuation|target\.completion_verification|turn\.started|turn\.completed"
```

Pontos de observação humana:

- Se a camada da CLI continua serial em `turn -> verifier -> continuation`, em vez de vários verifiers iniciados em paralelo.
- Se o verifier retorna `passed:false` e segue para a próxima rodada, o que é comportamento normal da lógica atual de goal.
- Se, após a restauração em primeiro plano, a UI insere em lote os dividers sintéticos históricos no fluxo de mensagens.
- Se a iteração no texto do timeline aparece duplicada, com número pulado ou fora de ordem, por exemplo dois `Iteration 6` idênticos.
- Se visualmente parecer que “as validações foram empilhadas”, é preciso distinguir se é concorrência real no runtime ou um problema de exibição na restauração ao mesclar snapshot/live.

## Atenção

- Este conjunto acessa o DeepSeek de verdade; limitação de upstream, saldo, rede e certificados afetam o resultado.
- Screenshots servem apenas como evidência humana, não como base para julgamento automático.
- Para facilitar o review, os casos param ativamente alguns goals de execução longa, evitando que as chamadas reais de modelo fujam do controle.