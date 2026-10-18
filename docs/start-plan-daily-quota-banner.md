# Lembrete de bucket de cota do Start Plan

## Comportamento confirmado

- Remover os lembretes de 50% / 20%. Calcular `remaining_units / total_units` de forma independente para cada bucket de cota válido correspondente ao modelo atual; é possível alertar quando `0 < ratio <= 10%`.
- Buckets de campanha e buckets diários não misturam percentuais. O texto da cota diária é «{model} 今日额度剩余 {percent}（{remaining} tokens）。», ou seja, «Restam {percent} da cota de hoje de {model} ({remaining} tokens).»; para uma campanha pontual, «Restam {percent} da cota da campanha de {model} ({remaining} tokens).»; para os demais ciclos usa-se o termo neutro «套餐额度» (cota do plano), sem adivinhar o tipo de ciclo.
- A mesma combinação `bucket_id + period_start + period_end` é exibida de fato apenas uma vez. O registro não contém saldo, modelo, tarefa nem data local; nem mesmo quando um mesmo bucket atende a vários modelos há repetição. Um novo bucket ou um novo ciclo permite um novo lembrete, sem exigir que o saldo antes volte acima de 10%.
- O lembrete de 10% pode ser dispensado, preservando a entrada de upgrade. A exibição atual pode acompanhar a atualização do saldo, mas deixa de aparecer após dispensar, trocar de tarefa/modelo ou remontar; após o saldo subir de novo no mesmo ciclo, também não há repetição quando ele cair de novo até o limiar. Vários buckets elegíveis são exibidos sequencialmente na ordem do servidor, e um bucket já exibido não pode bloquear outros buckets ainda não alertados.
- Os lembretes são registrados no localStorage do cliente atual (salvos por chave de ciclo, sem guardar token nem conta em texto puro). São mantidos entre tarefas e reinícios do cliente; cada cliente registra de forma independente e não se promete sincronização entre dispositivos. Quando o armazenamento está indisponível, há degradação para deduplicação em memória do Renderer atual. A leitura, o registro e a limpeza por expiração dos registros de exibição usam o mesmo `snapshot.serverTime` (ou `generatedAt` quando ausente) usado para a validade dos buckets; não se usa `Date.now` do dispositivo nem se avança o relógio além do snapshot em cache. Dispensar apenas encerra o owner de exibição do registro já cadastrado e não reavalia a expiração do ciclo.
- Só quando todos os buckets válidos do modelo atual estão esgotados exibe-se «{model} 可用额度已用完，可切换其他模型或升级套餐。» («A cota disponível de {model} acabou; você pode trocar de modelo ou fazer upgrade do plano.»). Não se pode ignorar o bucket diário que ainda tem saldo só porque o bucket de campanha acabou.
- Quando todos os buckets de cota dos modelos válidos estão esgotados, exibe-se «体验套餐可用额度已用完，请升级套餐或等待额度恢复。» («A cota disponível do plano de avaliação acabou; faça upgrade do plano ou aguarde a reposição da cota.»). O esgotamento total tem prioridade sobre o esgotamento por modelo; o 1005 do servidor continua indicando diretamente o esgotamento total, e os ramos existentes de concorrência/rate limit/MCP permanecem inalterados. Nenhum desses avisos bloqueia o envio.

## Dados e limites

O `balances[]` de `GET /api/v1/zcode-plan/billing/balance` já retorna de fato bucket_id, user_plan_id, period_start, period_end e expires_at. O Service acrescenta campos opcionais ao `UsageQuotaLimit` existente; os tempos são convertidos uniformemente para milissegundos. O tipo de texto do período é associado por user_plan_id (ou plan_id quando o dado antigo estiver ausente) e entitlement_id a partir dos `plans[].entitlements[]` aos quais pertence.

