# Revisão de implementação e entrega do lote Todo105–113

2026-09-10. Escopo: 105, 106, 107, 108, 110, 111, 112, 113; 109 mantém a semântica de migração já
concluída, 102 mantém a dívida de testes existente e 101 Draft não é implementado.

## Conclusões item a item

| Todo | Implementação e evidências                                                                                                                     | Revisão de abstração e fronteiras                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 105  | Quatro listas de Account pessoal/equipe mantêm apenas 5.3/Flash; testes de membros de Settings/Registry sobre a configuração realmente publicada | Não remove regras específicas de modelo; adicionar 5.2/Turbo manualmente ainda resolve; não altera Start, ocioso nem seleções históricas                                                                        |
| 106  | Sonnet 5 não abre mais MCS por engano; Opus 4.8 tem habilitação em nível de modelo; regras de URL independentes para pacote comum/Start/ocioso; captura do wire system/search pelo SDK real | O Runtime não recupera a especialização por domínio; Personal pode sobrescrever; não estende capacidades de mídia do pacote ao 5.3 comum nem ao ocioso                     |
| 107  | enabled no nível externo do Provider, semáforo de três cores, feedback de três estados na remoção com retry, teste de conexão fechando o botão em caso de sucesso, arrasto vertical, Key URL dos 17 templates | O Resolver é a única fonte de admissão; não desabilita modelo por modelo, não desvincula, não limpa seleção e não revoga Model já vinculado; o menu Team consulta a Settings View pelo ID concreto, sem usar o Provider pessoal herdado |
| 108  | O Verifier herda o nível de raciocínio do modelo vinculado e o limite de tokens de saída do modelo em uso; 5 testes reais de requisição Runtime/Adapter | Não altera outras chamadas auxiliares de baixo custo e não adiciona caso especial ao Factory genérico                                                                                                                |
| 110  | O Guide continua reanalisando; compara o Loop Model antigo com a nova Selection completa para decidir reconstruir o System; 9 testes reais de requisição Runtime | Após mudar a configuração com a mesma seleção o limite real de saída é atualizado e o System não é reconstruído pela lógica de troca de modelo; Session e Loop não se misturam; o problema pré-existente de congelamento do estilo de saída em troca real de modelo não é ampliado |
| 111  | Quatro templates comum/pacote × BigModel/Z.ai; novo zhipu-coding-plan-api-key; pacote manual de duplo domínio entra na verificação de segurança e API comum não entra; testes de SDK/chave/cache | Não migra instâncias existentes; a busca da API comum não é habilitada; a Key salva mantém o novo tipo; continua reaproveitando os caminhos existentes de verificação de segurança, distribuição de configuração e verificação de conta                         |
| 112  | Listas oficiais GLM, regras precisas e especificação da lista Start; importação de Subagent/Bot/Wiki com renomeação determinística; migrações incrementais SQLite 0021 e App 0003 | Não modifica migration/checksum antigas; campos antigos, horários, corpo, origem histórica e Ticket ocioso não são tocados; JSON inválido/campo ausente não trava; rollback seguido de reupgrade não ressuscita seleções antigas; modelos customizados/desconhecidos não são adivinhados |
| 113  | GPT-6 Astra, Fable 5.1, DeepSeek Flash; modelos agregados recebem apenas IDs verificados; 16 casos de protocolo/nível no SDK | Regras específicas para novos modelos não ampliam o visual dos antigos aliases Pro/proxy; Fable usa adaptive + auto tools + JSON Schema, seguindo a limpeza de thinking entre modelos; não habilita tool calling obrigatório nem adiciona casos especiais beta             |

## Cadeias-chave

```text
Chave -> Overlay Personal existente transacionada -> ProviderConfigRule.enabled
     -> serialização/distribuição do mesmo snapshot de config -> Resolver -> Settings View / Registry
                                          |                 |
                                    cinza/amarelo/verde     admissão de novo Model
Model já vinculado -------------------------- mantém a execução original

Key de pacote manual -> config/salvamento de Key compartilhados -> admissão pela verificação de segurança de access type explícito
                                 -> verificação de segurança de chave/versão oficial existente -> requisição SDK
```

A camada de configuração unifica o default enabled=true; a UI só projeta enabled/executable. Não são
adicionados sistema de sincronização, send barrier, consulta de conta nem Runtime. As fronteiras
desktop continuous e celular replayable permanecem inalteradas, e o remoto continua usando a
configuração do Host alvo, sem fallback para o local.

## Verificação e limitações

- Lote final de merge: 105 arquivos de teste e 1091 testes unitários passando; inclui serviços de
  Provider/Account, regras de configuração, banco e migração de arquivos, verificação de segurança de
  requisições e UI de configurações. typecheck final, lint (41 warnings existentes, 0 erros) e
  verificação de arquitetura (baseline/new ambos 0) passaram.

