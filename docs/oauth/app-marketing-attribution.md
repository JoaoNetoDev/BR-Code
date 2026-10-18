# Atribuição de Marketing e Telemetria do App

## Objetivo

O ZCode Desktop recebe a atribuição de marketing do site oficial a partir do callback OAuth unificado e carrega, de forma fixa, o campo string de nível superior `marketing_params` em todos os eventos de negócio do App enviados para `/api/v1/event/report`.

## Protocolo de Callback

O callback unificado `zcode://oauth/callback` aceita:

- `channel_id`
- `utm_source`
- `utm_campaign`

Os três parâmetros de marketing podem existir parcialmente, e valores em branco não são salvos. O App não recebe nem mantém prazo de validade para a atribuição de marketing.

## Ciclo de Vida

```text
startOAuth
  -> pending(state, phase="awaiting-attribution-or-code")
       ├─ 首次纯归因回调
       │    -> 保存归因
       │    -> pending(state, phase="awaiting-code-after-attribution")
       │         ├─ 重复纯归因回调 -> 拒绝，不重复写入
       │         └─ 最终授权码回调 -> 清理 pending -> token 交换
       ├─ 直接收到最终授权码回调 -> 清理 pending -> token 交换
       ├─ 再次 startOAuth -> 清理旧 pending -> 创建新 state
       └─ 5 分钟超时 -> 清理 pending

本地归因记录
  -> telemetry 上报读取
       ├─ 读取成功 -> marketing_params={...}
       └─ 读取失败 -> 单次受控告警 + marketing_params={}，继续上报
```

- Um novo callback de promoção válido sobrescreve por completo os valores antigos.
- O callback apenas de atribuição é uma etapa de transição antes da autorização final, aceito no máximo uma vez por OAuth state; ele não consome o callback do código de autorização final.
- Um callback apenas de atribuição repetido não pode gravar a atribuição de novo, nem estender o ciclo de vida de 5 minutos do pending state.
- Reiniciar o OAuth cancela o state antigo; a autorização final após a atribuição só pode continuar no mesmo state que ainda não expirou.
- A atribuição salva não expira automaticamente com o tempo, até que uma nova atribuição a sobrescreva ou que as credenciais locais sejam limpas.
- É compatível com a estrutura de armazenamento `{ params, expiresAt }` usada brevemente no início deste branch; na leitura, `expiresAt` é ignorado e apenas os três campos de marketing são mantidos.

## Contrato de Telemetria

Todos os eventos reportados por `TelemetryCore` para `/api/v1/event/report`, incluindo
`app_launch`, `app_daily_active` e os eventos de negócio do renderer, carregam:

```json
{
  "marketing_params": "{\"channel_id\":\"douyin\",\"utm_source\":\"wechat\",\"utm_campaign\":\"summer_sale_2026\"}"
}
```

Sem atribuição, o campo ainda é mantido:

```json
{
  "marketing_params": "{}"
}
```

Crash, performance, recursos e observabilidade de rede do ARMS não pertencem aos eventos de negócio de `/api/v1/event/report` e não carregam atribuição de marketing.

A leitura das credenciais de atribuição é contexto adicional da telemetria, não um pré-requisito do envio. Mesmo com exceção na leitura, o evento original continua sendo enviado, com `marketing_params` como objeto vazio; dentro de um mesmo ciclo de vida de `TelemetryCore`, um aviso fixo e anonimizado é registrado apenas uma vez pelo service logger, sem anexar Error original, stack, caminho local ou detalhes do backend de credenciais, evitando spam de eventos de alta frequência e ampliando a exposição de privacidade.

## Cobertura de Correções em Revisão

| Case ID     | Setup                          | Action                             | Assertions                                                |
| ----------- | ------------------------------ | ---------------------------------- | --------------------------------------------------------- |
| OAuth-ATTR-01 | pending state ainda sem atribuição | entregar callback apenas de atribuição | salva uma vez e entra em `phase="awaiting-code-after-attribution"` |
| OAuth-ATTR-02 | o mesmo state já recebeu atribuição | repetir o callback apenas de atribuição | rejeita e não sobrescreve a primeira atribuição |
| OAuth-ATTR-03 | o mesmo state já recebeu atribuição | entregar o código de autorização final | limpa o pending e conclui o login |
| OAuth-ATTR-04 | o state antigo já recebeu atribuição | chamar `startOAuth` novamente | o state antigo expira e o novo state pode continuar |
| OAuth-ATTR-05 | o mesmo state já recebeu atribuição | aguardar mais de 5 minutos e entregar o código | rejeitado por expiração do state |
| OAuth-ATTR-06 | falha na leitura das credenciais de atribuição | envio de telemetria | continua enviando com `{}` e emite aviso apenas uma vez |

## Limites de Armazenamento

A atribuição é armazenada com a key `oauth:login_attribution`, salva de forma criptografada pelo CredentialService no armazenamento de credenciais global do App.
Ela não é isolada por provider, janela ou workspace: janelas de workspace local e remoto compartilham a mesma atribuição de App.