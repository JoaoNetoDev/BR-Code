# Login do Desktop OAuth por polling

## Objetivo

O login do Desktop do Z.AI e do BigModel deixa de usar `zcode://oauth/callback` como único caminho de conclusão. O App usa o fluxo OAuth de curta duração já existente no backend do ZCode e, após a autorização ser concluída no navegador, faz polling do estado do flow; o deep link permanece como caminho de compatibilidade.
O campo `provider` da interface de polling usa `zai` ou `bigmodel`; os dois compartilham o ciclo de vida do flow, mas o campo de credenciais `ready` é distinguido por provider.
Após o BigModel criar o flow, o App muda o callback no endereço de autorização para a antiga página de relay do site oficial
`https://zcode.z.ai/app/oauth/login` (em ambiente de teste, o site de teste correspondente); a página de relay continua repassando `authCode/state`
para `zcode://oauth/callback`; o polling flow no Host é mantido em paralelo.

## Sequência

```text
Desktop App                 ZCode Backend                 Browser / Z.AI
    | POST /oauth/cli/init        |                              |
    |---------------------------->|                              |
    | flow_id + authorize_url     |                              |
    |<----------------------------|                              |
    | open authorize_url --------------------------------------->|
    |                             |<---------- OAuth callback ---|
    | GET /oauth/cli/poll/:id     |                              |
    |---------------------------->|                              |
    | pending / ready / failed    |                              |
    |<----------------------------|                              |
    | persist once + refresh UI   |                              |
```

Caminho duplo do BigModel:

```text
BigModel Browser
    | authCode/state
    v
ZCode Website /app/oauth/login -----> zcode://oauth/callback -----> Desktop deep link
                                                                    |
Desktop Host ---------------- GET /oauth/cli/poll/:id --------------+
```

O Desktop carrega o `app_version` de compilação ao construir o endereço de relay do site oficial. O Website só ativa o polling bridge sem deep link automático para versões válidas estritamente maiores que `3.9.1`; `3.9.1`, versões menores, versão ausente ou inválida
continuam usando o deep link automático original, evitando que o App antigo fique preso no estado intermediário do login por não possuir a capacidade de conclusão por polling.

Ao iniciar logins rapidamente em sequência, a requisição posterior é a dona do flow; uma resposta de init enviada antes, mas retornada depois, é considerada stale e não pode sobrescrever o novo flow:

```text
App                  init A                  init B                  Host pending
 | start A ------------>|                                              |
 | start B ---------------------------------->|                         |
 |                         |<---- A returns    |                         |
 |                         |      stale, drop  |                         |
 |                         |                   |<---- B returns          |
 |                         |                   |------------------------>| flow B
```

## Contrato e fronteiras

- O App gera um `poll_token` aleatório de 32 bytes por login, enviado somente via `Authorization: Bearer`,
  nunca gravado em log, configurações ou URL.
- O `flow_id`, `expires_at` e `poll_interval_sec` retornados por `init` ficam apenas na memória do Host.
- O App só aceita `authorize_url` HTTPS, um `expires_at` futuro e um `poll_interval_sec` de pelo menos 1 segundo
  e menor que o tempo de vida restante do flow; respostas anormais do servidor encerram imediatamente, sem abrir endereço externo.
