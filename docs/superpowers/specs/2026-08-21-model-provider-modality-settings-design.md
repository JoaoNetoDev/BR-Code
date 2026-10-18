# 3.9.0 — Design das configurações de tipos de entrada e saída do modelo

> O Provider Refactor já consolidou os fatos do modelo oficial em
> `properties.input_format` / `properties.output_format`. Este documento mantém as decisões de UI de staging e o registro histórico de implementação;
> o contrato de dados atual é o de
> [`../../working-memory/provider-refactor/design/model/input-output-format.md`](../../working-memory/provider-refactor/design/model/input-output-format.md).

## Estado

- Versão alvo: 3.9.0
- Fase atual: implementada e com verificação unitária/integrada concluída
- Situação associada: `ModelProviderModelConfig.modalities` suporta `input` / `output`, com enum público `text`, `image`, `video`, `audio`, `pdf`; o diálogo de edição de modelo oferece tipos de entrada Text/Image/Video e uma entrada fixa de tipo de saída Text.
- Documentos relacionados:
  - `docs/superpowers/specs/2026-06-04-model-provider-model-editor-design.md`
  - `docs/model-provider-client-config-remote-model-facts.md`
  - `docs/superpowers/plans/2026-06-24-model-media-capability-projection.md`
  - `docs/ssh-remote-app-global-state-authority.md`

## Objetivo

Adicionar interação de seleção de tipos dentro dos diálogos "Adicionar modelo" e "Editar configuração do modelo" nas configurações de provider do modelo, permitindo ao usuário declarar os tipos de entrada e saída suportados pelo modelo. A base continua sendo o campo `modalities` do schema do provider; os fatos de tipo salvos precisam entrar no provider registry existente e valer dentro dos limites de capacidade já suportados pelo runtime atual.

Esta funcionalidade não é apenas um campo de exibição. Quando o usuário desmarca explicitamente imagem ou PDF na entrada, a configuração precisa se distinguir da antiga "capacidade não declarada", evitando que a UI mostre text-only enquanto o runtime ainda passe mídia como capacidade desconhecida. O PDF usa o fato de capacidade de baixo nível já existente e ganha uma entrada de toggle própria na página de configurações.

## Não objetivos

- Não adicionar nesta funcionalidade de configuração envio, codificação ou conversão em provider request de anexos de áudio; a capacidade de anexo de vídeo vem da funcionalidade independente de entrada de vídeo.
- Não adicionar cadeia de renderização de saída de imagem, áudio ou vídeo.
- Não alterar o agrupamento de candidatos de modelo, a seleção do modelo atual, a recuperação de tasks nem a semântica de mobile replayable.
- Não fazer o `~/.zcode/v2` do workspace remoto se tornar a fonte autoritativa das configurações de modelo.
- Não afundar o provider registry ou o estado de capacidade no relay, no desktop main ou na fila do renderer.

## Fatos atuais e lacunas de design

`ModelProviderModelConfig.modalities` hoje é sempre normalizado para array; quando não configurado, o padrão é:

```json
{
  "input": ["text"],
  "output": ["text"]
}
```

Mas, para providers legacy/custom, esse padrão text-only não significa "não suporta explicitamente imagem". `convertModelProviderConfigToZCodeProviderInput` preserva o estado de capacidade de mídia desconhecida, evitando que um modelo vision de terceiros seja julgado incorretamente como text-only por causa do default histórico.

Portanto, os dois estados abaixo hoje são indistinguíveis na configuração em memória:

```text
配置旧没有 modalities ──归一化──> input=[text] ──> 能力未知，允许媒体透传
用户明确只选 text ─────归一化──> input=[text] ──> 期望明确不支持 image/pdf
```

Apenas adicionar UI e salvar o array produziria uma interação errada: depois de desmarcar image, o runtime ainda poderia continuar enviando image. O 3.9.0 precisa preservar em paralelo o fato de origem "as modalidades foram explicitamente configuradas pelo usuário".

## Semântica de produto já confirmada

