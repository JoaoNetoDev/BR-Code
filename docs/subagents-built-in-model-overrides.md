# Cobertura de modelo e reasoning effort de subagentes

> Decisão vigente (2026-09-08, Todo88/96/97): ao escolher o modelo ativamente, preencher o nível mais alto daquele modelo; lacunas históricas não recebem valor padrão. Candidatos e capacidades são obtidos apenas da Selection View do Environment alvo, sem preenchimento duplo a partir de App metadata/catalog. O histórico de aceitação anterior sobre "nível padrão" e "conciliação com o catalog", descrito abaixo, fica regimentado por esta nota e pela matriz de cobertura vigente, e não pode ser usado para restaurar abstrações antigas.

## Objetivos

### Todo103 G04-A: migração do comportamento de disponibilidade no staging

- Preservar o comportamento de usuário de `5161e0914f`: quando o modelo original não existe mais entre os candidatos explicitamente prontos, o gatilho de edição custom exibe "选择模型";
  o badge da lista ainda pode exibir o modelo original, o rascunho/Markdown original não é limpo, o modelo histórico não é reintroduzido nos candidatos, o salvamento fica desabilitado e o reasoning fica oculto.
- loading/error/unavailable não equivalem a modelo inválido; não se pode usar isso para reescrever a intenção original nem declarar que a nova lista está pronta.
- A atualização de candidatos segue a primeira leitura e as notificações do `useModelSelectionServiceView`; não se reintroduz `useModelProviders`,
  Family selected-key, a dupla fonte App metadata/catalog nem o envio extra de Registry ao entrar na página.
- Start e Individual, mesmo compartilhando endpoint e possuindo modelos com o mesmo nome, são isolados por Provider ID; a lista dinâmica de Start não pode fluir para
  Individual/API Key, e o modelo homônimo de Individual não pode absorver o modelo de Start. Isso é garantido pelo Account Overlay / Resolver existente e verificado por regressão.
- Aceitação: gatilho e seleção original preservados quando falta o modelo no SU, atualização e reentrada do hook público, isolamento de membros com o mesmo endereço no Resolver;
  SE-03 após remover um membro em uma janela real, conferir gatilho, dropdown, salvamento desabilitado e bytes do arquivo inalterados.
- O antigo "Custom editor ainda mostra o nome do modelo original" abaixo é substituído por esta seção; a descrição histórica de conciliação metadata/catalog não serve de base para esta rodada de integração.

O Settings permite ao usuário configurar modelo persistente e reasoning effort para os subagentes embutidos `general-purpose`, `Explore`, subagentes custom e subagentes de plugin. A sessão local integrada lê a configuração do Host no início de um novo contexto pai e fixa a definição da rodada; `Agent` e o `SendMessage` do terminal usam essa definição. A CLI independente e o workspace remoto mantêm a origem da configuração de inicialização. Veja o [contrato de atualização de configuração](./subagent-runtime-refresh.md).

## Não objetivos

### Todo103 G04-B: contrato de integração da arquitetura atual para overrides de plugin

O comportamento da origem `dbb3ec0ce8` é preservado e aceito em três partes: B1 cobre armazenamento/carregamento, B2 a descoberta de plugins oficiais, B3 a UI compartilhada e a atualização da loja.

```text
Seleção padrão do Markdown do plugin (somente leitura)
                        |
 sobrescrita de plugin do usuário em agents-state.json -- sobrescreve a Selection inteira pelo agentId estável
                        |
           nome canônico de profile + alias de nome cru
                        |
     resolução de seleção válida explícita do Todo99
                        |
        fixação do Model filho desta execução
```

- Novo campo gravado `pluginAgentModelSelectionOverrides`: agentId estável → ModelSelection completa.
  O agentId continua sendo `plugin:<name>@<marketplace>:<nome cru do agent em minúsculas>`, sem versão.
- Service/RPC salva uma única vez com `{agentId, modelSelection?}`; compartilha a mesma fila de escrita de state e o ponto de escrita atômica,
  sem dividir em duas gravações de model/thoughtLevel e sem depender da conexão atual ou da lista de candidatos para decidir o conteúdo persistido.
- Limpar a sobrescrita remove a Selection inteira; especificar um novo modelo sem especificar nível não pode herdar o nível do modelo original do plugin.
  Sem sobrescrita, retorna a Selection original do plugin; não altera o modelo já fixado em execução; um novo contexto pai local reaplica a sobrescrita mais recente.
