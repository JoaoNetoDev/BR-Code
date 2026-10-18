# Entrada de upgrade do Coding Plan na barra lateral

## Contexto

O menu do avatar na barra lateral mantém a entrada de upgrade do Coding Plan, para que o usuário entre de forma estável no fluxo de compra/renovação de planos a partir do menu de conta. A entrada não depende mais de o snapshot de quota / remaining / subscription decidir se é exibida, evitando que a entrada desapareça quando o usuário está desconectado, usa apenas uma API Key comum ou o estado do plano está temporariamente indisponível.

## Visibilidade

O item de menu "Upgrade" é sempre exibido no menu do avatar. Ele não é mais ocultado por nenhum dos seguintes estados:

- Usuário desconectado ou em recuperação via OAuth.
- O modelo atual não é Coding Plan.
- O provider do Coding Plan está indisponível, não configurado ou com o entitlement em carregamento.
- O entitlement retorna `no_plan` / `unavailable` / já existe um plano / Team / Enterprise / Max.

## Comportamento

Ao clicar em "Upgrade", o `CodingPlanUpgradeDialog` existente é chamado diretamente:

- Se o contexto atual conseguir resolver um provider Z.ai / BigModel Coding Plan, o provider correspondente é aberto.
- Se não for possível resolver o provider, o Z.ai Coding Plan é aberto por padrão.
- Se o entitlement atual for reconhecível como Max, o texto exibido continua sendo renovação; caso contrário, exibe upgrade.