### Interação de agrupamento

- O diálogo de modelo exibe a configuração do modelo nesta ordem:
  1. ID do modelo
  2. Habilitado
  3. Janela de contexto
  4. Token máximo de saída
  5. Tipo de entrada
  6. Tipo de saída
  7. Capacidade do modelo
  8. Reasoning, Mapping e MFJS Tool Schema
- Todas as configurações usam cartões de grupo sem título, sem entrada de collapse.
- Os rótulos de tipo de entrada, tipo de saída e capacidade do modelo usam espaçamento vertical unificado `mb-1` até a área de opções, para que o `space-y-3` do contêiner de grupo não amplie o espaço em branco abaixo do título de capacidade do modelo.
- O ID do modelo e "Habilitado" formam uma mesma linha de layout em duas colunas: o campo de ID ocupa toda a largura restante e "Habilitado" usa `w-24` como coluna de ação estável, com rótulo e Switch centralizados horizontalmente nessa coluna. Em tela estreita a linha continua a mesma, a coluna de ID pode encolher e o Switch não pode ser empurrado para fora do diálogo.
- Os itens da lista de modelos usam padding uniforme `px-3 py-2`; o item elevado durante o arraste não mostra linha divisória na parte de baixo e usa borda inferior transparente para preservar o tamanho original do placeholder, evitando tremor vertical durante o arraste.
- As ações do rodapé do diálogo de modelo reutilizam a hierarquia de `SettingsFormActions` da edição de Subagent: "Restaurar padrões" fica à esquerda; à direita, "Salvar" vem primeiro com `default + lg` e "Cancelar" vem depois com `ghost + lg`. Em tela estreita o empilhamento vertical é permitido, mas a relação de primário/secundário não pode mudar e nenhuma ação pode ser perdida.
- O feedback de sucesso ao salvar Provider e Modelo usa largura de linha inteira, raio `rounded-xl` e overlay neutro coerentes com o estado de Loading, sem fundo verde de bloco inteiro, borda verde ou texto verde; apenas o ícone de sucesso mantém o semântico `text-success`. O feedback de falha continua com o estilo destrutivo de alta visibilidade.
- O corpo do diálogo rola de forma independente, com Header e Footer fixos. O container de rolagem se estende até o respiro interno do diálogo à direita, mantendo um gutter independente entre os cartões e a overlay/native scrollbar; a barra de rolagem não pode ficar colada nem cobrir a borda direita dos cartões de grupo.
- Ao abrir "Adicionar modelo", apenas o ID do modelo fica vazio; os demais campos têm valores padrão visíveis:
  - Janela de contexto: `1000000`
  - Token máximo de saída: `128000`
  - Tipo de entrada: Text
  - Tipo de saída: Text