- O duplo map de plugins vindo do staging é convertido uma única vez na fronteira de importação de armazenamento do `migrateSubagentStateFile` existente,
  usando o mapeamento offline de Providers já existente; o reader oficial lê somente o map estruturado. Com o novo map presente (inclusive vazio/corrompido), não há releitura do map antigo.
  Isso não é compatibilidade com o formato intermediário de Markdown com erro, não publicado neste branch, nem adiciona outro fluxo de migração ou consulta de conta.
- O Bootstrap reutiliza o resultado já aguardado do carregamento do state do usuário para injetar no plugin loader, sem nova leitura síncrona de disco.
  Nome canônico e alias aplicam a sobrescrita antes da mesma expansão; sobras de sobrescrita de plugins inexistentes/renomeados não afetam os outros agents.
- Builtin e plugin compartilham o controle de modelo inline; ao escolher o modelo ativamente ainda se toma o nível mais alto; falha ao salvar reverte o rascunho, e falha na atualização após salvar com sucesso não reverte.
  Plugins não abrem edição de prompt/tools, exclusão nem habilitação individual, e não gravam Markdown de projeto/plugin. Reusa-se o mesmo controle responsivo de desktop/tela estreita.
- A complementação por descoberta no cache oficial respeita prioridade do registro de instalação, prioridade de desativação/supressão explícita e escolha de versão válida do manifest, e não pode ressuscitar plugin desinstalado por causa da descoberta complementar.
- A atualização automática da loja é verificada à parte, conforme o comportamento de throttling/deduplicação de concorrência dessa origem; não se confunde instalação, origem, state e cache de exibição em um único estado.
- Aceitação B1: autoridade compartilhada entre migração nova e antiga, salvamento/limpeza/concorrência completos no Host, mesmo resultado de sobrescrita para nome canônico e alias no Agent,
  model-only sem herdar nível antigo, isolamento entre plugins distintos, arquivo de plugin inalterado; o B3 final executa o ciclo completo com Settings real e cold start.
- Integração B2: IDs de habilitação padrão vão para o contrato compartilhado de marketplace, reutilizado pelas três entradas de recursos; incluindo o computer-use hoje explicitamente habilitado por padrão
  (a lista upstream de quatro itens omite este), com comparação mecânica contra a definition da CLI. A varredura de diretório fica na entrada compartilhada apenas-Node,
  sem nova importação de implementação concreta do domínio Plugins por parte de Subagents/Skills/Commands; sem refatorar os demais mecanismos de descoberta de recursos.
- Aceitação B2: builtin padrão sem registro de instalação é visível; não padrão/ desativado explicitamente / suprimido é invisível; entre versões válidas nova e antiga escolhe-se a nova,
  name incompatível com o manifest faz fallback, diretórios temporários/de backup não participam; registro de instalação tem prioridade e registro disabled não é ressuscitado pelo fallback de cache.
- O `settingsUserOnly` do Settings ainda lista apenas itens de usuário/embutido gerenciáveis e não lê arquivos de projeto; mas `pluginAgents`
  precisa retornar a projeção de recursos somente-leitura dos plugins locais, senão o controle de sobrescrita compartilhado é inalcançável na página do usuário.
  Isso não adiciona aliases de plugin à lista de edição do usuário nem amplia o diretório de migração automática.
- O seed de plugins no cold start pode ocorrer depois da primeira leitura da lista de arquivos. Reutiliza-se a inicialização de inventário de plugins já existente na página de configurações;
  na página do usuário escolhe-se um workspace local disponível como contexto de chamada com user scope explícito; após a inicialização, a lista de recursos é atualizada.
  A primeira lista de usuário/embutidos não espera a inicialização de plugins, falha não limpa a lista; troca de página/desinstalação descarta callbacks atrasados, sem depender de atraso ou polling.

- Não é permitido editar nome, descrição, system prompt, tools, permissões ou estado de exclusão de um agent embutido.
- Não é permitido desabilitar agents embutidos.
- Não é criada cobertura de builtin em nível de workspace.
- Não muda o escopo de edição do subagent de workspace; subagent de plugin só abre cobertura de modelo e reasoning effort, e não nome, descrição, prompt, tools, exclusão nem habilitação individual.
- Não se adiciona cobertura de model ou reasoning effort no nível de chamada da tool `Agent`.
- O contexto pai em execução e o child mantêm a configuração original; o salvo passa a valer no próximo contexto pai.
- Não muda o limite de fluxo de mensagens entre desktop continuous e mobile `/remote` replayable.

