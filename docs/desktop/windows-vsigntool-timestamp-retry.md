# Retry de timestamp do vsigntool no Windows

## Contexto

Na etapa de empacotamento do Windows, `scripts/sign-windows.ps1` chama VSigntool/SafeNet para assinar os artefatos produzidos pelo electron-builder. A CI assina vários executáveis em sequência, e cada assinatura solicita o serviço de timestamp; quando TSAs como a TrustAsia retornam às vezes o timeout de rede `0x80072ee2`, uma única falha interrompe todo o empacotamento.

## Regras

- `scripts/sign-windows.ps1` mantém a mesma forma de comando registrada no log da GUI: `vsigntool --config <config> --cmd sign -i <file> -m <mode> -r <rule>`.
- Um `VSIGNTOOL_PATH` definido explicitamente tem prioridade sobre a descoberta automática no `PATH`, servindo para fixar qual programa de assinatura a CI realmente chama.
- Cada regra de assinatura tem no máximo 5 retries por padrão, ou seja, no máximo 6 tentativas por regra; pode ser sobrescrito por `VSIGNTOOL_RETRY_COUNT` ou `-RetryCount`, e o valor `0` significa apenas uma tentativa por regra. A CI do Windows usa uma configuração mais conservadora, com 2 retries, ou seja, no máximo 3 tentativas por regra.
- O retry espera 15 segundos por padrão e pode ser sobrescrito por `VSIGNTOOL_RETRY_DELAY_SECONDS` ou `-RetryDelaySeconds`, sendo que `0` significa repetir imediatamente após a falha.
- Cada `vsigntool` tem timeout padrão de 600 segundos, sobrescrevível por `VSIGNTOOL_ATTEMPT_TIMEOUT_SECONDS` ou `-AttemptTimeoutSeconds`, no intervalo válido de 1 a 3600 segundos. A CI do Windows define 120 segundos.
- O retry é a primeira camada de estratégia: depois que a regra atual falha, é preciso esgotar as tentativas padrão da mesma regra, sem trocar de regra imediatamente por causa de um único erro.
- A troca do prestador de timestamp é a segunda camada de estratégia: só se troca para a próxima regra VSigntool quando as tentativas da regra atual acabaram e a saída bruta do último subprocesso ainda casa com características explícitas de timestamp/TSA/`0x80072ee2`; a nova regra recebe novamente a contagem completa de retries. O diagnóstico de attempt-timeout injetado pelo próprio script não participa dessa decisão, evitando que um PIN, SafeNet ou ferramenta local travada seja confundido com falha de TSA.
- Erros de SafeNet/cartão inteligente (por exemplo `0x8010006a`) não recebem classificação especial e seguem o retry padrão da regra atual; quando as tentativas acabarem, a falha é direta, sem trocar a regra de timestamp por causa de um erro de SafeNet.
- A regra de fallback padrão é `zcodedigicert`, e exige que a VSigntool GUI da máquina da CI já tenha uma regra com esse nome, usando o timestamp da DigiCert.
- A lista de nomes de regra pode ser sobrescrita por `VSIGNTOOL_TIMESTAMP_FALLBACK_RULES` ou `-TimestampFallbackRules`, por exemplo `zcodedigicert,zcodeglobalsign`.
- A lista de regras é deduplicada sem diferenciar maiúsculas de minúsculas. Na inicialização o script valida a existência da regra principal; o fallback verifica o `config.xml` apenas quando está prestes a trocar e, se estiver ausente, gera um erro explícito e para, sem consumir mais uma rodada de retries para uma regra inexistente.
- O comando sign do VSigntool atualmente expõe apenas `-i/-m/-r` e não tem parâmetro de TSA separado; o script muda o prestador de timestamp trocando `-r <rule>` e não modifica o `config.xml`.
- O script lê `stdout` e `stderr` de forma concorrente, evitando que a saída de erro encha o pipe e trave a CI.
- Após o timeout de uma assinatura, o script verifica o código de saída de `taskkill /T /F` e confirma em pouco tempo que o processo alvo realmente saiu; só é possível reportar que a árvore de processos foi encerrada e permitir o próximo retry quando esse caminho tem sucesso. Se o `taskkill` falhar, `Process.Kill()` serve apenas como meio de contenção do processo pai, e é obrigatório reportar a falha de encerramento da árvore de processos e "filho não verificado", encerrando imediatamente todo o script de assinatura, proibindo retry dentro da regra ou fallback que inicie um novo signer. Tanto a espera de encerramento quanto a coleta de saída precisam ter limite.