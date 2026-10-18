# Desktop E2E Process Lifecycle

## Run Identity

O E2E WDIO do desktop usa uma única identidade de execução tanto para isolamento de arquivos quanto para limpeza de processos:

- `ZCODE_E2E_RUN_ID`
- `ZCODE_E2E_HOME_DIR`
- Argumento do app Electron `--zcode-e2e-run-id=<runId>`

`ZCODE_E2E_HOME_DIR` isola os dados persistidos do app. `ZCODE_E2E_RUN_ID` também é passado na linha de comando do Electron para que as varreduras de processo possam identificar o processo raiz da execução WDIO atual sem depender de caminhos de build compartilhados.

## Limite de limpeza

A limpeza de processos só pode selecionar um processo raiz quando a linha de comando dele contém o arg de run id atual ou o diretório E2E home normalizado atual. Depois que uma raiz é selecionada, a limpeza inclui recursivamente os filhos dela, de modo que os subprocessos de host e agent sejam reaproveitados mesmo quando as próprias linhas de comando deles não incluem o marcador de run.

No macOS, o main do Electron e o ChromeDriver podem não preservar `appArgs`, mas a linha de comando do renderer, do utility,
do host ou do crash handler ainda carrega o caminho HOME/profile do run atual. O limpador permite, a partir desses
descendentes com acerto exato, completar para cima a cadeia contígua de main do Electron e ChromeDriver, e então
reaproveitar toda a árvore para baixo a partir do nó raiz obtido; ao encontrar o controller do WDIO, um shell, um
terminal ou outro processo pai que não seja Electron/ChromeDriver, é preciso parar. O rastreamento reverso precisa ser
disparado por um acerto exato do runId/HOME atuais; não é permitido escolher a raiz de limpeza apenas por
`ZCode E2E`, caminhos de build compartilhados ou nome de processo.

A barreira de saída de processos, a inicialização de fixture/mock e o reset de HOME do `beforeSession` formam uma
transação pré-requisito fail-closed. O hook de config do WDIO engole rejections comuns, portanto, quando a transação
falha, o erro original precisa ser guardado e lançado pelo root hook nativo do Mocha antes de qualquer corpo de case
de produto; um worker que falhou só pode produzir uma falha de infraestrutura no root hook, e não pode seguir executando
asserções de produto com replay/capture ausente, diretório de log ausente ou HOME antigo.

Marcadores compartilhados não são de propósito identidades de limpeza:

- `ZCode E2E`
- `APP_ENTRY_POINT`
- `out/main`

Esses valores provam apenas que um processo pertence a este repositório ou build de teste do produto. Eles não provam que ele pertence à execução WDIO atual. Usá-los como condição de kill permite que um shard ou execução local termine outro shard com um `ZCODE_E2E_HOME_DIR` diferente, causando desconexões do DevTools, falhas de `DevToolsActivePort`, telas brancas ou saídas aleatórias da suíte.

## Observações por plataforma

O mesmo limite se aplica em macOS, Linux e Windows. No Windows, a nova tentativa de limpeza após falhas na remoção do HOME também usa o helper de limpeza compartilhado, porque handles de arquivo obsoletos são comuns ali e o fallback precisa continuar seguro em execuções paralelas.

## Continuous Windows Runner

`scripts/ci/run-e2e-bitable-loop.ps1` fornece um ponto de entrada em PowerShell 7 para um host E2E dedicado no Windows. A cada iteração:

1. entra no checkout z-code configurado;
2. busca `staging` no repositório HTTPS configurado e atualiza a branch local com um merge fast-forward;
3. limpa os filtros de spec herdados e roda uma vez a suíte E2E do desktop, sem entrar no shard runner, por meio de `pnpm --filter @zcode/desktop test:e2e:serial`;
4. invoca `scripts/ci/push-e2e-metrics-to-bitable.mjs` e depois `scripts/ci/push-e2e-report-to-feedback.mjs` para aquele diretório de artifact, inclusive quando o comando E2E falha. A coleta de artifacts de falha é habilitada para que o upload do report possa anexar vídeos de cases que falharam.

O loop contínuo é dono de exatamente um diretório de saída específico da execução:
`packages/desktop/.e2e-artifacts/continuous-<UTC timestamp>-<PID>/`. O child WDIO serial
escreve `summary.json` diretamente nesse diretório, de modo que o upload de métricas
não precisa descobrir nem combinar summaries por shard. O estado de aplicação dele usa o
diretório fixo e ignorado `packages/desktop/.e2e-home/`; o loop não pode criar irmãos
`packages/desktop/.e2e-home-<run>-shard-*` específicos de execução. O
ponto de entrada serial se aplica apenas a este loop contínuo. Outros pontos de entrada E2E
podem manter sua própria política de sharding.

O loop nunca reseta nem descarta mudanças do repositório. Um checkout sujo, uma busca falha ou uma branch sem fast-forward pula aquela iteração e tenta de novo após o atraso configurado. Diretórios E2E HOME gerados são ignorados pelo Git, para que o estado de teste de uma execução interrompida anterior não seja confundido com uma mudança de código-fonte. As credenciais do Bitable e `ZCODE_FEEDBACK_NOTIFICATION_TOKEN` permanecem como variáveis de ambiente consumidas pelos scripts de upload. `-Once` executa uma iteração para manutenção ou validação.

Antes de cada busca, o loop remove apenas o estado transitório pertencente ao runner da
iteração anterior: o diretório fixo `packages/desktop/.e2e-home/`, os diretórios legados
`packages/desktop/.e2e-home-*` e o diretório legado
`packages/desktop/.e2e-network-capture/`. Todo alvo de remoção precisa
resolver dentro do checkout e continuar ignorado pelo Git. O loop mantém
`.e2e-artifacts/` para que um upload de report que falhou possa ser diagnosticado ou
tentado de novo, e mantém `.e2e-cache/` e os caches de build normais. Depois da limpeza,
qualquer mudança rastreada ou não ignorada restante é impressa com seu status porcelain e
bloqueia a busca; o runner nunca reseta, faz checkout nem apaga mudanças de código-fonte.

As requisições HTTP do Bitable têm seu próprio timeout de 30 segundos. O loop limita o processo completo do uploader do Bitable a 120 segundos por padrão (`-UploadTimeoutSeconds`) e o processo do uploader de report/vídeo a 1800 segundos (`-FeedbackUploadTimeoutSeconds`). Qualquer um dos timeouts encerra a árvore de processos do uploader, registra um resultado não zero e segue para a próxima iteração após o atraso configurado. Os dois uploaders são tentados mesmo quando um deles falha; uma falha de E2E continua sendo o código de saída principal da iteração.

```powershell
pwsh -File .\scripts\ci\run-e2e-bitable-loop.ps1
pwsh -File .\scripts\ci\run-e2e-bitable-loop.ps1 -Once
```

O runner valida `LARK_E2E_APP_ID`, `LARK_E2E_APP_SECRET`, `LARK_E2E_BITABLE_TOKEN`, `LARK_E2E_TABLE_ID` e `ZCODE_FEEDBACK_NOTIFICATION_TOKEN` antes de iniciar a primeira execução E2E. `ZCODE_FEEDBACK_BASE_URL` continua opcional e usa o padrão do uploader de report quando omitido.