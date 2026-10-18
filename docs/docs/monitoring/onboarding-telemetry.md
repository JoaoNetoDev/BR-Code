# Spec de telemetria do onboarding de usuário

Data: 2026-09-18. Status: já integrado ao componente de onboarding e à cadeia pública de report; o cliente real e o lado receptor ainda aguardam validação manual.

## Objetivo e eventos

Registrar a exposição de todo o onboarding e a escolha no momento em que ele termina, reutilizando a cadeia pública de business telemetry.

| Evento | element_name | event_region | event_type | event_text |
| --- | --- | --- | --- | --- |
| Exposição do onboarding | onboarding_expose | app.onboarding | expose | string vazia |
| Fim do onboarding | onboarding_end | app.onboarding | ck | rótulo localizado do texto do botão no momento da ação ou da entrada de fechamento, obrigatório |

O `event_element` da tabela de telemetria corresponde ao campo de requisição existente `element_name`, cujo parâmetro de chamada é `elementName`; nenhum campo sinônimo novo é criado. O event_text do evento de fim deve usar o texto do botão que o usuário viu no clique, reutilizando o mesmo resultado de tradução i18n do botão, sem fixar chinês, inglês ou a translation key; ele é capturado junto com o snapshot da escolha, evitando inconsistência de texto quando o idioma muda durante um salvamento assíncrono. A estatística do tipo de ação usa o `exit_action` fixo em inglês.

A entrada de fechamento é um botão de ícone, e o event_text reutiliza a tradução `occupationOnboarding.close` do title / aria-label: hoje “退出引导” em chinês e “Exit onboarding” em inglês. Esc e o atalho do onboarding também usam o mesmo rótulo de fechamento quando recolhidos ativamente, sem passar string vazia nem nome da tecla.

- A primeira exibição automática, as aberturas posteriores pelo clique em “引导” nas configurações, a abertura manual pelo atalho e a nova exibição automática conforme as regras existentes expõem uma única vez quando o onboarding está de fato visível; não se limita ao primeiro uso do app. Julgamento assíncrono, pré-preenchimento, re-renderização, troca de etapa e voltar não geram exposição repetida. Reabrir explicitamente após o fechamento conta como uma nova vez; apenas clicar na entrada sem exibição real não reporta exposição.
- Na terceira página, clicar em começar a usar ou pular: assim que a preferência for salva com sucesso e o onboarding terminar, o end é reportado uma vez. A escolha é capturada no clique e não pode ser inferida a partir do valor padrão conservador após o salvamento nem do record local.
- Se a gravação falhar, a tela continua no onboarding e o end não é reportado; uma retentativa bem-sucedida reporta apenas uma vez. Falha ao anexar ao record local não afeta um evento de fim que já teve sucesso.
-Nas duas primeiras páginas, pular apenas avança para a próxima página e não dispara end; a página de opção única pulada é registrada como vazia, e se o usuário voltar e confirmar de novo, vale a nova resposta.
- O X no canto superior direito / Esc / o atalho do onboarding, quando recolhidos ativamente, reportam end, com exit_action igual a close, carregando o snapshot da escolha no momento do fechamento e a etapa em que estava; mantém-se a semântica já existente de sair diretamente sem salvar settings, sem escrever record e sem marcar conclusão. O reporte é iniciado antes da saída e não espera a rede. Fechar o app, uma falha ou um unload que não seja ação do usuário não fabricam um close.
- Uma mesma execução de onboarding gera no máximo um end; start / skip / close compartilham a deduplicação de fim; o comportamento já existente de desabilitar o fechamento durante o salvamento permanece inalterado. A diferença entre exposição e fim representa amostras que não receberam o evento de fim com sucesso, podendo conter interrupções inesperadas ou falhas de reporte.
- A falha da telemetria não pode bloquear o onboarding nem a gravação de configuração; mantém-se a estratégia pública de retry de upload e não se adiciona retry duplicado na camada de negócio.