- A ordem fixa de exibição dos tipos de entrada é Text, Image, Video, PDF. Text vem marcado por padrão e não pode ser desmarcado; Image/Video/PDF podem ser alternados de forma independente; Audio ainda não aparece na página de configurações.
- O tipo de saída ainda não suporta outras opções: exibe apenas Text fixo e não operável, sem dropdown nem Popover.
- Abaixo das opções de tipo de entrada não há dica genérica de capacidade de anexos. Se Image/Video podem ser anexos na conversa é decidido em conjunto pela capacidade explícita do modelo e pela capacidade real de codificação do provider adapter atual; a página de configurações não repete uma conclusão global que pode estar defasada.
- As quatro opções de ícone do tipo de entrada são todas diretamente visíveis e permitem quebra de linha, sem dropdown nem Popover. Cada item reaproveita o casco `outline + lg` do Button compartilhado, com `h-8` (32px), `rounded-lg` e padding lateral `12px` (`px-3`) fixos; internamente usa ícone de modalidade `size-4` com texto, sem checkbox. O estado selecionado usa `bg-selected border-primary/20` e sobrescreve o corte padding-box do Button compartilhado com `background-clip: border-box`, para que a borda semitransparente realmente seja sobreposta ao fundo selecionado; o Hover apenas reforça para `border-border-hover`, o item selecionado continua com `bg-selected` no Hover e o estado não selecionado usa `bg-transparent border-border`. O Personal Overlay não sobrescreve a borda de estado das opções de modalidade. Text permanece selecionado e tem o clique bloqueado por `disabled` nativo, exibindo no fim da opção um ícone de cadeado enfraquecido para expressar que não pode ser desmarcado; as demais opções alternam por clique ou pela tecla Space.
- O tipo de saída usa a mesma estrutura "ícone + texto + ícone de cadeado", exibindo apenas Text fixo, selecionado e disabled.
- A capacidade do modelo usa opções em pílula "ícone + texto" coerentes com os tipos de entrada/saída, sem checkbox quadrado; tool calling, saída estruturada, busca nativa na web e mensagens de sistema na conversa usam os ícones Wrench, Layers, Search e MessageSquareText. O estado selecionado usa `bg-selected border-primary/20`, o não selecionado usa `bg-transparent border-border`, o Hover apenas reforça a borda para `border-border-hover` e o Hover de selecionado mantém `bg-selected`. O controle continua com `role="checkbox"` e `aria-checked`, garantindo que a interação por teclado e as tecnologias assistivas consigam ler o estado de seleção. O Personal Overlay não altera essas cores de estado.
- O texto estático do nível de raciocínio e o input de edição usam uniformemente a fonte de UI comum `text-ui-sm`, sem fonte monoespaçada. O input de edição estica conforme a largura do conteúdo e reaproveita o casco `h-7` do nível; ao entrar em modo de edição, tamanho de fonte, altura e largura não podem dar um salto. A nova entrada usa um botão de ícone Outline `size-7`, com a mesma altura do nível e borda quadrada compacta preservada.
- O schema de baixo nível, a leitura de configuração antiga e os fatos autoritativos remotos continuam compatíveis com Audio/PDF. Ao editar um modelo antigo, tipos não tocados não podem apagar valores ocultos; ao alternar os tipos visíveis, os valores de Audio existentes também são preservados, evitando perda silenciosa de dados pelo estreitamento da UI.
- Ao editar um modelo, o contexto salvo, o token máximo de saída e as modalidades de entrada são reexibidos; em modelos antigos sem token máximo de saída, exibe-se `128000`. A modalidade de saída fica fixa em Text conforme o limite de produto do 3.9.0.
- Após salvar com sucesso um modelo local editável, o output é unificado como `["text"]`; modelos catalog/autoritativos remotos somente leitura mantêm o fato de output original do servidor e não participam desta normalização.
- Quando a consulta ao catálogo encontra `maxOutputTokens` explícito, o valor `128000` só pode sobrescrever enquanto o usuário não tiver editado o campo manualmente; quando não há match, não há declaração, a consulta falha ou o resultado chega atrasado, o valor atual é preservado e não volta a ser vazio/sem default.
- A seleção de entrada Image/Video afeta a projeção de capacidade de mídia do runtime existente; o PDF presente em configuração antiga ou em fatos autoritativos continua participando da projeção existente.
- A entrada de vídeo é salva como fato de provider do modelo e participa da validação de anexo de conversa pela projeção de capacidade `supportsVideo` já existente; um provider adapter sem suporte a codificação de vídeo ainda rejeita ou degrada em runtime, e não pode ser contornado apenas por marcar a caixa na página de configurações.
- Pacotes integrados/autoritativos remotos somente leitura continuam exibindo os fatos do servidor, sem edição local, evitando que a configuração do usuário e a sincronização remota posterior sobrescrevam uma à outra.

### Origem explícita

Recomenda-se adicionar a `ModelProviderModelConfig` um campo de origem opcional, por exemplo:

```ts
modalitiesConfigured?: boolean;
```

Semântica:

