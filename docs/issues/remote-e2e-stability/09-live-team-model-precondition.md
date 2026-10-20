# Pré-requisito local não pronto para a validação do modelo Team real

Status: needs-info

## Registro atual

- Baseline de negócio `a13999a28927f629d0c64080a5096cf8b4f23bae`, build de produção.
- case `conversation-session-r3-live-bigmodel-team.test.ts`, lote
  `r3-server-20261009234650716-227ddc`, tarefa `live-team`.
- O material de login real e a seleção de conexão Team foram importados para um HOME isolado; o contrato OAuth atual não copia a API Key da conta antiga.
- Antes de conectar via SSH, o menu de modelos local foi verificado e não apareceu o
  `account:bigmodel-team-coding-plan / GLM-5.3-Flash` escolhido pelo case.
  O case retorna explicitamente `BLOCKED_ACCOUNT 本机真实账号的 Team 模型未就绪`
  («o modelo Team da conta real local não está pronto»).
- O `live-team.json` registra essa falha do grupo de controle com
  `localAccountModelUnavailable=true`. Esta rodada não concluiu uma requisição real ao
  modelo Team, portanto não é possível atribuí-la a uma regressão de SSH nem substituí-la
  por uma reprodução.

## Pré-requisito pendente

É preciso verificar se a disponibilidade de modelos da conta/projeto real e a aplicabilidade do modelo especificado continuam válidas, e então rodar o mesmo case de requisição real. Nesta rodada a API Key real que representa `live-zapi` foi aprovada; a sincronização de modelos Personal, o valor padrão e a reposição offline têm outras evidências de aprovação.
