# API de ZCode Client Scenes

## Objetivo

A camada de serviço do App registra a API de ZCode Client Scenes, para que os consumidores de cenas possam ler a configuração de cenas do servidor pela saída de requisição unificada
`ApiClient`, evitando que o código de negócio faça hardcode de domínios de teste ou contorne a injeção de parâmetros comuns do ZCode.

## Contrato da requisição

- Método: `GET`
- Caminho: `/api/v1/client/scenes`
- Exemplo de ambiente de teste: `https://zcode.z.ai/api/v1/client/scenes`
- A URL deve ser construída por `buildRuntimeZCodeApiUrl(process.env, path)`, para que produção, teste e
  o override de endpoint em runtime continuem seguindo as regras existentes de troca de ambiente.
- O chamador deve usar o `ApiClient` injetado para disparar a requisição. O `NodeApiClient` injeta uniformemente os parâmetros comuns de origem, o identificador de dispositivo e o request id quando a requisição atinge o endpoint ZCode atual; o chamador não deve reescrever à mão esses
  headers.
- Esta API não exige novos query params nem header de Authorization.

## Limites da resposta

A resposta de sucesso da API usa `ClientSceneResponseBody<ClientSceneConfig[]>`: `{ code, msg, data }`.
`data` é o array de cenas enviado dinamicamente pelo servidor e pode estar vazio. A camada de Service não interpreta scenes específicas; cada consumidor de UI
apenas casa as scenes e option keys que declarou, e configurações desconhecidas devem ser ignoradas.

- `ClientSceneConfig`: `namespace`, `scene`, `options`; `created_at` / `updated_at` são opcionais.
- `ClientSceneOption`: `contents` de i18n; `prompts`, `items`, `templates` e o `refer` / `cascades` de filtro em cascata são opcionais conforme a scene.
- `ClientSceneItem`: `contents` / `labels` de i18n; `descs`, evento de conclusão, nome de ícone Lucide, os `imgs` mantidos por compatibilidade e o link de compartilhamento são opcionais conforme a scene.
- `on_finish` e `img` podem estar ausentes ou ser `null`; `imgs` e, dentro dele, `cn` / `en` são todos campos opcionais.

## Escopo

A camada de serviço do App expõe a consulta somente-leitura por meio de um `clientScenesService.list()` independente; internamente o serviço usa o `ApiClient` unificado, e a UI não chama `fetch` diretamente nem toca em constantes de endpoint do Host.

Vários consumidores React do Renderer leem o mesmo `ClientSceneConfig[]` bruto através do `useClientScenesResource()` compartilhado. Esse recurso usa o cache em memória do renderer do SWR, tendo a instância de `IClientScenesService` injetada atualmente como fronteira de isolamento de authority: montagens concorrentes da mesma instância de Service emitem apenas um
`list()`, e após a troca do attachment de Service/Host passa-se a usar uma nova cache key, sem reutilizar o resultado da authority anterior.
O cache não é gravado em localStorage, automação, off-peak ou persistência de sessão.

A configuração de templates é dado de atualização de baixa frequência. Resultados bem-sucedidos são reutilizados diretamente dentro de uma janela de dedupe de 10 minutos; não há polling, e ao regaindo o foco da janela ou da rede o SWR pode revalidar fora da janela. Na cold start sem cache o consumidor entra em loading; com cache já existente, exibe imediatamente os dados
last-known-good e revalida em segundo plano quando necessário, sem voltar ao esqueleto. Erro de rede ou `code !== 0` são considerados falha desta revalidação:
o cache existente é mantido; somente a falha na cold start degrada para um catálogo vazio, e ela não pode bloquear a entrada de criação manual do Composer ou de tasks.

No Desktop macOS, ao clicar no botão de fechar a janela principal é ocultada em vez de destruída, e o renderer e seu cache em memória continuam vivos. A camada de recurso compartilhada
precisa observar o Page Visibility: somente quando ocorre de fato `hidden -> visible` o cache da Scene atual é marcado como inválido e, por Service authority + SWR cache authority, combinado em uma única
revalidação forçada; um focus comum sem ocultação continua usando o throttle de 10 minutos.
A revalidação forçada ignora a janela de dedupe, mas durante a requisição os dados last-known-good continuam sendo exibidos e a falha também não esvazia o catálogo existente. Abas Web e navegadores de celular retomando do
fundo usam a mesma semântica; apenas receber visible pela primeira vez, hidden repetido ou visible repetido não podem gerar requisições extras.

