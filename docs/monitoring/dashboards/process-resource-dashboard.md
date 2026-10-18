# Monitoramento de recursos de todos os processos do ZCode

## Escopo de produto confirmado

2026-09-15, confirmado por discussão: criar um dashboard independente no Alibaba Cloud CMS, priorizando respostas a perguntas de regressão de versão e de saúde de recursos, ao mesmo tempo atendendo à investigação de um único dispositivo e à aceitação da coleta. Nesta etapa não são criados alertas, assinaturas nem permissões de compartilhamento.

- Workspace: `arms-id-placeholder`.
- Fonte de dados: `arms-project-placeholder` de Pequim / `logstore-rum`.
- Restrição da aplicação: `service_id = arms-id-placeholder`.
- Consome apenas `perf_process_window`, `perf_system_window`, `perf_tool_exec_resource`. O dashboard antigo continua existindo de forma independente, sem concatenar eventos de recursos antigos.
- Padrão `prod`, últimas 24 horas. Oferece filtros de ambiente, versão e sistema operacional; o filtro de hardware serve para controlar as diferenças de máquina na comparação de versões.
- Gráficos em duas colunas, sete seções colapsáveis, com a home-page destacando visão geral e comparação de versões.

## Seções

| Seção                  | Conteúdo exibido                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Visão geral de recursos | Quantidade de identificadores de dispositivos reportados, frescura dos eventos, distribuição e tendência de CPU/RSS da aplicação e pressão da máquina inteira |
| Versão e papel do processo | CPU, RSS, pico de processo único, CPU de background, JS heap, quantidade de processos e buckets de uptime por versão/papel |
| Ranking de recursos MCP | Ranking de memória e CPU de background dos MCP locais por `mcp_id` |
| Bash lento | Duração, recursos, tipo de saída e situação de amostragem de comandos executados localmente com pelo menos 15 segundos |
| Recursos remotos | Métricas por papel de CLI/MCP remoto e Bash lento remoto, independentes do total da aplicação local |
| Investigação de um dispositivo | Seleção de dispositivo por `device_mid`, exibindo linha do tempo do aplicativo local, dos papéis e do contexto da máquina inteira |
| Qualidade da coleta | As três classes de eventos e cobertura por papel, quantidade de amostras, cobertura de heap e o próprio custo da telemetria |

## Contrato estatístico

1. Comparar versões que têm eventos novos sob o mesmo intervalo de tempo e os mesmos filtros. Nesta etapa não se faz pareamento de antes/depois da atualização no mesmo dispositivo, não se indica automaticamente uma versão estável e não se calcula variação entre eventos antigos e novos.
2. Para as métricas de regime permanente de CPU/RSS, primeiro agrega-se a média da janela por dispositivo e versão, e só então se calculam P50/P95 entre dispositivos. Os gráficos de tendência aplicam a mesma regra dentro de cada bucket de tempo. Não é permitido rotular o percentil do p95 da janela como p95 das amostras brutas de CPU.
3. Para os picos, toma-se primeiro o máximo por dispositivo dentro do intervalo e só então se calcula a distribuição populacional; a base de cálculo do RSS total por papel, do RSS máximo de processo único e do heap deve ser anotada separadamente. O heap de múltiplas instâncias é a maior leitura de processo único, não o total de heap do papel.
4. Cada grupo exibe a quantidade de identificadores de dispositivos; abaixo de 100 mostra "amostra insuficiente", e `local` serve sempre apenas para aceitação. Os valores podem ser consultados, mas não servem como avaliação de saúde de regressão, e não se usa vermelho/verde para indicar qualidade de versão.
5. Sem eventos, exibe "sem dados"; uma quantidade de eventos confirmável pode ser 0, enquanto métricas sem amostra (CPU, RSS, proporções) são null/vazias — não se preenche com zero e não se interpola para completar lacunas.
6. Eventos de máquina inteira descrevem apenas máquinas desktop e o processo do aplicativo local. O `device_mid` dos dados remotos é o identificador do desktop que reportou, e não o ID da máquina física remota; como não há ID do ambiente remoto reportado, não é possível distinguir no dashboard várias máquinas remotas de mesma especificação conectadas ao mesmo desktop. É proibido somar essas amostras como total remoto.
7. Bash lento no Windows não tem recursos de árvore de processos; comandos com `sample_count=0` também não participam da estatística de consumo da árvore de processos. Bash lento cobre apenas comandos >=15 segundos, portanto não é possível calcular a taxa de comandos lentos sobre todos os comandos. O tempo de CPU / a duração corresponde ao equivalente em núcleos de CPU já observados, pode ser maior que 1 e não prova, por si só, que houve espera por rede ou por entrada.
8. Eventos de Bash não têm campos de arch, número de núcleos de CPU nem memória total; o filtro de hardware só tem efeito nas seções de processo/sistema que possuem esses campos. Bash não é associado a uma memória total remota estimada e a porcentagem de memória restante da máquina inteira não é calculada.
9. Os grupos de dispositivos por bucket de uptime podem ser diferentes; a tendência oferece apenas pistas de investigação e não diagnostica vazamento diretamente. Papéis/janelas sem heap mantêm o valor vazio.
10. Um `sample_count` baixo pode vir da janela residual de uma saída normal, e um papel ausente pode vir de nunca ter sido iniciado; nenhum dos dois é diretamente classificado como falha de coleta. O tempo gasto pela própria telemetria é a soma acumulada de milissegundos de wall clock da agregação das amostras de main dentro da janela, e não equivale ao custo de CPU de toda a telemetria.

