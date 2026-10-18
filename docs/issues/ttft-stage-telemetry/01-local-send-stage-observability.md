# 01 — Métricas de fase de TTFT e waterfall do envio comum

**O que construir:** Em workspace local de desktop, com app continuamente em primeiro plano, envio ocioso e sem retry, o analista de performance consegue ver a duração completa das fases principais do clique de envio até a primeira saída válida, com P50/P95 e um waterfall por mensagem. Corpo de texto, pensamento e chamada de ferramenta chegando primeiro são todos encerrados corretamente, e o tempo até o primeiro corpo é registrado separadamente. Este ticket percorre o envio real, a correlação entre processos, a coleta de fases, a exportação final em OTLP, a consulta e o E2E; ao concluído, pode ser demonstrado e aceito de forma independente.

**Bloqueado por:** Nada — pode começar imediatamente.

**Status:** in-progress

**Pai:** [Telemetria de TTFT por fase da mensagem local de desktop](../../monitoring/ttft-stage-telemetry.md)

## Critérios de aceitação

- [x] Definir as amostras suportadas por este ticket: desktop local, continuamente em primeiro plano, envio ocioso, sem retry. Caminhos ainda não suportados, como fila, guidance imediato e cancelamento por falha, têm classificação explícita e limpeza limitada, sem tratar saída já existente ou dados incompletos como amostra comum de sucesso; o diagnóstico completo desses é complementado pelo ticket 02.
- [x] O clique real de envio ou submissão por Enter, após passar pelo gate, estabelece uma correlação de observação estável que percorre o Renderer, o Local Host da janela, a CLI e o retorno do conteúdo real da sessão. O protocolo compartilhado usa tipagem estrita e validação em runtime, mantendo compatibilidade com chamadas antigas; o Host não ganha uma segunda fila de negócio, e o Main não hospeda o estado de negócio de tasks.
- [x] A correlação de observação de um mesmo envio consegue localizar command/input/query, turn e requisição do modelo; saída anterior ao ACK ainda é atribuída corretamente, e reordenação legítima e duplicatas não causam TTFT principal duplicado nem Metric duplicado. Sessões, workspaces e instâncias de processo independentes não se cruzam.
- [x] Registrar completamente as seis fases principais: preparação de envio no Renderer, entrega do comando e recebimento pela CLI, espera de execução, execução e preparação da requisição, requisição ao modelo e retorno da primeira saída. A espera desde o recebimento do comando pela CLI até a obtenção do admission gate não pode faltar; o ida-e-volta do ACK e a execução podem ocorrer em paralelo, sem acumulação duplicada.
- [x] A preparação da requisição é registrada primeiro como uma fase principal completa; seus refinamentos internos — hooks, persistência, compactação, MCP etc. — são expandidos pelo ticket 02. As fases principais deste ticket não podem omitir o tempo de preparação porque as subfases ainda não foram expandidas, nem confundir uma requisição interna de modelo de compactação com a primeira saída da resposta principal.
- [x] A primeira saída vem do recebimento de conteúdo real pelo Renderer originador, aceita corpo de texto não vazio e exibível, pensamento ou chamada de ferramenta, e registra `first_output_kind`; block/start vazios, heartbeat, notificações de status e notificações de telemetry em bypass não disparam a primeira saída. Conteúdo em bypass de turnos antigos e de subtarefas não rouba a primeira resposta desta entrada.
- [x] A chegada da primeira saída encerra o TTFT principal e entra na exportação assíncrona, sem esperar o terminal do turno inteiro; continua-se observando de forma leve o primeiro corpo, um corpo tardio reporta a duração separadamente, um turno encerrado sem corpo tem status próprio, e erros posteriores não revertem o resultado de primeira saída já estabelecido.
- [x] De ponta a ponta usa o mesmo relógio do Renderer originador, e cada processo internamente usa relógio monotônico. O erro de alinhamento entre processos tem resultado medido e limiar executável, e fases curtas são distinguíveis na casa de dezenas de milissegundos; intervalos inválidos ou pouco confiáveis não podem ser falsificados como válidos por clamp em zero.
- [x] O Trace preserva os intervalos reais das fases e a relação causal, e as fases principais são reconciliadas pela linha do tempo real; sobreposições não são somadas em duplicidade, lacunas e intervalos sem atribuição ficam visíveis, e fases não executadas não recebem zero. Rede interna, fila e inferência do serviço de modelo não são divididas sem sustentação factual.
- [x] A mesma verdade de fases gera Metric e Trace de OTel dedicados, reutilizando a infraestrutura de exportação OTLP existente. O TTFT principal tem uma única mensagem como unidade estatística; registros repetidos de attempt ou de fase do modelo não podem inflar a contagem de mensagens.
- [x] Configurar buckets de Histograma em milissegundos dedicados para as fases curtas, com a consulta mostrando contagem de amostras e precisão dos buckets, e fornecer o TTFT total e o P50/P95 de cada fase principal. Não somar percentis nem inferir fases subtraindo o P95 do modelo do P95 total.
- [x] Fornecer consulta básica do ARMS e configuração de dashboard, com combinações controladas de filtro por fase, modelo/provider, versão do app e sistema operacional, e visualização do waterfall de uma mensagem pelo ID de correlação. Identificadores de alta cardinalidade de mensagem, Trace ou workspace não entram em Metric labels.
- [x] A decisão de liberação gradual é consistente em toda a cadeia; o detalhe de TTFT limitado da população habilitada não é amostrado ativamente nem depende do Trace de 10% da CLI antiga nem de amostragem independente do Renderer. Quando desligado, nenhuma coleta nova é iniciada; a atribuição pai-filho e a amostragem do Trace antigo do Agent não mudam.
- [x] O registro de fases, a memória e a fila de exportação são limitados; timeout, rejeição ou fila cheia na exportação não bloqueiam o envio e a saída do usuário, e descartes e truncamentos são observáveis. Não há envio de rede por token; não se coleta corpo de texto, conteúdo de arquivo, caminhos brutos, credenciais ou Header/Body de requisição.
- [x] O desktop continua por desktop-continuous; workspace remoto, celular/Web, hydration de histórico, recuperação replayable e tarefas automáticas não geram TTFT de usuário local; a semântica e as contagens de eventos de negócio legados, RUM TTFT e funil de envio permanecem inalteradas.
- [x] Escrever primeiro o E2E "Composer de desktop real enviando → resultado decodificado pelo receptor OTLP final", e só então implementar a cadeia. Reutilizar a organização existente de replay de conversa e de receptor HTTP OTLP, verificando o Trace/Metric final em vez de apenas validar chamadas internas de função.
- [x] O E2E cobre corpo de texto, pensamento e ferramenta chegando primeiro, evento de início vazio, corpo tardio, primeira saída anterior ao ACK, e a atribuição após injetar atrasos conhecidos nas fases principais; os testes de baixo nível apenas complementam os casos de relógio, deduplicação e fronteiras de protocolo difíceis de reproduzir de forma estável.
- [x] Validar com amostras controladas os percentis básicos do ARMS e a exibição de correlação por mensagem, guardando evidências de execução real ou de exportação de teste; a aceitação de plataforma é registrada separadamente dos testes locais. 2026-09-15 concluído: o novo service já está no banco, o P50 total e o P95 por fase são consultáveis, `observation_id` sem hifens é igual ao traceID, e a união das seis fases da mensagem única de 62 spans reconcilia com a duração raiz. Evidência em [platform-evidence](../../monitoring/local-ttft-platform-evidence.json). A confirmação visual do waterfall na interface do console ainda não foi feita.
- [ ] Concluir os E2E/testes unitários relevantes, typecheck, lint e o gate de arquitetura, deixando documentação do contrato de fases, do erro de relógio, dos buckets e dos limites de volume de dados. Se uma pequena refatoração preparatória for necessária, fazê-la antes da fiação e manter o comportamento atual, sem abrir uma tarefa de refatoração ampla.