- `true`: o usuário ou o catalog autoritativo forneceu explicitamente os fatos de modalidade; a ausência de image/pdf em input pode ser projetada como `false` explícito.
- `undefined`: configurações custom/legacy não têm fatos de modalidade confiáveis; mesmo com array normalizado text-only, o estado de capacidade de mídia continua desconhecido.
- Modelos backed por catálogo/autoritativos remotos não dependem da marcação do usuário e continuam projetados pelas regras de fonte autoritativa existentes.

O campo precisa ser salvo pela extensão `zcode`, para não poluir o campo público do OpenCode; o `modalities` de nível superior continua guardando os arrays reais de input/output. A nomeação pode ser ajustada antes da implementação, mas precisa preservar a mesma distinção de origem, sem reutilizar o `modified` grosseiro: quando o usuário muda apenas a context window, ele não pode ser julgado como text-only explícito.

O rascunho precisa rastrear separadamente se as modalidades foram tocadas pelo usuário. Depois de abrir um modelo antigo e alterar apenas a context window, `modalitiesConfigured=true` não pode ser gravado automaticamente; o campo só recebe origem explícita quando o usuário altera as modalidades ou confirma ativamente a seleção de modalidades ao adicionar um modelo.

### Identificador de capacidade visual

- Quando `modalities.input` da configuração do modelo contém qualquer tipo diferente de `text`, a UI marca o modelo como modelo visual. Essa decisão consome apenas os tipos de entrada já declarados pelo modelo e não depende de `modalitiesConfigured`, do tipo de saída, do provider adapter ou da capacidade de codificação de anexos.
- O texto do identificador acompanha o idioma do sistema: em chinês “视觉”, em inglês “Vision”; o nome acessível e o título de hover reaproveitam o mesmo texto internacionalizado.
- O identificador aparece em dois pontos de entrada compartilhados:
  1. No menu de seleção de modelos, logo após o nome completo do modelo, na área de conteúdo à esquerda; o check de seleção continua fixo no fim da linha.
  2. Na linha compacta de modelo das configurações de modelo, exibido lado a lado com o badge de capacidade da janela de contexto; da esquerda para a direita, a ordem fixa é “视觉 / Vision”, capacidade da janela de contexto, e o badge de capacidade permanece na extremidade direita.
- Os dois lugares reutilizam o mesmo `rounded-md`, borda/cores de superfície semânticas e estilo de fonte compacta; a janela de contexto continua em fonte monoespaçada e o texto de visão usa a fonte de UI comum.
- O identificador visual nos dois lugares precisa reutilizar a mesma chave de internacionalização; no ambiente em inglês ambos exibem exatamente `Vision`, sem recair para o chinês nem usar nomes em inglês diferentes em algum dos pontos de entrada.
- O ID do modelo é uma string opaca. IDs como `openrouter/ox-alpha` ou `openrouter/nvidia/model`, que contêm um ou mais `/`, precisam ser exibidos, codificados e selecionados tal e qual, sem serem divididos por `/` nem comparados ao contrário para a projeção do identificador.
- O identificador apenas descreve o fato dos tipos de entrada na configuração do modelo; não cria nova entrada de anexo, não contorna o capability guard do runtime e não altera o valor de seleção do modelo, o provider registry, os parâmetros de request nem o formato de persistência.

## Estado e cadeia de sincronização

```text
模型设置弹窗
  local draft
  ├─ inputModalities
  ├─ outputModalities=[text]
  └─ modalitiesTouched
          |
          | 保存 + 校验
          v
本地 modelProviderService（唯一权威）
  ~/.zcode/v2/config.json
  ├─ model.modalities.input/output
  └─ model.zcode.modalitiesConfigured
          |
          | provider registry revision
          +-------------------------------+
          |                               |
          v                               v
桌面本地 runtime                    desktop-attached 远端 runtime
workspace/updateProviderRegistry     本地快照显式下发，不写远端配置
          |                               |
          +---------------+---------------+
                          v
协议模型能力投影
  catalog-backed 或 modalitiesConfigured=true
    ├─ input 包含 image -> supportsImages=true
    ├─ input 不含 image -> supportsImages=false
    ├─ input 包含 pdf   -> supportsPdf=true
    ├─ input 不含 pdf   -> supportsPdf=false
    ├─ input 包含 video -> supportsVideo=true
    └─ input 不含 video -> supportsVideo=false

  legacy custom 且未显式配置
    └─ 不下发 supportsImages/supportsPdf/supportsVideo，保持 unknown
                          |
                          v
当前 session 热更新 modelInputMediaCapabilities
                          |
                          v
provider-visible request 媒体保留或文本化
```

