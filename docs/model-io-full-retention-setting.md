# Configuração de Retenção Integral do ModelIO

## Status

- Este documento define os limites de produto e de implementação do interruptor de retenção integral do ModelIO em Settings.
- Trata-se de uma preferência global de diagnóstico do App, e não de estado de recuperação de conversation/session.
- Desativado por padrão; `setting.json` históricos sem esse campo são tratados como desativado.

## Semântica para o Usuário

Settings / General oferece o interruptor 「保留完整模型 I/O」 (manter I/O completo do modelo):

- Desativado: mantém o modo bounded atual. Em produção são mantidos no máximo 3 arquivos de session, com reset quando um único session atinge 64 MiB; em desenvolvimento, reset quando um único session atinge 256 MiB; as mensagens de requisição usam compactação `full` / `delta` / `tail` e, em produção, campos grandes duplicados são podados.
- Ativado: a partir do próximo model attempt, passa a gravar o registro completo, sem descartar arquivos de session antigos, sem reset por capacidade de session individual, sem gerar `delta` / `tail` e sem executar a poda de campos de produção.
- Alternar não reescreve, não recupera e não exclui registros já existentes. Depois de desativar novamente, a estratégia bounded é retomada a partir da próxima gravação.
- Com a opção ativada, prompt, tool input/result e a saída do modelo são salvos por completo; a configuração altera apenas a estratégia de retenção, não a fronteira de sanitização de segurança.
- A sanitização de credenciais no Header e nos metadados de requisição Anthropic pertence à fronteira de segurança e não pode ser desativada em nenhum modo.

## Estado e Cadeia de Sincronização

```text
Settings Switch
  |
  | ISettingService.update({ modelIoFullRetentionEnabled })
  v
~/.zcode/v2/setting.json                    authoritative app preference
  |
  +--> current Local Host ------------------+
  |                                         |
  +--> active Remote/Bot Host --------------+ App runtime preference sync
                                            |
                                            v
                              workspace/updateModelIoPreferences
                                            |
                                            v
                              workspace-scoped zcode-cli process
                                            |
                          +-----------------+-----------------+
                          |                                   |
                    resident apps                      future apps
                    update adapter                     inherit snapshot
                          |                                   |
                          +-----------------+-----------------+
                                            v
                                  ModelIO write boundary
```

Restrições de sincronização:

- Local, SSH, WSL, Docker e Server remote usam todos a mesma preferência global do App desktop; um workspace remoto não lê o próprio `setting.json` remoto como valor autoritativo.
- O Host mantém em cache a preferência mais recente e a reenvia após criar ou reiniciar o workspace CLI, antes de permitir trabalho de session.
- Para CLIs antigos, o novo método de protocolo adota compatibilidade method-not-found: a configuração continua persistida e o CLI antigo segue em modo bounded; isso não pode afetar a sincronização da preferência AskUserQuestion existente.
- O `/remote` do celular continua se anexando ao Host/CLI existente, sem novo runtime independente e sem alterar a semântica de entrega `desktop-continuous` / `web-remote-replayable`.

## Comportamento do Writer

```text
write model_io record
  |
  v
sanitize headers / request metadata       always
  |
  +-- fullRetention = true --> append complete sanitized record
  |
  `-- fullRetention = false
         |
         +--> production duplicate-field pruning
         +--> full / delta / tail compaction
         +--> session-count rotation
         `--> per-session size reset
```

O valor do interruptor é capturado por snapshot no início de um model attempt; se a alternância ocorrer no meio da requisição, o attempt atual mantém o modo do início e o próximo attempt passa a valer, evitando semântica indeterminada dentro de um mesmo registro.

## Impact Brief

### Resumo do Recurso

| Campo | Valor |
| --- | --- |
| Intenção do desenvolvedor | adicionar um interruptor de retenção integral do ModelIO, desativado por padrão |
| Capacidade | ModelIO diagnostics retention |
| Camada de mudança | presentation / draft-default / commit-effect / persistence |
| Modo de operação | planning |
| Seeds principais | `GeneralSectionContent`, `appSettingsSchema`, `syncAppRuntimePreferences`, `AiSdkModelAdapter`, `writeModelIODebugRecord` |
| Fora de escopo | conteúdo de conversation, task snapshot, queue, stream replay, UI de leitura do ModelIO, política de exportação de logs |