```text
引导实际显示 -> expose（一次）
    -> 工作方向 -> UI 模式 -> 工作助手偏好
         跳过 ----> 下一页       |
                        start / skip：捕获选择快照
                               |
                         settings 保存
                      失败 /          \ 成功
                    留在引导           end（一次）
                                       -> 原有结束流程
任意页 X / Esc / 引导快捷键收起
    -> 捕获已有选择 + 当前步骤
    -> end(close，一次，不等待网络) -> 直接退出，不保存配置或记录
```

## event_extra_detail

O evento de exposição usa um objeto vazio. O evento de fim contém sempre os seguintes campos:

| Campo | Valor lógico | Significado |
| --- | --- | --- |
| work_direction | enum da tabela abaixo / null | direção de trabalho atual da página exibida; null se pulada sem reseleção |
| ui_mode | work / code / null | escritório / programação; null se não exibida ou pulada sem reseleção |
| proactive_task_recommendations_enabled | boolean / null | estado da marcação de recomendações proativas de tarefa, exibida apenas no modo escritório |
| workspace_memory_enabled | boolean / null | estado da marcação de memória do workspace |
| claude_code_history_migration_selected | boolean / null | estado da marcação de migração dos dados de sessão; não indica migração concluída |
| exit_action | start / skip / close | entrada de término |
| exit_step | 1 / 2 / 3 | página em que estava no fim; 3 para start / skip, qualquer página para close |

O mapeamento de modo acontece apenas na fronteira da telemetria: internamente `office -> work` e `coding -> code`; os modos não são renomeados em settings, store ou record.

Campos de preferência: true quando exibido e marcado, false quando exibido e não marcado, null quando não exibido. Quando o modo de programação ou o pulo da página de modo oculta a opção de recomendação, o campo de recomendação é null e não pode ser contado como desativação proposital. A marcação padrão ou pré-preenchida também conta para o estado final e não indica clique deliberado. Clicar em skip na terceira página ainda envia o estado dos três opciones naquele momento, sem zerar tudo uniformemente e sem indicar que essas opções foram aplicadas.

O close também registra a escolha atual e não exige que a página atual tenha sido confirmada com Avançar: por exemplo, ao fechar logo após entrar na primeira página, envia o padrão/pré-preenchimento ou a escolha manual exibida na página, com modo e os três campos de preferência como null; fechar na segunda página pode enviar a direção de trabalho e o modo atual, com as preferências ainda não exibidas como null. Páginas às quais se retorna depois de já ter passado mantêm a escolha desta vez e não se pode inferir quais páginas foram exibidas apenas a partir do exit_step. Ao voltar e alterar o modo, o snapshot antigo das preferências que ficaram inconsistentes com o novo modo deve ser invalidado, e as preferências não confirmadas no novo modo são registradas como null. Tudo isso é snapshot de escolha e não representa gravação nem ativação bem-sucedida.

**Formato de transporte**: o `TelemetryEventPayload.eventExtraDetail` existente é `Record<string, string>`. Reutiliza-se essa interface, codificando cada valor como string: booleano como `"true"` / `"false"`, valor nulo como `"null"`, número de página como `"1"` / `"2"` / `"3"`. Não se omitem campos vazios, não se passa JS undefined e não se serializa novamente o objeto inteiro em JSON. Os tipos lógicos acima servem para interpretar o significado; as consultas reais comparam strings. Caso se adote boolean/null nativo no futuro, é preciso avaliar o conjunto e evoluir a interface pública, sem forçar a conversão de tipo apenas neste evento.

### Mapeamento de direção de trabalho

