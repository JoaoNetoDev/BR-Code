# Semântica de disponibilidade do provider Coding Plan

A visibilidade dos modelos do provider Coding Plan no menu é convergida pelo estado do provider em `model-providers.json`:

- `apiKey` indica credencial já existente localmente, e não garante direito a Coding Plan.
- `enabled` indica se o provider pode entrar no Agent registry e no menu de modelos no momento.
- `systemDisabledReason` indica o motivo do desligamento automático pelo sistema; `enabled=false` com esse campo vazio significa desligamento manual pelo usuário.
- A disponibilidade do Z.AI / BigModel Coding Plan verifica apenas se a apiKey do provider consegue acessar com sucesso `/api/biz/subscription/list`.
- A existência de um pacote Coding Plan deixa de ser usada para desligar o provider pelo sistema; estados como sem pacote, pacote que não é Coding Plan ou pacote expirado são tratados pela lista de pacotes da página de detalhes e pela entrada de upgrade.
- O Z.AI Start Plan continua sendo verificado separadamente, checando se o `data.plans` retornado por `/api/v1/zcode-plan/billing/balance?app_version=<ZCODE_VERSION>` contém um Start Plan active.
- Após o login, o BigModel Start Plan usa o ZCode JWT já gravado em disco para consultar `/api/v1/zcode-plan/billing/balance?app_version=<ZCODE_VERSION>`; basta que a autenticação do JWT tenha sucesso para habilitar a entrada. O usuário ainda pode desativá-la manualmente na página de settings.

## Motivos de desligamento pelo sistema

- `coding_plan_not_authenticated`: Z.AI / BigModel Start Plan sem login ou sem credencial de login.
- `coding_plan_not_connected`: BigModel Coding Plan não conectado ou sem credencial de autorização.
- `coding_plan_auth_failed`: credencial existente, mas a autenticação falhou.
- `coding_plan_not_entitled`: credencial do Z.AI Start Plan válida, mas sem Start Plan active; o Z.AI / BigModel Coding Plan não grava mais esse motivo por falta de direito de pacote. O BigModel Start Plan não usa mais o campo de plan active para decidir se habilita.

## Regras de recuperação automática

O sistema só recupera automaticamente providers desligados por ele:

- `enabled=false` com `systemDisabledReason` preenchido: após uma verificação bem-sucedida, pode voltar automaticamente para `enabled=true` e limpar o motivo.
- `enabled=false` com `systemDisabledReason` vazio: considerado desligamento manual pelo usuário; mesmo com verificação bem-sucedida, não pode ser ligado automaticamente.

## Cache de estado das entradas

O estado da entrada à esquerda em Model Providers é gravado em `~/.zcode/v2/coding-plan-cache.json`, que armazena apenas a disponibilidade da entrada, e não os detalhes do cartão de estado.
O TTL do cache é de 24 horas, para evitar que a abertura de Model Providers espere a consulta de direitos do Z.AI Start/Coding e apresente oscilação de loading.

Fontes de dados do cache:

- Z.AI Start Plan: `https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=<ZCODE_VERSION>`, com `Authorization: Bearer <zcodejwttoken>`; a disponibilidade da entrada é determinada por `data.plans` e o saldo é exibido a partir de `data.balances`.
- A requisição de saldo do Start Plan precisa carregar também `X-Device-Mid` (o `deviceMid` de `telemetry-state.json`); o servidor o trata como obrigatório e, quando ausente, retorna `400 {"code":3001,"msg":"parameter error"}`, situação em que o cliente classifica como `unknown` e oculta a entrada Start Plan. O host do desktop, o `zcode-server` remoto e a CLI devem garantir que o `deviceMid` da máquina já exista antes da primeira consulta; ver `docs/zcode-endpoint-device-mid-header.md`.
- BigModel Start Plan: na fase de callback do OAuth do BigModel não se chama mais `tokenByAuthCode`; usa-se diretamente o `code/state/redirect_uri` de callback de uso único, com `provider: "bigmodel"`, para chamar `https://zcode.z.ai/api/v1/oauth/token` e gravar o ZCode JWT em disco; a verificação de habilitação e a consulta de saldo leem apenas `zcodejwttoken`, acessando `https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=<ZCODE_VERSION>` com `Authorization: Bearer <zcodejwttoken>`.
- Z.AI Coding Plan: `https://api.z.ai/api/biz/subscription/list`
- BigModel Coding Plan: o domínio principal da API do BigModel do ambiente atual + `/api/biz/subscription/list`; em produção `https://bigmodel.cn`, e com `ZCODE_ENV=test` também `https://bigmodel.cn`

Momento de refresh automático:

- Após a inicialização do App, um stale refresh em segundo plano; executado apenas quando já existe localmente um provider Coding Plan, sem bloquear a inicialização.
- Depois que `modelProviderService.getAll()` conclui a sincronização inicial, um stale refresh em segundo plano; sem bloquear a primeira tela de Model Providers.

Momentos de refresh forçado:

- Login via OAuth ou novo login bem-sucedido.
- Depois que o App restaura o estado de login local na inicialização.
- Clique em conectar ou atualizar Coding Plan na página de settings.
- Após a conclusão de uma compra ou upgrade.
- No logout, unlink ou limpeza da API key, gravando imediatamente o estado indisponível.

Em caso de falha de interface ou retorno de estado desconhecido, o cache antigo não é sobrescrito. O menu de modelos do campo de entrada não consulta diretamente a interface de direitos, consumindo apenas o `enabled`, o endpoint, o
model e o estado local do provider.

Os detalhes do cartão de estado permanecem como estão e não são gravados nesse cache persistente:

- Saldo do Z.AI / BigModel Start Plan: `https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=<ZCODE_VERSION>`; a mesma resposta carrega `plans` e `balances`, e não se deve primeiro requisitar o `billing/current`, já descontinuado.
- Quota do Z.AI / BigModel: `/api/monitor/usage/quota/limit`

## Exibição das duas entradas Z.AI / BigModel

O Z.AI Coding Plan e o Z.AI Start Plan são exibidos lado a lado em Model Providers:

- `Z.AI - Coding Plan` usa a apiKey do provider para acessar `/api/biz/subscription/list`, e basta sucesso de negócio da interface para permanecer habilitado.
- `Z.AI - Start Plan` usa o ZCode JWT para acessar a interface de saldo de billing do Start Plan, e só pode ser habilitado automaticamente se `data.plans` contiver um Start Plan active.

O BigModel Coding Plan e o BigModel Start Plan usam a mesma semântica de entrada:

- `BigModel - Coding Plan` usa a apiKey do provider para acessar o domínio principal da API do BigModel do ambiente atual + `/api/biz/subscription/list`.
- `BigModel- Coding Plan` usa o ZCode JWT gravado em disco na fase de callback do OAuth do BigModel, acessando a interface de saldo de billing do Start Plan com `Bearer <zcodejwttoken>`, tal como o Z.AI Start/Coding; o estado de habilitação passa a ser determinado pelo sucesso da autenticação do JWT, sem nova troca por access token do BigModel na fase de consulta de saldo.