## Comportamento padrão

- `general-purpose` sem cobertura herda o main model da sessão pai.
- `Explore` sem cobertura herda o main model da sessão pai, assim como `general-purpose`.
- Após limpar a cobertura, o comportamento padrão acima é restaurado.
- Quando o modelo explícito não tem `thoughtLevel` configurado, usa-se o nível padrão de reasoning do modelo alvo no catalog atual.
- Quando o modelo não é configurado explicitamente, `thoughtLevel` não é aplicado isoladamente e as provider options do runtime pai continuam herdadas.

## Formato de armazenamento

Subagent custom salva um `thoughtLevel` opcional no frontmatter do Markdown:

```yaml
model: custom:custom-openai:gpt-5.4
thoughtLevel: high
```

Subagent builtin salva a Model Selection estruturada completa no arquivo de state existente:

```json
{
  "disabledAgentIds": [],
  "builtInModelSelectionOverrides": {
    "general-purpose": {
      "providerId": "custom-openai",
      "modelId": "gpt-5.4",
      "options": { "reasoningLevel": "high" }
    },
    "Explore": {
      "providerId": "custom-openai",
      "modelId": "glm-5.2",
      "options": { "reasoningLevel": "max" }
    }
  }
}
```

A ausência da chave significa que não há cobertura correspondente. Model e reasoning level de um builtin devem ser gravados em combinação por uma única chamada de service; limpar o model remove a Selection inteira. O duplo map antigo já publicado só é importado e gravado na entrada de migração compartilhada em Node, e o reader oficial lê apenas o novo map; com o novo map vazio ou corrompido não se pode reler o map antigo.

### Todo97: migração no lugar do Markdown do usuário

```text
Valor antigo de model no diretório do usuário -> troca offline de Provider -> gravação no arquivo original
                                               |
Arquivos originais de projeto/plugin (não migrados) -----------------------+-> codec oficial -> ModelSelection interna
```

- Host e inicialização do Agent independente reutilizam `migrateUserSubagentMarkdown`, acessando apenas `agents/` do próprio diretório de dados; projeto e plugin não são gravados automaticamente, e links simbólicos e arquivos somente-leitura não são reescritos.
- Só o valor antigo de Provider no frontmatter é trocado, preservando o modelo, o nível, comentários, corpo, campos desconhecidos, quebras de linha e permissões do arquivo; não se chama o serializer inteiro para migração automática.
- O Markdown oficial só lê e escreve as strings `model` e `thoughtLevel`, sem compatibilidade com o campo intermediário `modelSelection` não publicado. IDs com separadores seguem a codificação custom já existente para garantir o round-trip.
- O reader comum não mapeia mais Provider antigo fora de escopo temporariamente para a nova conta; a identidade explícita é preservada, mantendo a validação de execução. Não há novo protocolo de troca automática de conta nem fallback de modelo pai.
- Veja a [auditoria de Selection global](working-memory/provider-refactor/research/todo97-selection-storage-audit.md); o conflito de escrita na leitura do Wiki ainda aguarda decisão e não é considerado concluído.

## Semântica de runtime

```ts
type BuiltInSubagentName = "general-purpose" | "Explore";
type BuiltInSubagentModelSelectionOverrides = Partial<Record<BuiltInSubagentName, ModelSelection>>;
```

O bootstrap lê o state na inicialização; a entrada local integrada, em um novo contexto pai, atualiza as coberturas de model/thought level do profile de builtin com o state em memória do Host. Cobertura passada explicitamente pela configuração de inicialização tem prioridade sobre a do disco; se a configuração de inicialização substituiu o model de um agent mas não forneceu thought level, esse agent não herda o thought level do model antigo no disco.

A input provider-visible da tool `Agent` não oferece parâmetros de `model` ou `thoughtLevel`, e não existe cobertura em nível de invocation. O child runtime de uma sessão comum lê o `AgentProfile` finalmente resolvido:

- Quando o profile não configura modelo, herda o main model da sessão pai e as provider options.
- Quando o profile configura um modelo específico sem thought level, as provider options são geradas com o nível padrão do catalog daquele modelo alvo.
- Quando o profile também configura thought level, deve-se primeiro confirmar que aquele nível pertence ao modelo alvo e então reutilizar o reasoning resolver do main runtime para gerar as provider options; valor inválido é rejeitado diretamente, sem recair no padrão nem em nível vizinho.