- A primeira verificação completa de pre-push encontrou um teste antigo em `legacyProviderUpgrade` que
  ainda exigia que o template devolvesse `glm-5.3` em minúsculas, em desacordo com o ID oficial
  decidido no Todo112. Apenas foi atualizado para `GLM-5.3`, mantendo as asserções de Key, arquivo
  antigo, edição posterior e não reimportação; isso não ajusta a semântica antiga de migração de
  Provider.

- O primeiro grupo de Provider/configuração/migração/configurações, com 507 testes, passou; os
  conjuntos de serviços estendidos e de UI, com 523 testes existentes, passaram, e 3 expectativas
  antigas ajustadas neste lote foram reconfirmadas. Há também regressões específicas para combinações
  de conta e para o semáforo de estado do Team.

- 6 arquivos de Adapter com 42 testes passaram (verificação de segurança de duplo domínio, MCS,
  rollback de BD, Verifier, novos modelos); 2 arquivos de auto tools/JSON Schema e histórico de
  reasoning com 41 testes passaram. 9 testes do Guide passaram e os 186 testes de Runtime/tool-loop do
  lote anterior passaram. Há sobreposição entre os conjuntos; não se deve somá-los como um total
  independente.

- Foram reconfirmados os testes de isolamento de Key que compartilham a verificação de segurança de
  requisição, a junção concorrente, o rebaixamento em caso de falha, o Abort/erro de credencial sem
  rebaixamento e o chave dinâmico; nenhuma Key real nem modelo pago foi usado.

- Novo `packages/ui/test/browser/manual-review/pending/provider-settings-batch.test.mjs`: componente
  real + adaptador de serviço isolado; 390px/chinês/claro e 1200px/inglês/escuro passaram, cobrindo
  agrupamento, entrada de Key não vazia, salvamento de enabled, arrasto, retry de remoção e fechamento
  em caso de sucesso. Não é prova em hardware de shared-host.

- Atualizadas as expectativas de settings-ui-polish, pending provider-settings-write-recovery e
  Guide GS/P06; os três testes de Electron não foram executados integralmente nesta rodada. O Pro SSH
  não conseguiu conectar desta vez; não se declara verificado o shared-host real do celular + SSH, a
  resposta de modelos em produção nem o estado de login no console; a verificação conjunta em hardware
  adiada pelo usuário não é escrita como aprovada.

- `pnpm typecheck`, o typecheck de adapters/core da CLI e `pnpm lint` passaram (lint com warnings
  existentes, sem erros); a reconfirmação unificada acontece antes do commit final, valendo o
  registro da MR. O baseline de arquitetura não é atualizado e problemas existentes sem relação não
  são ampliados.

## Conferência das Key URLs dos templates (2026-09-10)

A URL é mantida de forma única nos metadados dos templates Built-in. Os quatro tipos de entrada da
Zhipu estão no Todo111; as demais entradas novas:

| Template         | Entrada oficial                                                         | Nível                                        |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| Kimi             | https://platform.kimi.com/console/api-keys                              | Console de Key                               |
| MiniMax          | https://platform.minimaxi.com/console/access?tab=api-keys                | Console de Key                               |
| Qwen China       | https://bailian.console.aliyun.com/cn-beijing?tab=model                  | Console regional oficial, sem adivinhar deep link do usuário |
| Qwen Internacional| https://modelstudio.console.aliyun.com/ap-southeast-1?tab=dashboard     | Console internacional oficial                  |
| MiMo             | https://platform.xiaomimimo.com/                                         | Entrada oficial superior, sem afirmar acesso direto à página de Key |
| OpenRouter       | https://openrouter.ai/keys                                               | Keys oficiais; redireciona quando não há login |
| OpenCode (3 protocolos) | https://opencode.ai/auth                                          | Login Zen oficial, Key compartilhada          |

DeepSeek/OpenAI/Anthropic/xAI mantêm as URLs de console oficial já existentes; há asserção de link
HTTPS para todos os templates.

## Revisão de impacto

O diff real atingiu, na varredura de codeSeeds do feature graph, model-capabilities, model-selection,
provider-templates, plan-entitlements, provider-registry, subagents e provider-settings /
conversation-model-control. É obrigatório verificar Settings Facade, Resolver, serialização de Access
e ModelFactory/Adapter; verificar a um salto os candidatos e os commits independentes de Composer,
Automation, Bot, Wiki e Subagent.

Este branch também contém o DB109 e a documentação já submetidos antes, o que atingiu task-index,
session-model-timeline, assistant-message-model-provenance, plugin-reference-reminder-history e
conversation-share-context. Isso não significa que este lote reescreva essas funcionalidades, e os
testes de rollback do DB109 continuam cobrindo. Testes, i18n e documentação pertencem às evidências
acima; não há diferença de diff que exija novas fronteiras de produto.

Não há serviço de codegraph, então não se afirma prova completa de grafo de chamadas. Sugestão de
delta do graph: normalização dos modelos oficiais do Start como origem, a nova Key de pacote manual
como access type e o fato de que o Verifier não é uma chamada auxiliar de baixo custo. Não se adiciona
dependência de runtime entre camadas; celular real e endpoints de produção são entregues conforme as
limitações acima.