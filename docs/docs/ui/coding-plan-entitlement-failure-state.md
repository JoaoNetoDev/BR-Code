# Estado de Falha de Entitlement do Coding Plan

## Contexto

Na página de configurações de Model Provider, as áreas de conteúdo de Z.ai / BigModel Start Plan e Coding Plan consultam o estado de entitlement via `useUsageEntitlement`. Anteriormente, se a promise de consulta ficasse pendurada por causa da rede do Windows, do proxy ou da cadeia de certificados do sistema, o Plan Card permaneceria em `Checking` e o usuário não conseguiria distinguir se ainda estava carregando ou se já tinha falhado.

## Design

- O Plan Card não ganha skeleton de card inteiro nem um novo nível visual.
- A consulta de entitlement precisa ter um limite de timeout no frontend; após o timeout, reutiliza-se o estado `unavailable` existente, exibindo “获取失败 / Fetch failed” (Falha na obtenção / Fetch failed).
- Havendo cache e timeout no refresh silencioso, o snapshot em cache é mantido: apenas se sai do loading e o erro é registrado, evitando que uma oscilação de rede transforme brevemente um plano disponível em estado vazio.
- Na primeira consulta sem cache, um timeout limpa o snapshot e entra no estado de falha, evitando um `Checking` infinito.
- O estado de falha continua preservando as entradas existentes de conexão, retry ou novo login, sem alterar o family mode de Z.ai / BigModel, o provider id nem as regras de julgamento de entitlement.

## Superfície de impacto

- Desktop, Web e mobile remote compartilham o hook de UI; o timeout afeta apenas o estado de exibição do entitlement, sem mudar o provider registry, o realtime de task, o stream ou a semântica replayable/continuous.
- O comportamento é unificado em Windows/macOS/Linux: quando a requisição subjacente não faz settle dentro do timeout, o estado sai de `checking` para `unavailable`.

## Novo login após falha de credencial do plano pessoal

No estado `credential-failed` do Coding Plan pessoal de Z.ai / BigModel, a ação à direita é "重新登录" (fazer login novamente), com a explicação "获取套餐失败，请重新登录后重试。" (Falha na obtenção do pacote, faça login novamente e tente de novo.). Esse estado não deve ser interpretado como OAuth expirado e não desloga a conta automaticamente. Outras falhas, não logado, não comprado e os estados Start/Team mantêm o comportamento original. Quando um Start Plan já logado falha na obtenção do plano, a opção "重试" (tentar de novo) continua sendo oferecida, usando o refresh manual do Host; um Start Plan sem login continua passando pelo fluxo de login.

```text
Host Account State: credential-failed → a página de configurações exibe a mensagem de falha
usuário clica em refazer login → onLogin({ forceOAuth: true })
→ requestLoginEntry(family atual) já existente → login OAuth unificado
→ oauth-login-entitlement → o Host obtém as credenciais novamente e publica os direitos
```

O estado de login continua gerenciado pelo fluxo de login unificado; a UI não ganha cache de credenciais nem um novo owner de estado. Desktop e celular compartilham o componente e os limites de restauração continuous/replayable não são modificados. Cancelamento ou falha seguem o fluxo de login já existente, permitindo nova operação a qualquer momento.

Aceitação: os dois planos pessoais exibem o novo login e a mensagem de falha; o clique precisa passar forceOAuth (mesmo já logado no mesmo family não pode degradar para refresh silencioso); o botão fica desabilitado durante o loading; os outros planos não exibem esta ação exclusiva. A cobertura de navegador dos componentes cobre desktop/tela estreita, zh/en e temas claro/escuro; o fixture de componentes não equivale a um E2E completo de OAuth no Electron ou no mobile remote.