# Model Provider Restart E2E Cases

## Escopo do feature

Este grupo de cases fixa o limite de restauração da seleção de modelo no `desktop-continuous` local do desktop: após reiniciar o App, deve ser restaurada a Selection completa de Provider/Model/Reasoning que o usuário por último usou de fato e que ainda está disponível. A atual Provider Family Connection Selection estruturada continua determinando a conexão corrente da Family; o antigo `mode/selectedKey` não participa do julgamento de execução atual. O Todo88 confirmou que ele pertence a dados históricos que precisam ser importados; este grupo restaura um representante de cold start da identidade completa de uma Team, verificando que a fronteira de leitura conclui a importação unidirecional.

## Autoridade de estado

```text
Provider Family Connection Selection
          |
          +-----------------------+
                                  |
Persisted Model Selection         |
├─ providerId                     |
├─ modelId                        |
└─ options.reasoningLevel         |
          +-----------------------+
                                  v
                 App 冷启动 -> Selection View
                                  |
                                  v
                       deferred draft -> 首发请求
```

- o teste grava a tupla completa de uma vez via `seedPersistedModelSelection(...)`;
- é proibido gravar model e reasoning em duas vezes, para evitar construir um estado rasgado que o usuário não poderia produzir;
- a disponibilidade do Provider e do modelo é julgada pelo Resolver/Registry/Selection View oficial;
- a Toolbar oferece apenas evidência de UI; a requisição inicial real continua sendo responsável por provar a identidade de execução.

## Cases aceitos

Complemento de 2026-09-07 Todo88 R05: I26, além da chave completa antiga de Team, reinicia também a partir de uma chave antiga contendo apenas produto/projeto. Usa uma resposta real de `getCustomerInfo` com OAuth mock isolado para completar a organização; afirma que a conexão completa nova é persistida, que o campo antigo é mantido e que o modelo original não primeiro é alterado e realmente enviado. Falha/ambiguidade na consulta, não criação de API Key e salvamento concorrente sem rede são cobertos por testes de serviço.

| Catálogo | Case | Setup | Ação | Asserções / evidências | Status |
| --- | --- | --- | --- | --- | --- |
| I25 / MP-R01 | Reinício mantém DeepSeek disponível | persisted selection completa apontando para DeepSeek disponível | Reiniciar o App | toolbar, deferred draft e requisição inicial são DeepSeek | covered |
| I26 / MP-R02 | Reinício mantém o modelo não primeiro dentro do Account Provider | Account Provider expõe vários modelos, persisted selection completa apontando para Highspeed | Reiniciar o App | não volta para `models[0]`; toolbar/request são Highspeed | covered |
| I27 / MP-R03 | Modelo antigo de Start Plan volta para o Coding Plan atual | conexão corrente da Family é Team Plan, persisted selection aponta para Start Plan indisponível | Reiniciar o App | toolbar/request voltam para o modelo default do Team Plan atual | covered |
| I28 / MP-R04 | last-selected indisponível volta para a conexão atual | conexão corrente da Family é Team Plan, persisted selection aponta para modelo removido | Reiniciar o App | toolbar/request voltam para o modelo default do Team Plan atual | covered |
| I29 / MP-S01 | Trocar a forma de conexão da Family preserva o rascunho de outros Providers | rascunho DeepSeek e conexão atual BigModel pay-as-you-go | Trocar para Team Plan na página de configurações | rascunho DeepSeek e requisição inicial inalterados | covered |
| I30 / MP-S02 | Reselecionar o Coding Plan atual preserva o rascunho de outros Providers | rascunho DeepSeek e conexão atual Team Plan | Selecionar o mesmo Team Plan novamente | rascunho DeepSeek e requisição inicial inalterados | covered |
| I31 / MP-S03 | Plan reconciliation preserva o modelo não primeiro | seleção atual de Team Plan e persisted selection de Highspeed | Resselecionar ativamente o Team Plan atual | toolbar/request continuam usando Highspeed | accepted |
| I35 / MP-T01 | Turbo off mantém dois estados após reinício | persisted selection completa = Turbo/off | Reiniciar o App | toolbar/draft = Turbo; opções de pensamento só off/enabled | accepted |
| I36 / MP-T02 | Turbo enabled reinicia e envia | persisted selection completa = Turbo/enabled | Reiniciar e enviar | toolbar/draft/request = Turbo + enabled | accepted |
| I37 / MP-T03 | Alternância contínua dos dois estados do Turbo | Turbo deferred draft | off→enabled→off | o modelo não salta; as opções permanecem em dois estados | accepted |
| I38 / MP-T04 | Resposta tardia do workspace default isolado | Turbo deferred draft | Trocar o reasoning e esperar a sincronização async da configuração | o draft não é contaminado por outros modelos | accepted |
| I39 / MP-T05 | GLM-5.2 alternando para Turbo atualiza capacidades atomicamente | rascunho atual de três estados do GLM-5.2 | Selecionar Turbo | model e reasoning options convergem de uma vez para os dois estados do Turbo | accepted |
| I42 / MP-T06 | Turbo trocando para GLM-5.2 descarta o nível de origem | Turbo/enabled atual | Selecionar GLM-5.2 | usa o nível default do modelo alvo, sem herdar Turbo/enabled | accepted |

## Cases legados removidos

Complemento do Todo88: antes, a cobertura de todos os formatos de conexão antigos era removida como dados não publicados, o que passou longe da migração real de usuários. I26/MP-R02 agora verifica primeiro o reinício com a seleção nova de Team e, na janela de saída, muda para o antigo mode/selectedKey da mesma identidade; reinicia e verifica que o modelo real continua disponível, que o campo novo foi persistido e que o campo antigo existe apenas para rollback. O modo API não forja plano e, sem organization, não adivinha a identidade de Team; isso é coberto por testes do SettingService, e seu comportamento combinado com a inicialização via conta ainda precisa de aceite separado. Os registros de remoção de I32–I34 abaixo são contexto histórico, não base para continuar rejeitando dados antigos.

Apenas I32–I34 foram removidos. Eles validam a migração do armazenamento antigo `mode/selectedKey` não publicado, e não o comportamento de produto da Selection estruturada atual de Family:

- I32:SelectedKey antigo de Coding Plan no api-key mode antigo;
- I33: migração de identidade de SelectedKey do Team Plan antigo;
- I34: correção de SelectedKey antigo sem organization.

I27–I31 validam o fallback da conexão atual, a troca de Family e a restauração da seleção de modelo, e foram restaurados conforme a selection estruturada oficial.

## Contrato dos fixtures

- cada requisição usa um marker estável; as respostas usam um replay fixture local do case;
- o reinício usa um reload real do Electron, provando a re-hidratação de main/host/renderer/Agent e do estado em disco;
- cada case afirma ao menos uma camada de evidência de runtime, entre a Selection de UI e uma sessão/requisição real;
- o Desktop continua usando a cadeia continuous; este grupo não introduz estado mobile replayable.