`ConversationDraftSuggestedPromptsContainer` chama `clientScenesService.list()` depois que a RPC do workspace atual está pronta e mapeia `options.prompts.items` das cenas com `scene === "draft-suggestion"` como prompts sugeridos;
o antigo `ai-writing` deixa de ser o fallback dessa entrada.
Os detalhes de mapeamento e os limites de falha estão em `docs/ui/conversation-draft-suggested-prompts.md`.

`AutomationsSection` e `OffPeakNewTaskEntry` também consomem duas scenes explícitas:

- `scheduled-task`: os `labels` do prompt item são o título e os `contents` são description/instructions;
  `defaults.cronExpr` referência inversamente `options.cronExpr.items`, e o cron usa apenas os `contents` do item referenciado;
  a UI primeiro valida a legalidade do Service e a capacidade de round-trip sem perdas do editor de Automations, depois exibe com o descritor de agendamento local, ignorando os `labels` do cron item.
- `off-peak-task`: os `labels` do prompt item são o título; apenas a description do card da página inicial New task prioriza `descs` por locale,
  com fallback para `contents` quando o idioma correspondente estiver ausente ou em branco; a description dos cards de Automations e as instructions de criação de rascunho sempre usam `contents`;
  Automations exibe apenas o catálogo remoto e mostra «无可用模板» quando o catálogo está vazio; a página inicial New task acrescenta o Customize local após o mapeamento remoto e não o duplica se o catálogo remoto já contiver Customize.
  O título e a descrição estáveis do Customize passam apenas por intl na renderização, via `offPeak.newTask.template.customize.title` /
  `.description`, e o mapeamento do catálogo não guarda mais uma segunda cópia dos textos cn/en.

Nas scenes `draft-suggestion`, `scheduled-task` e `off-peak-task`, o prompt item interpreta `img` como um nome canônico Lucide
(kebab-case, por exemplo `file-text`) e não deve mais tratá-lo como URL de imagem a ser requisitada. A página inicial e o painel de Automations carregam o SVG dinamicamente pelo nome, e o ícone usa `currentColor`
herdando a cor semântica do slot de ícone onde está; quando `img` está ausente, em branco, o nome não pertence à versão atual do Lucide ou o módulo falha ao carregar, é obrigatório voltar ao ícone semântico Lucide local já existente em cada entrada. `imgs` não participa da escolha de ícone dessas
entradas.

```text
ClientSceneItem.img
  -> trim + Lucide canonical name allowlist
     -> known name ----> dynamic Lucide SVG ----> currentColor
     -> missing/unknown/load failure ----------> surface-local Lucide fallback
```

Prompt items com `labels.cn` / `labels.en` ambos vazios em qualquer uma das duas scenes devem ser rejeitados e não podem entrar em cards nem em formulários de criação.

Ambas oferecem apenas templates candidatos. O clique apenas copia a string simples do locale atual para o rascunho do formulário; os metadados de scene/item/default não entram na persistência de automation nem de off-peak. Falha na requisição não pode bloquear a criação manual.

```text
React consumer mount / workspace attachment change
  -> useClientScenesResource(service authority)
     -> cache hit --------------------------> retorna imediatamente as scenes last-known-good
     -> cold miss -> SWR dedupe -> clientScenesService.list()
                                  -> Host ApiClient + parâmetros comuns do ZCode
                                  -> GET /api/v1/client/scenes
  <- success: atualiza o cache de memória compartilhado -> cada consumidor mapeia sua própria scene
  <- failure: cache quente mantém o valor antigo; cache frio retorna catálogo vazio
  -> Service authority trocada: resultado tardio da key antiga não pode entrar na nova key
```

Esta alteração não muda as cadeias de session, stream ou workspace estado do controle remoto Desktop/Web/celular. O workspace local do desktop e o remote workspace anexado ao desktop usam o serviço de scenes app-global do Host do desktop; o remote do servidor usa o serviço autoritativo do servidor.