## Configuração e aceitação

Podem ser colocados neste diretório o [JSON nativo](./process-resource-dashboard.json) e a [lista de consultas SQL](./process-resource-queries.json) para importação.

### Entregue (2026-09-15)

- [Dashboard em produção](https://cmsnext.console.aliyun.com/next/region/cn-beijing/workspace/arms-id-placeholder/app/dashboard/detail/dashboard-1789470797128-483124): `dashboard-1789470797128-483124`.
- 32 gráficos/cartões de dados, 7 seções colapsáveis, 8 controles de filtro globais; a lista de consultas contém 32 consultas de painel e 1 consulta de lista de versões.
- O tempo padrão é fixado nas últimas 24 horas por `attribute.time`; o ambiente usa a variável de seleção única `env`, com padrão prod no SQL, evitando misturar desenvolvimento e produção em um cálculo. As versões mantêm o filtro nativo de múltipla seleção.
- Os gráficos de tendência usam a transformação nativa `classify`, quebrando `time / series / value` em curvas separadas. Não se pode apenas fazer GROUP BY de series no SQL e usar o gráfico de linhas padrão, senão os diferentes papéis seriam conectados em uma única linha.
- Os filtros globais mantêm uniformemente `xPos=0` e são ordenados via `fixedTopOrder`, evitando serem posicionadas na primeira linha colapsada pelo layout nativo. O campo de dispositivo tem uma etiqueta removível no topo; depois de remover a etiqueta, a seção de dispositivo único volta ao estado vazio sem seleção.
- As variáveis são substituídas pelo valor original, e strings precisam ser explicitamente referenciadas no SQL; a dimensão padrão "todos" usa o ramo `all`. Não se deve supor que variáveis com prefixo adicionam aspas de SQL automaticamente.
- As consultas de agregação dos cartões de CPU/RSS sem amostras usam HAVING para excluir resultados sem valores válidos, evitando exibir `null%`. A contagem de eventos continua exibindo o 0 real. A tendência de CPU da máquina inteira inclui uma linha de referência de 90%; a tabela de nível de memória inclui os limiares de referência de 40% de ocupação da aplicação e 5% de ociosidade da máquina inteira, sem alerta automático.
- O `from_unixtime` do contexto atual do SLS já devolve o horário de Pequim; não se pode mais somar manualmente 28800 segundos.

### Resultados da verificação

- As 33 consultas básicas passaram todas na execução real do SLS; cobrem local, prod, plataforma/hardware, foreground/background, dispositivo especificado e não especificado. Depois de corrigidas as referências de variáveis, o SQL das chaves de valor padrão e dos caminhos de filtro foi executado novamente e verificado em um navegador real.
- Reabrindo prod / 1 dia no navegador: quantidade de eventos e de dispositivos é 0, e CPU/RSS e tendências mostram "sem dados". Ao alternar para local / macOS, a consulta funciona normalmente.
- Observação em local: 231 eventos de processo, 24 eventos de sistema, 2 eventos de Bash lento; versão 3.12.1. A tabela de controle do sistema mostra 13 identificadores de dispositivo e "local: apenas para aceitação"; todos os eventos novos cobrem 23 identificadores, o que não pode ser interpretado como 23 máquinas físicas.
- A página conferiu comparação de versões, linhas por papel, um caso de Bash lento concluído normalmente e um encerrado, cobertura de coleta e horário de Pequim. O campo de dispositivo único consegue produzir a linha do tempo por papel; após remover a etiqueta do topo, o campo fica vazio; com todas as seções colapsadas, os 8 filtros globais são preservados.
- MCP / remote não têm amostras novas reais, e o SQL retorna com sucesso um conjunto vazio; ainda não é possível verificar a distribuição real de dados deles, o comportamento dos campos de recursos no Windows ou o efeito da comparação de duas versões. Ainda não há eventos novos em produção, e nenhuma conclusão de recursos de produção é extraída.
- `pnpm typecheck` e `pnpm lint` passaram, com lint em 0 error / 43 warnings já existentes. Desta vez foram adicionados apenas o JSON do dashboard, a lista de consultas e a explicação; nenhuma implementação do aplicativo ou do Agent foi alterada.

### Atualizações futuras e rollback

A revisão de SQL gráfico a gráfico de 2026-09-15 está em [Revisão de SQL do dashboard](./process-resource-dashboard-review.md). Ali estão registrados os defeitos de base de cálculo confirmados e as sugestões de aprimoramento de exibição, sem que a configuração entregue tenha sido modificada.

Para atualizar o mesmo ID no dashboard já existente em produção, use «Editar → Configurações → JSON do dashboard»; antes de atualizar, preserve a versão atual e é proibido recriar um dashboard duplicado com o mesmo nome. A aba «Versões» da plataforma nativa permite restaurar configurações anteriores. Depois de alterar o SQL, execute primeiro as consultas somente leitura do SLS, depois confira ambiente, estado vazio, substituição real de variáveis e a legenda e, por fim, sincronize os arquivos deste diretório. Depois que os primeiros dados de prod e a segunda versão nova chegarem, complete a aceitação com grupos reais, MCP, remote e entre versões; alertas serão discutidos à parte.

Referências ao formato nativo: [Instruções de importação e exportação de dashboards JSON do Alibaba Cloud](https://help.aliyun.com/zh/sls/import-and-export-sls-dashboards). As definições dos campos estatísticos vêm do [spec de recursos de todos os processos](../process-resource-telemetry.md).