### Fronteira do cliente

- Desktop local e remote desktop-attached usam a mesma semântica de revision do provider registry.
- O workspace remoto precisa continuar isolando o estado de sincronização por `workspaceIdentity?.trim() || workspacePath` e carregar `remoteSessionId`; `workspacePath` é usado apenas para execução e exibição.
- O `/remote` do celular continua se anexando ao host já existente no desktop; não há runtime novo e as configurações de modalidade não são gravadas no snapshot replayable.
- Esta funcionalidade não modifica `clientMode` / `deliveryKind`, e casos de regressão precisam provar que tanto o desktop continuous quanto o web remote replayable seguem inalterados.

## Matriz de superfícies de UI

| Cenário           | Entrada de UI                                                  | Owner do rascunho                  | Default/reexibição                                     | Validação                                   | commit sink         | Ponto de chegada autoritativo | Limite                                |
| -------------- | -------------------------------------------------------- | --------------------------- | --------------------------------------------- | -------------------------------------- | ------------------- | -------------------- | ----------------------------------- |
| Adicionar modelo customizado | `ProviderModelsSection` -> `ProviderModelMetadataDialog` | estado de rascunho de adição | context=1M, maxOutput=128K, input/output=Text | ID obrigatório, números inteiros positivos, input Text travado | `onAddModel`        | config de provider local | novo modelo salva os tipos explicitamente |
| Editar modelo customizado | `ModelRowInput` -> `ProviderModelMetadataDialog`         | estado de rascunho da linha             | input salvo + output Text fixo               | input Text não pode ser desmarcado                    | `onModelCommit`     | config de provider local | input modalities não tocadas não podem mudar a semântica unknown |
| Modelos integrados/pacote   | linha somente leitura nas settings do provider                          | sem rascunho editável                | fatos de catalog/remote                          | schema do servidor                          | não submetido              | cache de sincronização autoritativo local | não permite sobrescrita local do fato autoritativo              |
| Runtime de modelo na conversa | sem nova UI                                                | config de runtime da session atual | projeção do provider registry                  | capability guard existente              | hot update do registry | memória do Agent runtime | consome input image/pdf/video          |

O seletor de modelos compartilhado, automações, Subagents e Repo Wiki apenas leem os candidatos do provider registry e exibem o identificador “视觉 / Vision” quando o modelo candidato declara qualquer tipo de input diferente de Text. Nada muda nesta versão em seus rascunhos, defaults ou commit sinks; é preciso fazer regressão de isolamento entre candidatos e defaults, mas sem nova entrada de edição de modalidades.

## Regras de dados e validação

- `ProviderModelDraftValues` ganha o array de modalidades de input e `modalitiesTouched` (ou estado local equivalente); o output é fixado como `["text"]` na submissão de modelos editáveis.
- As modalidades são salvas deduplicadas na ordem fixa do enum público, e enums desconhecidos fora da UI não são aceitos.
- O input precisa conter Text, a UI não oferece caminho para desmarcar e o commit resolver ainda faz a validação defensiva.
- A janela de contexto e o token máximo de saída precisam ser inteiros positivos; o token máximo de saída não pode mais ficar vazio.
- Cancelar o diálogo descarta o rascunho de modalidades e não modifica o provider registry.
- A mudança de modalidade é submetida atomicamente junto com ID, API format, context window e max output tokens já existentes.
- Ao editar outros metadados, é preciso preservar as input modalities existentes e a origem explícita; o output é normalizado para Text fixo conforme o limite já confirmado.
- Video só pode ser mapeado para `supportsVideo`; Audio/o tipo de saída não podem ser mapeados incorretamente para `supportsImages` / `supportsPdf` / `supportsVideo`.
- Não se adiciona campo novo ao ZCode Protocol; o protocolo atual já tem `supportsImages`, `supportsPdf` e `supportsVideo` opcionais. Para o Audio passar a valer de imediato, seria preciso antes estender o schema do protocolo e a capacidade do runtime, e esse requisito está fora deste spec.