Quando a tarefa off-peak fornece `turnExecutionModel` ao child de primeiro plano da rodada, esse snapshot cobre model, thought level, provider options e limites de modelo do profile; nesse momento o thought level do profile não é validado nem aplicado. O snapshot vale apenas para o turn atual e não é persistido, e as chamadas comuns seguintes restauram a semântica de profile acima; o child de segundo plano continua sendo rejeitado pela fronteira de tarefa off-peak.

O campo antigo `Agent.model` já persistido em mensagens históricas não sofre migração de dados e é descartado como campo desconhecido nas execuções seguintes, não podendo sobrescrever o profile atual.

O carregamento, a prioridade de nomes e o campo de modelo já existentes de profile custom/workspace permanecem inalterados. A prioridade de nomes de profile de plugin não muda; ao carregar agents de plugin, o bootstrap lê o mesmo arquivo de state e injeta por id as coberturas de model/thought level no profile de nome canônico e no profile de alias de nome cru, e quando não há correspondência mantém o model declarado no md.

## Escopo de descoberta de subagentes de plugin

Settings e runtime precisam ver o mesmo conjunto de subagentes de plugin. O runtime, via plugin resolve, carrega simultaneamente plugins instalados do marketplace e plugins oficiais embutidos; `discoverPluginAgents` nos services lia apenas `installed_plugins.json`, o que tornava invisíveis nas Settings plugins oficiais embutidos (como `judge` de `document-skills`). Depois da correção, os services varrem também `<cli storage>/plugins/cache/zcode-plugins-official/<name>/<version>/`:

```text
registro installed_plugins.json --------------------+
                                                      +-> deduplicação por pluginId (registro de instalação tem prioridade)
cache/zcode-plugins-official/<name>/<ver> -----------+        |
   diretórios de versão em ordem decrescente numérica,           v
   pega-se o primeiro diretório utilizável      decisão de habilitação:
   pula diretórios .backup / .seed-lock / .tmp-        enabledPlugins[pluginId]
                                                   ?? conjunto padrão habilitado (compartilhado com skills/commands)
                                                   e não está em suppressedBuiltins
```

O `pluginId` dos plugins oficiais é `<manifest.name>@zcode-plugins-official`, igual ao `PluginMetadata.id` da CLI, portanto a chave de cobertura bate dos dois lados.

## Superfície de ferramentas do Explore

Os allowed tools do `Explore` devem avaliar o ramo de embedded-search usando o child model efetivo final. Sem cobertura, não se pode continuar calculando a superfície de ferramentas pelo antigo valor padrão `lite`.

## Semântica de UI

Na lista de Subagents do Settings:

```text
Subagent Settings
                                      |
                                      v
ModelSelectionService.getView() do Environment alvo
                                      |
       +--> candidatos de provider/model
       `--> specs de opções de reasoning