## Handoff de escopo

O protocolo da cadeia principal, a correlação, a qualidade da medição de tempo, a exportação e a capacidade de teste de saída final formam, neste ticket, uma fronteira reutilizável. O [Ticket 02](02-queued-retry-and-failure-diagnostics.md) expande as subfases de preparação sobre o mesmo contrato, adiciona suporte a fila, retry e cenários excepcionais, e conclui o dashboard completo de diagnóstico e a aceitação da liberação gradual.

Os dois juntos implementam a spec pai; o suporte de cenário estreito deste ticket não significa que a exigência inteira esteja concluída, e não é ampliado para desktop remoto ou controle remoto pelo celular.

## Implementação e verificação (2026-09-14)

A implementação local e a configuração de consulta foram concluídas; a aceitação final na plataforma e a verificação completa da CLI ainda não, portanto o status permanece in-progress.

- [Contrato de fases e consultas](../../monitoring/local-ttft-queries.md), [configuração de dashboard](../../monitoring/dashboards/local-ttft.json), [evidência final de OTLP](../../monitoring/local-ttft-evidence.json).
- E2E de desktop real 3/3 aprovado: corpo de texto, pensamento e ferramenta chegando primeiro; início vazio; corpo tardio; conteúdo anterior ao ACK; atribuição de atrasos conhecidos de comando e modelo. O TTFT principal e o Histograma das seis fases têm 3 amostras cada, sem inflar por attempt.
- Limite superior do erro de relógio na execução final: 3,125 ms, abaixo do limiar de 10 ms. As três categorias — corpo de texto normal, pensamento e ferramenta — têm quality=complete; execuções sem foco não são misturadas às amostras de sucesso.
- Testes unitários completos na raiz: 1707 arquivos aprovados, 14991 casos aprovados, 14 ignorados; typecheck da raiz, typecheck do E2E, lint e architecture gate na raiz aprovados.
- Vitest direto completo da CLI: 442 arquivos aprovados, 76 falharam; 5872 casos aprovados, 187 falharam. A entrada turbo padrão está ausente neste ambiente. Não se pode afirmar que a CLI completa passou; as falhas não foram atribuídas uma a uma. O cenário stale do gateway afetado já falhava no HEAD inicial e foi reproduzido com carregamento isolado do código; a execução isolada de oversize passou (2,91 s) e, no full run, chegou a sofrer com o orçamento de 5 s por teste.
- Um typecheck de tsc adicional do Desktop em todo o projeto encontrou erros já existentes de rootDir/global declaration; o novo exporter passou em typecheck strict isolado.
- O projeto ARMS de Pequim permite consultar em modo somente leitura os Trace/Metric existentes do ZCode, e as consultas SLS SQL+PromQL foram validadas. As amostras do novo service ainda são 0; o endpoint/headers de escrita OTLP de destino não estão configurados nesta máquina; não foram validados a ingestão de novas amostras, o salto real para o waterfall e a política de retenção da plataforma.
- Os testes continuam como candidatos manual-review/pending, sem autoconversão nem entrada no Docker suite; não há evidência de execução de E2E em máquina real Windows/Linux nem de controle remoto pelo celular.

