# Reautenticação por Expiração do JWT do ZCode

## Status

- Este documento define a semântica de recuperação de autenticação do desktop e da Web depois que o `zcodejwttoken` expira.
- A assinatura e a validade final do `zcodejwttoken` continuam sendo responsabilidade do servidor; o cliente apenas faz o parse do JWT `exp`, usado para evitar restaurar sessões locais claramente expiradas.

## Problema

A implementação antiga restaurava o estado de exibição de login a partir do `user_info` em cache, verificando apenas se o `zcodejwttoken` existia, sem checar o `exp` do JWT. Assim, depois que o JWT expirava, a UI continuava mostrando o usuário como autenticado, mas o saldo, os modelos e as demais requisições de negócio continuavam carregando credenciais expiradas e falhavam.

O antigo `useTokenRefresh` expunha apenas um callback, sem realmente escutar 401; além disso, Z.AI / BigModel atualmente não possuem uma implementação de refresh no cliente capaz de renovar o `zcodejwttoken`, portanto, quando a expiração é confirmada, é obrigatório fazer login novamente.

## Semântica de produto

A restauração da sessão em cache retorna três estados estruturados:

- `authenticated`: usuário em cache completo e o JWT não foi julgado como expirado pelo cliente.
- `signed-out`: não há sessão em cache completa; não exibe aviso de expiração.
- `reauthentication-required`: o JWT contém um `exp` válido e já expirou em relação ao horário atual (incluindo desvio de relógio).

Quando o JWT não pode ser interpretado ou não possui `exp`, o cliente não consegue provar que ele expirou e continua tratando-o conforme a compatibilidade com o cache; o servidor ainda pode rejeitá-lo em requisições posteriores. A transmissão unificada de invalidação por 401/403 do servidor é um trabalho separado e posterior, e não será espalhada por correspondência de string para todos os providers nesta correção.

## Estados e sequência

```text
Sessão OAuth persistida
        |
        v
Ler user_info + zcodejwttoken
        |
        +-- sessão incompleta ----------------------> signed-out
        |
        +-- JWT sem exp utilizável / ainda não expirado --------> authenticated
        |
        +-- exp do JWT já expirado
                |
                v
        Dentro da fila de mutations, reverificar se provider, user_info,
        zcodejwttoken e a generation da sessão ainda correspondem ao snapshot lido
                |
                +-- o snapshot mudou (novo login / troca de provider)
                |       |
                |       v
                |   Abandona a limpeza antiga e relê a sessão atual
                |
                +-- o snapshot continua igual
                |       |
                |       v
        Limpeza atômica do provider ativo, do token OAuth,
        do zcodejwttoken e do user_info em cache
                |
                v
        Melhor esforço de limpeza dos providers derivados Coding / Start Plan
        (a falha apenas registra warn e não pode restaurar o antigo estado de login)
                |
                v
        reauthentication-required
                |
                v
        A UI exibe "登录已过期，请重新登录"
                |
                v
        O usuário clica em "重新登录" -> página de login Welcome
```

## Restrições de interação

- A expiração de autenticação não é um logout iniciado pelo usuário; não exibe "确认断开连接" nem a confirmação secundária de sessão em execução.
- A limpeza dos fatos de autenticação acontece antes da exibição do diálogo; o diálogo não pode se tornar um ponto de bloqueio para continuar usando o JWT antigo.
- Depois que o usuário clica em "重新登录", a entrada de login Welcome existente é aberta diretamente, sem disparar telemetry de logout ativo nem relaunch do App.
- O gate de inicialização de provider só pode fechar o `startup-provider-required` que ele próprio abriu; não pode sobrescrever com `open=false` o `session-expired` escrito pelo fluxo de expiração do JWT.
- No máximo um aviso de expiração é exibido por restauração de inicialização.
- O Root do desktop usa um AlertDialog unificado, com suporte a chinês e português e aos temas claro e escuro; a entrada de login da Web, depois de limpar o localStorage expirado, volta direto para a página de login, sem restaurar um pseudo estado de login.

## Limites de processo e de múltiplos clientes

- O Local Host OAuth service é o owner autoritativo das credenciais OAuth locais do desktop; o renderer apenas consome o resultado estruturado da restauração.
- O login da Web usa o localStorage do navegador, mas reaproveita a mesma semântica de decisão baseada no `exp` do JWT.
- O workspace remoto não cria um estado de autenticação independente; o tratamento de expiração não modifica task/session, relay, stream, snapshot nem estado de owner.
- Esta alteração não muda o caminho de mensagens de `desktop-continuous` nem de `web-remote-replayable`.

## Requisitos de verificação

- Um JWT expirado não pode restaurar o usuário em cache e deve limpar as credenciais da sessão OAuth.
- Um JWT não expirado continua restaurando o usuário em cache e não solicita userinfo remoto na inicialização.
- Tokens históricos/de teste sem `exp` continuam compatíveis.
- Mesmo quando a limpeza dos providers derivados falha, o retorno é `reauthentication-required`.
- Quando a recuperação por expiração ocorre em paralelo com um novo callback OAuth, as credenciais do novo login ou do provider recém-trocado não podem ser limpas.
- O JWT expirado no localStorage da Web é limpo e o usuário não é restaurado.
- A UI exibe o aviso uma única vez para `reauthentication-required` e, após a confirmação, entra na página de login.