## Invariantes obrigatórias

- O estado de capacidade de mídia desconhecida de um modelo legacy custom não vira false explícito por causa de upgrade ou da edição de outro campo.
- Depois de o usuário desmarcar Image explicitamente, a session correspondente recebe a atualização de capacidade sem precisar reiniciar ou reselecionar o modelo; o fato oculto de PDF não pode se perder ao editar outro tipo visível.
- As settings do provider são a única entrada de edição; a barra de ferramentas da conversa, automações, Subagents e Repo Wiki não recebem nova permissão de commit de modalidades.
- Workspaces local e remoto usam o mesmo fato de autoridade app-global local do provider.
- Tema, internacionalização, operação por teclado e layout de tela pequena do Web no celular funcionam; as opções de tipo de entrada permitem quebra de linha e a UI usa `text-ui-*` e tokens de cor semânticos.
- O identificador visual não pode ocupar a posição do check de seleção no fim da linha do modelo; IDs de modelo longos (inclusive com múltiplos `/`) continuam participando da seleção como valor completo e apenas o texto visível pode ser truncado pelo layout existente.
- A atualização de configurações não altera mensagens de task, fila, snapshot, owner/lease nem semântica de delivery.

## Limites já decididos

- Todos os campos são agrupados em cartões sem título, sem introduzir níveis extras.
- Ao adicionar um modelo, tudo tem default exceto o ID: 1M de contexto, 128K de output máximo, input/output Text.
- O input Text é travado, Image/Video/PDF são opcionais de forma independente; Audio ainda não é exibido, mas a compatibilidade de dados é mantida.
- O output suporta apenas Text fixo, sem outras opções.
- Qualquer tipo de input diferente de Text dispara a exibição de “视觉 / Vision”; modelos text-only e modelos legacy em string sem fatos estruturados de modalidade não exibem o identificador.
- Modelos de catálogo autoritativo continuam com o limite existente de somente leitura/authoritative, sem abertura para sobrescrita local.

O feature graph já complements a relação `capability.model-capabilities` com a projeção do identificador visual para candidatos de modelo compartilhados e provider settings; a relação explícita `surface.provider-settings -> capability.provider-registry` de origem de modalidades permanece inalterada.

## Evidências de aceitação

- Testes unitários de UI: adicionar/editar, defaults, reexibição, múltipla seleção, teclado, cancelamento, validação, i18n.
- Testes unitários de exibição: decisão entre text-only e qualquer tipo de input diferente de Text, layout do badge à esquerda e do check no fim da linha no menu de modelos, badge de capacidade lado a lado na linha de settings, textos em chinês e inglês, round-trip de ID de modelo com múltiplos `/`.
- Testes unitários de rascunho: ordenação e deduplicação, submissão atômica, preservação de campos não modificados, modelo antigo com modalidades não tocadas mantendo unknown.
- Testes unitários de shared/services: schema, leitura e escrita do config OpenCode, round-trip da marcação de origem `zcode`, migração legacy.
- Testes unitários de protocol/bootstrap: projeção positiva e negativa de image/pdf/video, hot update de session ativa, preservação do estado desconhecido.
- E2E de desktop: salvamento na página real de configurações, gravação em disco do config, revision do provider registry, provider request final.
- E2E/integração remota: snapshot local do provider pushed ao runtime remoto, config de arquivo remoto não se tornando fonte autoritativa.
- Regressão: seleção de modelo, automações, Subagents, Repo Wiki, desktop continuous e mobile replayable sem efeitos colaterais.