```

A página de configuração de subagente lê somente a Model Selection View do Environment alvo. Workspace remoto lê diretamente a View remota, e workspace local lê a View local; a página não compara snapshot do App com catalog do workspace nem dispara envio de Registry.

- Agents embutidos e de plugin exibem o controle de modelo; ambos compartilham o mesmo controle e a semântica de salvar ao alterar. O texto da opção padrão do agent de plugin também expressa "herdar padrão", o que significa cair no modelo declarado no md do plugin e, se o md não declarar, herdar o main model da sessão pai.
- Quando o modelo explícito de um agent builtin ou custom suporta reasoning, o `ThoughtLevelCycleControl` da caixa de entrada principal é reutilizado à direita do controle de modelo.
- O gating de carregamento de effort é alinhado ao Draft: o Option Spec do modelo alvo na Selection View é a única fonte de capacidade; a página não lê `configOptionsStatus` da Session nem completa a partir do metadata de outro Environment.
- A identidade de Provider/Model usa `providerId + modelId`; a variante de exibição não cria uma segunda identidade de modelo.
- Enquanto o Environment alvo não está ready, exibe loading; em caso de falha de leitura, mostra erro e permite retentativa explícita, sem usar snapshot antigo de Registry ou View local como fallback para o remoto.
- Option Spec de reasoning ausente ou com níveis vazios significa que o modelo atual não tem níveis de reasoning selecionáveis; níveis não vazios são o conjunto legítimo daquele modelo.
- Quando o usuário escolhe um modelo diferente, o `thoughtLevel` explícito em memória é limpo sincronamente; escolher de novo o mesmo modelo é no-op.
- Quando o modelo específico ainda não tem `thoughtLevel` explícito configurado, o controle pode exibir o nível padrão do catalog, mas o valor exibido não equivale a uma cobertura já persistida. O valor realmente selecionado do Select é sempre o nível efetivo atual, garantindo coerência entre foco de teclado e estado de acessibilidade selecionado; o estado explícito é mantido à parte. Se o usuário salvar sem operar o controle de effort, `thoughtLevel: undefined` é preservado; ao reconfirmar o nível efetivo atual ou escolher outro nível legítimo, a escolha deve ser gravada no rascunho e persistida.
- `inherit` ou modelos sem suporte a reasoning não exibem o controle de effort.
- Quando a Selection View fornece explicitamente níveis não vazios, renderiza-se o controle gravável; array vazio ou Option Spec ausente oculta o controle, sem preencher a partir de catalog antigo ou metadata local do App.
- Quando o effort histórico não pertence ao modelo atual, o valor original e o erro são exibidos e o salvamento custom é bloqueado, sem mapeamento automático para o primeiro nível; um builtin pode ser corrigido escolhendo um nível legítimo ou trocando de modelo.
- Depois que um modelo específico salvo é removido dos candidatos atuais, abrir o menu mostra somente os candidatos atuais e o modelo histórico não é reintroduzido no menu; como a capacidade do modelo alvo não está mais disponível, o controle de effort é ocultado. O gatilho do builtin exibe a dica "选择模型"; o badge da lista custom mantém o nome do modelo original e o gatilho do formulário de edição exibe a dica "选择模型". O formulário custom continua preservando o model/`thoughtLevel` original como estado não submetido e bloqueia o salvamento até o usuário escolher um modelo utilizável; apenas abrir a página de edição não pode reescrever o Markdown original. Essa regra altera apenas a exibição do gatilho de modelo, não a origem dos candidatos, validação, salvamento ou semântica de runtime.
- Agents embutidos e de plugin não exibem edit, delete, enabled switch, prompt editor nem tools editor; a linha de plugin não é clicável para abrir formulário.
- O texto da opção padrão de `general-purpose` expressa "herdar padrão".
- O texto da opção padrão de `Explore` expressa "herdar padrão".
- Model/effort de builtin/plugin são salvos atomicamente em uma única chamada, com os dois controles desabilitados durante a escrita; falha na escrita restaura a combinação anterior e exibe toast. O salvamento bem-sucedido é o ponto de commit, e uma falha posterior na atualização da lista não pode reverter a combinação já persistida.
- O salvamento custom sobrescreve o Markdown diretamente com o `{ model, thoughtLevel }` atual; quando `thoughtLevel` é `undefined`, o campo antigo é removido.

## Critérios de E2E

Os testes não podem usar `workspace/updateProviderRegistry` como passo de conciliação da configuração de subagente.

O E2E de desktop valida edição em janela real e efeito após cold start:

1. No Settings, alterar model/effort de builtin e conferir a combinação completa no `agents-state.json`.
2. No Settings, alterar model/effort de custom e salvar, conferindo o frontmatter do Markdown; após trocar de modelo, confirmar que o effort antigo foi removido.
3. Injetar effort histórico inválido, confirmar exibição de erro, bloqueio de salvamento e possibilidade de corrigir escolhendo um nível legítimo.
4. Após o cold start, disparar um child request pela tool `Agent` e confirmar que o model e os parâmetros de reasoning visíveis ao provider vêm da configuração do profile, sem afetar a requisição pai.
5. O child request de `Explore` não expõe ferramentas de escrita.
6. Mesmo que o provider devolva o parâmetro `Agent.model` de uma versão histórica, ele não pode sobrescrever o modelo do profile atual.
7. Para `claude-opus-4-8`, que não declara reasoning no App metadata, a caixa de entrada principal e os Subagents builtin/custom devem exibir `low/medium/high/xhigh` do runtime catalog, com verificação do isolamento de effort pai-filho via raw provider request e model-io.
8. Quando o Settings apenas seleciona um modelo com reasoning sem operar o controle de effort, conferir que o state de builtin não ganha nova chave de thought-level e que o frontmatter do Markdown custom não ganha `thoughtLevel`; ao mesmo tempo, confirmar que o controle ainda exibe o nível padrão do catalog do modelo alvo.
9. Após salvar custom com o modelo A e um effort, remover A das configurações de provedores de modelo e reabrir a página de edição daquele Subagent; conferir que o controle de modelo exibe a dica "选择模型", que o dropdown não contém A, que o controle de effort está oculto e o salvamento indisponível, e confirmar que o Markdown original não foi reescrito automaticamente.
10. Após login no BigModel, quando o workspace catalog ainda não tem Coding Plan, confirmar primeiro que o effort pode ser exibido imediatamente pelo App metadata e depois esperar, de forma independente, a conciliação em background escrever o modelo alvo e `high`/`max` no runtime catalog.
11. Depois que o usuário obtém o Start Plan e entra em Subagents, o grupo de modelos exibe primeiro Start; quando o usuário volta para Individual nas configurações de provedores de modelo e entra novamente em Subagents, o grupo de modelos deve exibir os candidatos Individual. Os testes unitários de UI complementam verificando a troca para Team na mesma cadeia de chave de conexão.

O CRUD do Settings é verificado por um E2E separado, sem provider-request, que valida os artefatos do salvamento, sem encadear com os cenários de child runtime acima:

| Escopo / tipo             | Criação            | Edição                    | Artefato de aceitação após salvar                                                  |
| ------------------------- | ------------------ | ------------------------- | --------------------------------------------------------------------------------- |
| Builtin `general-purpose` | Produto não suporta, podado | Cobertura | combinação atômica de model / effort em `agents-state.json`                         |
| Builtin `Explore`         | Produto não suporta, podado | Cobertura | combinação atômica de model / effort em `agents-state.json`                         |
| Custom user               | Cobertura           | Cobertura (incl. renomear) | frontmatter completo, corpo e remoção do caminho antigo em `<user-data>/agents/<name>.md` |
| Custom workspace          | Cobertura           | Cobertura (incl. renomear) | frontmatter completo, corpo e remoção do caminho antigo em `<workspace>/.zcode/agents/<name>.md` |
| Plugin                    | Produto não suporta, podado | Cobertura | combinação atômica de model / effort por agent id em `pluginAgent*Overrides` dentro de `agents-state.json` |

Esse E2E consome apenas as projeções existentes de model/capability para acionar os controles, não envia prompt, não reinicia para verificar o child e não modifica a CLI nem o model resolver. Custom user e workspace compartilham formulário e service serializer, mas verificam separadamente os dois diretórios reais de gravação.

"Apenas exibe o nível padrão sem operar o effort" é verificado por um case independente, para não ser mascarado pela seleção explícita de effort posterior no mesmo fluxo; esse case também confere os artefatos finais de arquivo do `agents-state.json` de builtin e do Markdown custom.

Salvamento e limpeza de cobertura no Settings são cobertos por testes unitários de UI/service. O E2E de Desktop real de SHR01-SHR03 verifica o spawn do próximo turno de uma session existente, a recuperação de child com falha e a manutenção da configuração antiga no mesmo turno; veja a [aceitação de atualização de configuração](./subagent-runtime-refresh.md).

## Aceitação

- Agents embutidos têm controle de modelo nas Settings.
- Agents embutidos continuam sem entrada de edição, exclusão ou desativação nas Settings.
- Subagents de plugins oficiais embutidos (como `document-skills:judge`) e de marketplace são visíveis nas Settings e têm controle de modelo; agents de plugin continuam sem entrada de edição, exclusão ou desativação.
- Após salvar a cobertura de um agent de plugin, list/state refletem o modelo coberto por agent id; após o cold start o child request usa o modelo coberto.
- Após salvar a cobertura de `general-purpose`, list/state refletem o modelo coberto.
- Após salvar a cobertura de `Explore`, list/state refletem o modelo coberto.
- Builtin/custom conseguem salvar, refletir e limpar o reasoning effort.
- Builtin/custom, ao escolher explicitamente o nível padrão do catalog exibido sem effort explícito, conseguem gravar separadamente em state / Markdown; apenas exibir o valor padrão sem operar o controle continua não adicionando cobertura.
- A troca de modelo limpa imediatamente o effort explícito do formulário; a atualização do provider catalog não limpa.
- Modelos diferentes exibem apenas os próprios níveis suportados; quando não há suporte a reasoning o controle é ocultado.
- Catalog desconhecido e ausência explícita de níveis não podem ser confundidos; loading/payload antigo não limpa nem julga errado o effort histórico.
- Nível histórico inválido não recai silenciosamente nem é salvo.
- Limpar a cobertura restaura o modelo padrão.
- O child request de runtime usa o modelo coberto e as provider options correspondentes a esse modelo.
- A input provider-visible de `Agent` não contém `model`, e versões históricas que passem esse campo adicional não alteram o modelo do child.
- As child tools de `Explore` são coerentes com as capacidades do modelo coberto.