Apenas leitura de buckets de uso por modelo; buckets com expiração conhecida ou ainda não vigentes são excluídos. A validade tem como referência `snapshot.serverTime` (ou `generatedAt` quando ausente), consistente com o snapshot do servidor, sem adivinhar a data do dispositivo. Campos ausentes ou números não finitos não podem ser julgados erroneamente como 0; snapshots antigos sem bucket_id ou ciclo válido não disparam o lembrete único de cota baixa, mas permitem concluir esgotamento com base em um valor restante explícito. O fim do ciclo e a expiração do bucket têm significados independentes, e `expires_at` não pode mais substituir a identidade do ciclo.

## Posse do estado

A antiga chave de dispensa incluía remainingTokens/remainingPercent, então cada mudança de saldo reapresentava o aviso; o julgamento antigo de modelo apenas fazia `find` no primeiro bucket, podendo reportar esgotamento de modelo indevidamente.

O julgamento puro continua pertencendo a `sessionQuotaBannerState`; o registro de uma exibição pertence a um Start Plan reminder store independente. O antigo `sessionQuotaBannerDismissalStore` continua responsável apenas pelas dispensas de escopo de sessão de outros erros, sem misturar persistência por ciclo. A marcação ocorre apenas quando o Banner está de fato visível; página oculta, encoberto por outro erro ou apenas com estado calculado não consome a contagem.

```text
balance -> Service mapeia bucket/ciclo/tipo de texto -> candidatos de 10% por bucket
                                               |
                                      Banner realmente visível -> salvar ciclo já exibido
                                               | mesma instância de exibição: manter e atualizar saldo
                                               | nova tarefa/dispensa/reinício: não repetir
                                               | novo bucket/ciclo: permitir lembrete
conjunto de buckets válidos do modelo -> todos esgotados? -> esgotamento de modelo/total (não afetado por registros já alertados)
```

A UI React compartilhada cobre desktop e Web mobile, chinês e inglês, e tema claro e escuro. Apenas se acrescentam dados de entitlement e estado de exibição no Renderer, sem alterar o protocolo do Agente, fila, owner, restauração de snapshot ou host attachment.

```text
desktop continuous -> encadeamento tempo real existente -> UI de lembrete compartilhada
mobile replayable -> encadeamento de restauração existente -> UI de lembrete compartilhada (registro deste cliente)
```

## Verificação

- Um único bucket com 50/48/47/20/10.1 não gera lembrete; 10/9 gera; o percentual é um valor calculado, não um arredondamento.
- Bucket de campanha de 300 milhões e bucket diário de 5 milhões geram lembretes independentes; um bucket esgotado não gera esgotamento de modelo se outro bucket do mesmo modelo ainda tem saldo; esgotamento de modelo e total são mantidos separadamente.
- A deduplicação por ciclo não muda com saldo, ordenação, tarefa ou modelo; novo ciclo e novo bucket são independentes; exibição real, dispensa, remontagem, restauração após reinício e verificação em StrictMode.
- Números ausentes/anômalos, ciclos desconhecidos, buckets expirados e ainda não vigentes não geram avisos falsos de cota baixa ou esgotamento.
- Testes unitários de mapeamento do service, de estado puro e de store; cobertura de hook/Banner em navegador real para desktop/mobile, tema claro/escuro e chinês/inglês; os testes usam um serviço de entitlement substituto em vez do backend e não gravam dados reais de conta.

### CR-01 — regressão da base de tempo do fim do ciclo

Quando o relógio do dispositivo está adiantado/atrassado, ou quando o fim de ciclo do snapshot em cache já foi ultrapassado pelo horário local, desde que o snapshot atual ainda considere o bucket válido, a exibição precisa poder ser registrada, a dispensa precisa ter efeito imediato e trocar de tarefa ou recarregar o Renderer não pode repetir. Ao receber um snapshot de novo ciclo, um novo lembrete é permitido. Unifica-se o tempo do snapshot, sem introduzir um segundo estado de dispensa nem um fallback de timeout.