### Matriz de Superfície de UI

| Cenário do usuário | Entrada de UI | Implementação compartilhada | Dono de display/draft | Fonte de default/inherit | Validação/gating | Ação de commit | Autoridade/persistência | Fronteira de modo | Deve permanecer isolado de |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Preservar o rastro diagnóstico completo do modelo | Settings / General | `GeneralSectionContent` + `Switch` | `useSettings` shared snapshot | default `false` de `appSettingsSchema` | boolean schema | `ISettingService.update` + sincronização de preferência do runtime | `~/.zcode/v2/setting.json` + snapshot do runtime do CLI ativo | UI compartilhada desktop/web; sincronia Host local/remote | recuperação de conversation/session, configuração de provider, sanitização de logs |

### Comportamento Compartilhado e Divergente

| Preocupação | Compartilhado entre superfícies | Deliberadamente diferente | Por que importa nesta mudança |
| --- | --- | --- | --- |
| UI/componente | reaproveitar SettingsRow/Switch | sem segunda entrada | evitar múltiplos donos de draft |
| Default/inheritance | todos os workspaces leem o default global false do App | CLIs antigos seguem bounded sem hot sync | preservar compatibilidade retroativa |
| Efeito de commit | CLI local e remoto ativos recebem a preferência | CLI standalone sem UI continua com default false | não expandir o contrato de config do CLI |
| Persistência/recuperação | setting do App persistido | não entra em session/task snapshot | evitar que a preferência de diagnóstico polua o estado de recuperação |

### Relacionamentos entre Recursos

| Rank | De | Aresta semântica | Para | Condição | Por que inspecionar | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| must-inspect | interruptor de Settings | persists-to | App settings | always | default e compatibilidade histórica | `validationAppSettings.ts`, `settingService.ts` |
| must-inspect | App settings | syncs-to | CLI local/remoto ativo | active workspace | a alternância precisa valer imediatamente | `useSettingService.ts`, `zcodeAgentService.ts`, `botRemoteWorkspaceBridge.ts` |
| must-inspect | preferência do CLI | controls | ModelIO writer | every model attempt | define os ramos full e bounded | `runner.ts`, `runner-debug.ts` |
| should-inspect | full retention | increases | volume de diagnóstico retido | enabled | a sanitização não pode ser desligada | `runner-debug-redaction.ts`, textos i18n |
| invariant-only | full retention | must-not-mutate | entrega/recuperação de conversation | all modes | apenas a persistência de diagnóstico muda | architecture docs |
| evidence-only | capability | covered-by | testes de schema/UI/protocol/adapter | implementation | provar a fronteira ponta a ponta | testes listados abaixo |

### Donos de Estado e Destinos de Commit

| Estado/fato | Dono de draft/display | Dono autoritativo | Comando/serviço de commit | Persistência/cache | Evidência |
| --- | --- | --- | --- | --- | --- |
| Escolha do usuário | snapshot React de Settings | `ISettingService` | `update()` | `setting.json` | testes de UI/service |
| Preferência do CLI ativo | snapshot da preferência mais recente do Host | contexto de protocolo do workspace CLI | `workspace/updateModelIoPreferences` | somente memória do processo | testes de protocolo/service |
| Modo de uma única gravação | `AiSdkModelAdapter` | snapshot do attempt do adapter | entrada do runner | nenhum | testes de adapter |

### Invariantes a Preservar

| Invariante | Superfícies/modos | Prova necessária | Evidência |
| --- | --- | --- | --- |
| O default desativado preserva integralmente o comportamento bounded antigo | all | os testes existentes de rotação/tamanho/delta continuam passando | testes de adapters |
| A sanitização de credenciais fica sempre ativa | full + bounded | headers do registro full permanecem redigidos | testes de adapters |
| Não iniciar workspaces dormentes | local/remote | a sincronia de preferência do runtime mira apenas clientes ativos | implementação/testes do service |
| Não alterar a entrega desktop/mobile | continuous/replayable | nenhuma mudança de schema/estado em tempo real | revisão estática de fronteira |