- A camada Root residente consulta o pending flow no Host; sem pending flow, nenhuma requisição de rede pode ser gerada.
- Apenas `zai` e `bigmodel` usam polling; providers de extensão continuam pelo fluxo de deep link original, sem iniciar polling vazio no Root.
- O callback de navegador do BigModel usa `https://zcode.z.ai/app/oauth/login?redirect=zcode://oauth/callback` do site oficial e não pode exibir diretamente as páginas de sucesso ou falha de `/oauth/cli/callback/bigmodel`; alterar o endereço de callback não cancela o polling no Host.
- `pending` continua consultando conforme o intervalo do servidor; `ready` grava em disco atomicamente uma única vez e encerra; `failed`, expiração, cancelamento ou erro de negócio encerram o flow atual.
- Status de polling desconhecido, tipo de campo errado ou token ausente para o provider correspondente falham como erro de protocolo, sem lançar exceção de tipo JS.
- O `OAuthService` é o único owner da conclusão do login. Resultados de deep link e de polling são processados serialmente na ordem de chegada ao service, e validação, troca/normalização de token e gravação em disco acontecem dentro da mesma fronteira de conclusão. Quando o caminho que chegou primeiro tem sucesso, o caminho que chega depois não valida nem troca token; quando o primeiro caminho falha, o outro caminho que já tiver chegado continua sendo processado de forma independente, sem reutilizar a Promise que falhou.
- Quando há outro caminho de conclusão aguardando, uma falha precisa esperar o resultado dele; se o outro caminho tiver sucesso, a falha anterior é ignorada. Uma falha isolada do deep link não cancela um polling válido; um erro terminal do polling só encerra o flow quando não há candidato disponível ou quando todos os candidatos falharam.
- `channel_id`, `utm_source` e `utm_campaign` do callback são tratados separadamente do resultado do login: o callback do flow atual ainda salva esses parâmetros; depois que o polling tem sucesso, um callback atrasado com o mesmo state ainda salva a atribuição dentro da janela original de deduplicação de 30 segundos, mas não resolve mais o authorization code nem solicita token. Callbacks com state errado, cancelados ou já substituídos por um novo flow não podem ser gravados. As regras de passagem de parâmetros existentes do authorize URL, `app_version`, redirect e state permanecem inalteradas.
- Somente resultados que ainda pertencem ao pending flow atual podem ser gravados em disco; após cancelamento ou troca de login, resultados HTTP antigos (inclusive 4xx) não podem limpar o novo flow nem sobrescrever um login já concluído.
- Antes de iniciar um novo login, o pending flow local antigo é cancelado; o cancelamento do usuário também descarta respostas de init que ainda não voltaram. O backend atual não tem interface de cancelamento, então o cancelamento apenas interrompe as consultas do App e o flow do backend expira por TTL.
- Web `/remote`, attachment de shared-host, sessão/task em tempo real e a cadeia de recuperação replayable permanecem inalteradas.

## Cenários de aceitação

- Quando o deep link de Z.AI ou BigModel não retorna, o `ready` do polling ainda consegue concluir o login e a atualização existente do Coding Plan.
- Quando o deep link conclui primeiro, o polling é interrompido; quando o polling conclui primeiro, o deep link atrasado é ignorado.
- Após cancelamento do usuário, início de novo login, `failed` do flow ou expiração do flow, nada mais é gravado em disco.
- Ao iniciar dois flows rapidamente em sequência, o flow iniciado mais tarde permanece válido, e init/poll atrasados não podem sobrescrevê-lo.
- O BigModel usa a antiga página de relay do site oficial para compatibilidade com deep link, mantendo ao mesmo tempo o polling flow.

### Regressão de corrida do caminho duplo

```text
resposta de callback / poll → fila de conclusão do Host → validação e troca → salva uma única vez
                          ├─ sucesso → candidatos seguintes são pulados (a atribuição é preservada)
                          └─ falha → o próximo candidato valida e troca de forma independente
```

- Ambos os órdenes de chegada são cobertos: primeiro sucesso, primeiro falha seguido de sucesso da outra via, e ambas falhando.
- O candidato que chega depois não pode começar a resolver o authorization code nem normalizar o token antes de o candidato que chegou primeiro ser concluído.
- Os parâmetros de atribuição que chegam durante a espera do callback e depois do sucesso do polling devem ser preservados; parâmetros de flow antigo não podem sobrescrever o flow novo.
- A camada de service usa Promises controladas para validar a ordem microscópica; o E2E de desktop valida, via HTTP real do Host e callback via preload, que após o fallback de falha a UI tem sucesso e não exibe indicação de falha de login. O controle remoto do celular não ganhou nova entrada de OAuth nem alterou as cadeias continuous/replayable.

### Cancelamento do callback e atribuição de erro

- Quando um callback já recebido se torna inválido por cancelamento ou por um novo flow, o retorno é `null`; o Root ignora silenciosamente, sem atualizar usuário, estado de sucesso ou mensagem de erro.
- Quando ambas as vias falham, cada chamador recebe o erro original da sua própria via; esperar pela via alternativa não pode sobrescrever a informação de diagnóstico da primeira via.
- A janela de deduplicação de 30 segundos após o sucesso é julgada pelo momento em que o callback entra no service. Callbacks já recebidos durante o período pending ou recebidos dentro da janela não perdem a atribuição só por terem ficado na fila além da janela; callbacks recebidos após o fim da janela continuam sendo rejeitados. O isolamento por cancelamento e por novo flow tem prioridade sobre esta regra.

```text
callback recebido dentro da janela → entra na fila → espera mais de 30 segundos → ainda salva a atribuição
novo callback recebido após o fim da janela                  → rejeitado
cancelamento / novo flow → o callback antigo retorna null → o Root ignora
```