## Aceitação de plataforma (2026-09-15)

O registro anterior de "amostras do novo service iguais a 0" foi substituído: com o valor de ingestão vindo das variáveis de CI, duas execuções de `conversation-session-ttft-stages` (3/3 aprovadas cada) tiveram suas amostras gravadas no ARMS de Pequim e todas estão consultáveis.

- Forma do ponto de ingestão: a base `/apm/trace/opentelemetry` recebe simultaneamente `/v1/traces` e `/v1/metrics` (ambas com 200); a base de metric separada retorna 404. O main do desktop não precisa de um novo canal de injeção de endpoint de metrics.
- O nome da métrica não tem sufixo de unidade, então o nome padrão do contrato de consulta vale; a semântica DELTA + `sum_over_time` vale. P50 total de 1500ms, P95 completos das seis fases, 18 amostras de fase = 3 envios × 6 fases (sem inflar por attempt).
- Waterfall de mensagem única: `observation_id` sem hifens é igual ao traceID; 62 spans, raiz de 701,70 ms reconciliada com a união das seis fases de 701,69 ms, com `unattributed_ms=0` e `clock_error_ms=5.02`, ambos dentro do contrato.
- Detalhe e agregação são consultáveis já no fim da execução (primeira rodada de polling acerta, limite superior <5s), não é uma medição exata item a item.
- Não concluído: confirmação visual do waterfall na interface do console, caminho de injeção de escrita na build empacotada, período de retenção e custo. Os itens não aprovados da suíte completa da CLI e as evidências em máquina real Windows/Linux permanecem como acima.

Detalhes em [checklist de rollout](../../monitoring/local-ttft-rollout-checklist.md) e [evidência de aceitação de plataforma](../../monitoring/local-ttft-platform-evidence.json).

## Standards

Os problemas de isolamento da telemetria e o risco de falha na inicialização por Metrics URL inválido, encontrados na revisão de padrões, foram corrigidos; o callback de diagnóstico também está isolado. O Header/endpoint próprio de Metrics entrou na lista existente de captura privada e de limpeza de tool env, e credenciais não são passadas às ferramentas.

## Spec

Foram corrigidos a fronteira de preparação de execução tardia demais, a perda de identificação de eventos completos de ferramenta, a rejeição da completagem de turn ID desconhecido, a limpeza prematura do terminal, a má classificação de amostras de recuperação e a marcação errada de retry em falha. O tempo monotônico do ponto de entrada de execução, via raw TurnStarted, serve apenas ao novo consumidor de TTFT e não estende o antigo strict telemetry fact. Itens pendentes de plataforma e da CLI completa permanecem como acima.

- Uma coverage audit adicional não passou: as referências automatizadas existentes D19/I74/I75, as estatísticas e o documento de decisões de geração estão desatualizados; nesta tarefa, os metadados do fixture pendente tiveram 0 rejected e o check de fixture dedicado passou. Não se reescreveu neste trabalho a estatística de casos não relacionada nem o documento de decisões.

A regressão de isolamento do workspace de calibração foi corrigida: requisições clock-only não ocupam a vínculo de workspace das consultas de negócio do Host, e consultas de session command são rejeitadas na camada de protocolo.