### Evidência de Codegraph

| Seed | Query | Chamadores diretos / caminho-chave | Profundidade | Interpretação |
| --- | --- | --- | --- | --- |
| raiz do repositório | impacto de settings/runtime/modelIO | codegraph index indisponível; usado fallback `rg` | 0 | o drift do grafo deve ser verificado por evidência de texto/tipo/teste |
| `GeneralSectionContent` | chamadores | `SettingsPage` | 1 | entrada única de UI |
| `syncAppRuntimePreferences` | chamadores | Root/useSettings/Bot remote bridge | 2 | dono da sincronia de runtime local e remoto |
| `writeModelIODebugRecord` | chamadores | generate/stream recorder | 2 | fronteira única de persistência |

### Graph Drift e Delta

O grafo atual não tem a capability de retenção do ModelIO. Antes da implementação, complementar a capability, a superfície de Settings, o serviço de sincronia Host/CLI, a persistência JSONL do ModelIO, a evidência de testes e suas arestas semânticas; o codegraph não está indexado, e a validade dos seeds é verificada por `rg`, typecheck e testes.

## Planejamento de Casos

### Decisões de Fronteira

| Fronteira | Decisão | Inclui | Exclui / poda | Fonte |
| --- | --- | --- | --- | --- |
| Definição de full retention | proibir toda autoexclusão, reset, delta/tail e poda de campos de produção | campos de diagnóstico completos de request/response | sanitização de segurança | intenção do usuário + invariante de segurança |
| Escopo de vigência | global no App, com sincronia imediata para o CLI local/remoto ativo | apps futuros e residentes | UI de CLI standalone | arquitetura de app settings |
| Tratamento de histórico | sem backfill e sem reescrita | attempts futuros | recuperar dados já descartados | fronteira append-only |
| conversation E2E | sem novos casos | testes de integração de schema/UI/protocol/adapter | matriz de estado de session | nenhuma mudança de comportamento de conversation |

### Casos Candidatos e Aceitos

| Case ID | Setup | Ação | Asserções | Camadas de evidência |
| --- | --- | --- | --- | --- |
| MIO-FR-01 | settings históricos vazios | carregar settings | switch/default é false | schema |
| MIO-FR-02 | writer bounded de produção | gravar múltiplas sessions e contexto crescente | no máximo 3 arquivos; delta/tail e reset por tamanho inalterados | adapter/arquivos |
| MIO-FR-03 | full retention ativado | gravar múltiplas sessions e contexto repetido | todos os arquivos permanecem; cada registro é full; campos duplicados de produção permanecem | adapter/arquivos |
| MIO-FR-04 | full retention ativado com arquivo de session grande demais | anexar o próximo registro | o arquivo existente não é resetado e nenhum marcador `modelIOReset` é emitido | adapter/arquivos |
| MIO-FR-05 | services local/remoto ativos | alternar o interruptor | a configuração persiste, o Host ativo dá ACK e o payload cross-window inclui o snapshot completo | UI/service/protocol |
| MIO-FR-06 | registro de full retention contém credenciais nos headers | gravar registro | headers sensíveis permanecem `[redacted]` | adapter/arquivos |

### Decisões de Poda

| Decision ID | Combinações podadas | Guard/invariante | Motivo de produto | Cobertura representativa |
| --- | --- | --- | --- | --- |
| MIO-PR-01 | session phase × queue × delivery kind | o modo do writer não lê nem escreve esses estados | evitar acoplamento falso com conversation | revisão estática |
| MIO-PR-02 | produto cartesiano provider/model | o ramo de retenção é neutro a provider após a construção do registro | um único representante generate/stream basta | testes unitários de adapter |
| MIO-PR-03 | screenshots de theme × locale × viewport | apenas SettingsRow/Switch padrão, sem nova primitiva de layout | copy bilíngue + teste de render do componente | teste unitário de UI |