# Política de atualização de Usage Remaining

Data: 2026-06-13 (atualizado em 2026-08-14 para atualização por acesso sob demanda)

## Contexto

O badge de plano no footer, a cota restante do Coding Plan no painel de contexto da caixa de entrada e o saldo do Start Plan vêm todos de `useUsageEntitlement`. Esses dados influenciam o julgamento do usuário sobre ainda poder iniciar tarefas, portanto é preciso uma política de atualização unificada, evitando momentos de atualização inconsistentes entre as entradas e evitando que várias montadas simultaneamente ampliem as requisições de quota / billing.

## Política

- O uso restante passa a ser unificado como "cache primeiro + correção quando o usuário acessa": o Contexto da conversa dispara no hover/open, o cartão de plano do modelo provedor e a tab Coding Plan da página de Usage disparam na abertura. O badge de plano da barra lateral é uma entrada permanente e dispara a mesma sondagem de access quando fica visível/montado, sem depender de o usuário ter acessado antes outra entrada para aquecer.
- As três entradas exibem imediatamente no primeiro frame o mesmo snapshot em cache do escopo de conta/plano; a correção em segundo plano não bloqueia a exibição do painel; sem cache, apenas então no máximo a.loading é exibido.
- A atualização automática por acesso compartilha uma freshness window de 1 minuto por `usageStatsService + providerId + organizationId + projectId + provider credential fingerprint`. Se qualquer entrada acabou de requesting, hovers repetidos ou a abertura de outras entradas dentro de 1 minuto não disparam novas requisições.
- A atualização de uso precisa seguir o estado de agendamento de entitlement:
  - `unknown` / `active` / `none` / `unavailable` permitem que o acesso do usuário dispare a correção, mas ficam sujeitos à freshness window compartilhada de 1 minuto.
  - O refresh manual do usuário, a mudança de login/token/assinatura de provider e a compra bem-sucedida podem forçar a bypass da freshness window, para reprobar `none` ou `unavailable`.
- Quando a mesma conta de marca tem as duas entradas Coding Plan e Start Plan, o agendamento de entitlement precisa ser mutuamente exclusivo:
  - Assim que o provider do Coding Plan estiver configurado, consulta-se primeiro o Coding Plan.
  - Quando o Coding Plan já tiver quota / subscription / remaining, trata-se apenas do Coding Plan, sem consultar nem exibir o saldo do Start Plan da mesma marca.
  - Só quando o provider do Coding Plan não estiver configurado, ou quando o servidor retornar explicitamente `no_plan`, o Start Plan da mesma marca é permitido como entrada de fallback.
  - Query em andamento do Coding Plan, erro de rede, token expirado ou estado `unavailable` não podem fazer degradação para o Start Plan, evitando interpretar "temporariamente não encontrado" como "não há Coding Plan".
- Não se atualiza mais o uso restante por início, conclusão, falha ou parada de tarefa, e não se executam mais polling de 5 minutos/30 minutos de inatividade nem o timer `nextResetTime`.
- O Contexto chama `reason=access` e `silent=true` cada vez que passa de fechado para aberto; hovers repetidos não podem resetar nem estender a exibição do painel, e só a freshness window compartilhada decide se a requisição é feita.
- O cartão de plano do modelo provedor, a tab Coding Plan da página de Usage e o footer da barra lateral chamam o mesmo `reason=access` e `silent=true` ao abrir/ficar visível; os dados de tendência de Usage também usam uma freshness window de acesso de 1 minuto no mesmo escopo.
- O refresh manual do usuário, o login bem-sucedido, a mudança de assinatura de token/provider e a compra bem-sucedida podem reprobar o estado `none`; essas ações explícitas atendem ao cenário em que o usuário acabou de comprar ou o estado de login acabou de ser restaurado.
- Backoff após falha de requisição: 30 segundos, 60 segundos, 120 segundos, 300 segundos; zerado após sucesso.
- A mesma instância de serviço, os mesmos parâmetros de requisição de provider e a mesma assinatura de provider compartilham um único snapshot mais recente; depois que uma entrada atualiza com sucesso, as outras entradas já montadas exibem de forma sincronizada.
- Requisições idênticas simultâneas continuam reutilizando a Promise in-flight, evitando requisições concorrentes duplicadas.

## Limites

- A quota do painel Coding Plan Usage é o dado central: quando a rede da quota falha, o painel inteiro reporta erro; activity / usage-detail / model-performance-day são painéis de dados opcionais e uma falha isolada de rede/HTTP apenas limpa a área correspondente e registra um warn na camada de serviço, sem derrubar o painel inteiro. HTTP 200 com envelope de negócio falho (como token expired) ainda gera erro em tudo, evitando disfarçar erro de autenticação como uso vazio.
- `nextResetTime` representa o momento de reset da cota, não o momento de geração dos dados.
- `UsageEntitlementSnapshot.generatedAt` representa o momento local de geração do snapshot.
- Um `no_plan` em cache pode ser usado para interromper atualizações automáticas, por polling e do ciclo de vida de tarefas, mas não pode bloquear para sempre o refresh manual nem a reprobagem após login/mudança de assinatura de token/provider ou compra bem-sucedida.
- A atualização automática ao abrir o gráfico de Coding da página de Usage é limitada pela freshness window de acesso de 1 minuto; o clique do usuário no refresh ainda força a obtenção.
- Desktop e Web disparam a injeção de dependência da camada de serviço pelo hook de UI, sem acessar diretamente arquivos locais ou credenciais.
- Desktop `desktop-continuous` e celular `web-remote-replayable` são disparados apenas pelo acesso do usuário em seus respectivos renderers. O estado da cota permanece nos serviços de UI / shared host, não desce para o relay nem para o desktop main e não altera a fronteira de recuperação de stream de cada lado.