| Texto em chinês | occupation interna | work_direction |
| --- | --- | --- |
| 软件开发/数据/AI | developer | software_data_ai |
| 创业/自由职业/OPC | independent | entrepreneurship_freelance_opc |
| 测试/运维/安全 | infrastructure | qa_operations_security |
| 产品/项目/解决方案 | product | product_project_solutions |
| UI/UX/视觉设计 | design | ui_ux_visual_design |
| 学生/教师/科研 | student | education_research |
| 金融/财务/咨询 | finance | finance_accounting_consulting |
| 自媒体/内容创作 | creator | media_content_creation |
| 运营/电商/客户服务 | operations | business_operations_ecommerce_customer_service |
| 市场营销/品牌/公关 | marketing | marketing_brand_pr |
| 法律/行政/人力资源 | legal | legal_administration_hr |
| 其他职业 | other | other |

A enum interna de profissões não é modificada. Mudança no texto exibido ou no idioma não pode alterar a enum reportada. `other` significa apenas a escolha explícita de outra profissão e não substitui uma resposta em branco.

## Campos públicos de identidade e cadeia

Os dois eventos devem carregar via camada pública os campos de topo `user_id` e `device_mid`, sem colocá-los no event_extra_detail.

- user_id: usa a carga atual de identidade de conta da camada pública; sem identidade de conta, mantém-se a string vazia, sem forjar um user ID e sem usar o device ID como substituto. A implementação e a aceitação devem verificar que as requisições de usuário logado contêm um ID de conta real e que o campo ainda existe no caso anônimo.
- device_mid: reutiliza o identificador de dispositivo público persistido no telemetry-state, fornecido por `ensureTelemetryDeviceMid`; não gera um ID exclusivo do onboarding, não reutiliza o event_id e não passa a usar `platform.getDeviceId()`. O deviceId do documento local onboarding-record tem origem diferente do identificador público de dispositivo da telemetria e não deve ser misturado.
- Cada evento usa o ID de evento público e o contexto público, sem criar uma interface de reporte independente.

```text
OccupationOnboarding
  -> reportAppTelemetryEvent / usePlatform
  -> IPlatformService.reportTelemetryEvent
  -> Desktop 公共 TelemetryCore
       + 当前 user_id
       + 持久化 device_mid
  -> 既有 event/report 请求
```

Exemplo de requisição (apenas os campos relevantes; os valores de identidade são placeholders):

```json
{
  "element_name": "onboarding_end",
  "event_region": "app.onboarding",
  "event_type": "ck",
  "event_text": "开始使用",
  "user_id": "<current-user-id>",
  "device_mid": "<shared-telemetry-device-id>",
  "event_extra_detail": {
    "work_direction": "product_project_solutions",
    "ui_mode": "work",
    "proactive_task_recommendations_enabled": "true",
    "workspace_memory_enabled": "true",
    "claude_code_history_migration_selected": "false",
    "exit_action": "start",
    "exit_step": "3"
  }
}
```

## Fronteira com o registro local e com as outras plataformas

A semântica de pulo do record local continua seguindo o [Spec do registro de onboarding](../onboarding-record-spec.md): pulo na página de preferências escreve null e settings recebe o valor padrão conservador. Este evento registra a escolha vista pelo usuário no encerramento; os dois têm propósitos diferentes e o record não pode ser enviado no lugar deste evento. Nesta fase não se implementa a fila de upload uploadState do record.

A UI chama pela abstração de plataforma existente; Web e celular reutilizam as capacidades dos próprios adaptadores, sem acessar diretamente o bridge do desktop nem criar um novo Host/runtime; o fluxo de mensagens continuous do desktop e replayable do celular não muda. Layout, interação, tema, internacionalização e o comportamento de configuração em Windows/macOS/Linux permanecem como estão.

## Ordem de implementação e aceitação

Escrever primeiro os testes dos cenários abaixo, depois conectar os eventos e, por fim, fazer a verificação de requisição em runtime:

1. Os 12 mapeamentos de profissão estão completos; office/coding mapeiam para work/code; ao pular uma página de opção única passa a string null, e as outras profissões usam other.
2. No modo work, os três toggles suportam marcado/desmarcado individualmente; no modo code a recomendação é null; após trocar de modo, a opção oculta não vaza o valor antigo.
3. Tanto start quanto o skip da terceira página preservam o snapshot do momento do clique; skip não dispara migração, e marcar a migração não significa migração bem-sucedida.
4. A primeira exibição automática e a abertura por configurações/atalho geram exposição; o skip das duas primeiras páginas, o retorno e a re-renderização repetida não geram evento de fim nem exposição repetida; falha de gravação não reporta fim, e uma retentativa bem-sucedida reporta uma vez; cliques repetidos não geram reporte repetido; reabrir explicitamente gera nova exposição.
5. Fechando com X / Esc / atalho do onboarding em cada uma das três páginas, reporta-se close apenas uma vez, com exit_step correto; escolhas já exibidas são preservadas, campos não exibidos ficam vazios, e após retorno ou troca de modo não vaza preferência invalidada; não grava settings/record, não dispara migração e não marca conclusão. Fechar o app ou o unload não fabrica close, e a falha de reporte não bloqueia a saída.
6. No corpo real da requisição pública, verifica-se que os dois eventos contêm user_id e device_mid; a conta logada está correta, o anônimo mantém user_id vazio, e o device_mid dos dois eventos no mesmo dispositivo é consistente e estável após reinício. Mascare a identidade real ao exibir logs ou capturas de pacote.
7. Rodar pnpm typecheck, pnpm lint e os testes unitários relacionados; validar que o work/code do desktop, os temas claro e escuro e o adaptador do celular não são afetados. Validações de plataforma cruzada ou em runtime que não puderem ser concluídas devem ser registradas explicitamente, sem substituí-las por leitura estática.
8. Em chinês e em inglês, o event_text do evento de fim para start / skip / close nunca é vazio e é igual ao texto real do botão no momento da ação ou ao rótulo de fechamento (退出引导 / Exit onboarding); o exit_action não muda com o idioma. Trocar de idioma durante o salvamento assíncrono não pode alterar o event_text já capturado.

## Pontos de implementação e casos de regressão

`OccupationOnboarding` permanece o único owner do estado de escolha; `useOnboardingTelemetry` registra, apenas no layout effect, a etapa realmente exibida, o modo atual e a deduplicação de fim da mesma execução, sem persistir uma segunda cópia das respostas. A entrada de gravação congela o snapshot primeiro e envia o end depois do sucesso de settings; o close envia direto. Depois de terminar, a etapa é zerada, evitando que a reabertura reaproveite o escopo exibido da última vez.

| Caso | Configuração e operação | Asserção | Local de automação |
| --- | --- | --- | --- |
| ONBT-01 | primeira abertura automática/manual, StrictMode, troca de página, reabertura | uma exposição por abertura real, nenhuma exposição quando não exibido | UI occupationOnboardingTelemetry.test.ts |
| ONBT-02 | start/skip após os três passos, retentativa após falha de gravação | um end após o sucesso, resposta e idioma do momento do clique preservados, intenção de migração não equivale a sucesso | o mesmo |
| ONBT-03 | fechamento em qualquer página, retorno com troca de modo e novo fechamento | close e número de página corretos, preferências não exibidas/invalidadas vazias, nada é salvo | o mesmo |
| ONBT-04 | Core público reportando evento anônimo/logado | user_id/device_mid no topo, identificador de dispositivo consistente após recriar o Core | services telemetryService.test.ts |
| ONBT-05 | reabertura do onboarding real no desktop, close/start/skip | corpo real da requisição e evento no receptor, identidade e campos completos | validação manual do usuário |

Conforme solicitado pelo usuário, desta vez o E2E não é item de aceitação, e a verificação do código usa testes de interação de componente e testes do corpo de requisição do Core público; o cliente real e o receptor de produção são validados manualmente pelo usuário e ainda não foram aceitos. Web e celular continuam reutilizando a capacidade dos adaptadores de plataforma originais, sem nova saída de upload independente.