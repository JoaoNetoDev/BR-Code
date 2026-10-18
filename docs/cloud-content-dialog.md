# Diálogo de conteúdo público e recursos Hero

Data de atualização: 2026-09-10. Escopo: componente público do cliente e recursos Hero; a integração de exibição em produção e a semântica de Banner estão em [marketing-touch-client.md](marketing-touch-client.md), sem incluir o console de operações.

## Implementação atual

A apresentação de Banner suporta a mensagem visual do host `{channel:"zcode-cloud-hero-v1",type:"hover",instanceId,hovered:boolean}`, enviada somente após o ready, e false quando há redução de efeitos dinâmicos. Não é uma action de negócio; o iframe continua não focável, não recebe ponteiros nativos e ignora actions contidas no pacote. O Hero do diálogo não recebe essa ponte e continua usando interação nativa. Veja a especificação da ponte de hover de Banner do Marketing Touch.

O botão de fechar usa uma paleta de sobreposição de mídia independente do tema Hero/App: fundo preto com 50% de opacidade, X branco, sem borda; no hover o fundo escurece para preto a 65%. Mantém o formato circular, o tamanho original e os caminhos de foco/fechamento/relato, sem novos campos no servidor e sem modificar Banner ou o Dialog global.

- `CloudContentDialog` é o shell de exibição público, consumindo title, description, hero, buttons, actions. É compartilhado pelo Popup independente do Marketing Touch e pelo diálogo de resultado de sucesso.
- O App não oferece mais entrada temporária de Mock nem RPC de downlink; o servidor de testes fornece de forma independente payloads válidos e fixtures de ZIP.
- O host local do Desktop faz download, verificação, extração segura e cache, servindo os recursos por uma URL de loopback com lease aleatório, mantendo o iframe com `sandbox="allow-scripts"`.
- image/video/lottie/interactive_bundle já foram implementados. O Lottie usa um canvas light fixo da versão 5.13.0, carregado sob demanda.
- O canto inferior esquerdo do App agora é integrado ao Marketing Touch; o diálogo de sucesso usa o `success_popup` da exibição e o ZIP do Hero vem da URL/hash concedido pelo servidor. O adapter antigo de Weekend Banner/diálogo de resultado foi removido e a fixture de construção do Hero permanece apenas em test/helpers, sem entrar no App.
- `mocks/weekendPlanResultDialog.zh-CN.json` é um **modelo de conteúdo**, sem metadados de bundle; só se torna uma resposta HTTP válida depois que o mock server injeta os campos reais do ZIP.

## Uso e verificação

O App usa o downlink GET do Marketing Touch, não existe mais o botão de «Mock de conteúdo» e `CLOUD_CONTENT_MOCK_ORIGIN` não é lido. O CloudContentService cuida apenas de readPublishedMedia / prepare / release de recursos já autorizados e não expõe mais RPCs de debug status / load / clear.

Os recursos ZIP do Hero e o HTML de origem são mantidos agora por um workspace de produção independente; o diretório antigo de recursos no repositório do App foi arquivado e removido; a localização e os comandos de verificação estão em [Migração da produção de recursos](weekend-banner-resource-bundle.md#2026-09-12-制作工作区迁移). O servidor de testes automatizado `packages/desktop/scripts/cloud-content-mock.mjs` e suas fixtures são mantidos, acionados apenas por testes ou execução isolada, sem entrar na cadeia de inicialização do App.

Testes de fixture de interface: `node --test packages/desktop/scripts/cloud-content-mock.test.mjs`. A verificação no App usa `marketing-touch-delivery.test.ts`, que também afirma que a entrada antiga não existe e que o fluxo de ZIP autorizado/relato funciona. Os testes de UI e E2E exclusivos do painel de pré-visualização antigo foram aposentados; o código histórico pode ser restaurado pelo Git.

## Contrato de campos v1

A definição autoritativa é o Zod schema em `packages/shared/src/cloudContent.ts`; os tipos de UI são derivados dele, sem manter um segundo conjunto de tipos de wire.

| Campo                      | Consumidor e restrição                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| schemaVersion              | Deve ser 1                                                                   |
| id / revision              | ID de conteúdo não vazio (até 128 caracteres) / versão inteira positiva; isola o estado assíncrono da instância do Dialog |
| kind / locale              | campaign, feature, notice / zh-CN, en-US; não injeta lógica de campanha pelo kind |
| dialog.title               | Texto puro, 1–500 caracteres                                                  |
| dialog.description         | format, text; texto com no máximo 20.000 caracteres                            |
| dialog.hero                | União de quatro tipos, veja a tabela abaixo                                   |
| dialog.buttons             | No máximo 4, IDs únicos; label com no máximo 200 caracteres; variant é primary/secondary/link |
| button.actionId / actions  | As referências devem existir; actions com no máximo 16 itens; apenas handlers do host registrados podem executar |

| Tipo do Hero        | Campos                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| image               | src, darkSrc?, alt, fit?                                                                        |
| video               | src, darkSrc?, poster, autoplay?, loop?, muted:true, fit?                                       |
| lottie              | src、darkSrc?、autoplay?、loop?、speed? (0.1–4), fallback?                                     |
| interactive_bundle  | runtime:zcode-hero-sandbox-v1, bundle, viewport:{aspectRatio:"4:3"}, data, events, fallback?     |

O bundle deve conter `format:"zip"`, `url`, `entry`, `sha256` (64 caracteres hexadecimais minúsculos); `sizeBytes` é opcional e, quando fornecido, deve ser um inteiro positivo e corresponder ao tamanho real. O Marketing Touch do servidor não tem campo de tamanho, mas o limite real de bytes para download e extração continua sendo aplicado. O mock HTTP usa metadados calculados de verdade, e não pode passar na verificação com hash de placeholder.

`resolvedUrl` **não é um campo da nuvem**; o schema compartilhado o remove; ele só é definido quando o prepare do host tem sucesso ou por um adapter de recurso confiável embutido no App. Um Hero interativo sem resolvedUrl mostra apenas fallback/placeholder e nunca carrega diretamente bundle.url.

data é um objeto JSON sem credenciais, serializado com no máximo 64.000 caracteres; events é um mapa de eventos de exibição com no máximo 16 itens. URLs só podem ser HTTP(S) absolutos sem usuário/senha; origens de desenvolvimento podem usar HTTP de loopback, mas recursos de produção precisam corresponder à URL/hash verificados e concedidos pelo host.

### Descrição

- `plain_text`: exibido como texto puro.
- `html`: HTML simples; suporta p/br/b/strong/i/em/u/s/ul/ol/li/code/a/span/time, além de h1–h6/blockquote/pre/hr/del/table/thead/tbody/tr/th/td.
- `markdown`: suporta parágrafos, títulos, ênfases, listas, citações, código, links e tabelas, formatados por um renderizador seguro compartilhado; HTML embutido é exibido como texto.
- `formattedTitle` / `formattedLabel` adaptados ao Marketing (apenas campos de UI) mantêm format/text e suportam os mesmos três formatos da description. Títulos/botões convertem nós de bloco em span e links não geram interação; as chamadas antigas com title/label string continuam compatíveis.
- class é preservada e mesclada com as classes Tailwind padrão, valendo apenas classes já compiladas; style é filtrado pelas regras de atributo/valor de cloudDescriptionStyle. Rejeita id, atributos de evento, imagens, script, iframe, formulários e SVG. Elementos não suportados e suas subárvores são descartados.
- O template inert, após o parse, é reconstruído com a allowlist de nós do React; o DOM remoto não é inserido diretamente na página visível. Profundidade máxima de 32, excedendo isso há fallback para texto puro.
- Links mantêm apenas href/title HTTP(S) e são abertos pelo handler open_external do host; sem essa capacidade, degradam para texto.
- A formatação padrão usa o tema do cliente; class/style permitidos podem sobrescrever. Os benefícios dinâmicos e o tempo de Weekend são escapados antes de compor o HTML.

### Ações

close fecha a instância atual; dismiss_content é entregue ao handler injetado e, em caso de sucesso, fecha — a limitação de frequência para conta oficial/revision ainda não foi implementada. navigate aceita apenas model_settings/plugin_store/settings; copy_text, open_external e claim_plan exigem capacidades injetadas pelo host, e o componente público não acessa diretamente a plataforma nem serviços de negócio.

Os botões são exibidos na ordem do payload; ficam desabilitados sem handler; há single-flight por instância; há feedback de falha e possibility de retry, e o fechamento está sempre disponível. Após copiar com sucesso, mostra o label localizado pelo host sem modificar o payload. Ao fechar e reabrir, Promises antigas não podem afetar a nova instância. Um diálogo controlado restaura o foco na origem que estava na página quando foi fechado.

## Arquitetura e sequência

```text
App -> Marketing Touch GET -> DTO/schema -> 授权 URL/hash
  -> prepare(bundle) -> 下载 -> SHA-256 -> 安全解压 -> host cache
  -> lease scoped URL -> 公共 Dialog -> sandbox iframe -> init -> ready
                              | 标题 / HTML / 按钮          | 展示交互
                              v                           v
                         注入宿主 handler             iframe 内部 DOM

关闭 -> 失效本实例请求 -> destroy/remove iframe -> release lease
旧请求迟到 -> 释放其 lease，不重新打开弹窗
宿主退出 -> 取消下载 -> 关闭资源 HTTP -> 释放 lease -> 删除自有缓存目录
```

O Main não assume o negócio de download/extração de recursos. O serviço é injetado via ServiceCollection/RPC e a UI acessa por hooks. Os recursos não têm relação com workspace/task, não vão para o diretório do projeto, não passam um workspace remoto e não criam um Agent.

### Cache e URL de recursos

Diretórios reais do Desktop:

```text
<ZCode data base>/.zcode/v2/cache/content-bundles/<host-instance-uuid>/
  staging/<unique-attempt>/
  <sha256>/index.html
  <sha256>/.bundle.json
```

O data base normal do usuário é o diretório do usuário; o E2E usa o diretório isolado do runner. Cada host tem a raiz exclusiva e o reabertura no mesmo host reutiliza; hosts diferentes não compartilham leases em memória. **O cache não promete reuso entre reinícios do App.** Uma saída normal remove o próprio diretório, e resíduos de crash não são limpos arbitrariamente por outros hosts ativos.

- ZIP de no máximo 8 MiB, extração de no máximo 32 MiB, arquivo único de no máximo 8 MiB, 128 entradas, orçamento de cache de 128 MiB.
- Download de no máximo 30 segundos, até 3 redirecionamentos, verificação de origem a cada salto; a contagem real de bytes precisa corresponder à declarada.
- Rejeita caminhos absolutos, path traversal, barras invertidas, nomes reservados do Windows, symlinks, caminhos duplicados/conflitos de caixa, manifest de cache embutido no pacote.
- Staging separado e promoção atômica após a verificação completa; em caso de acerto no cache, o manifest e os resumos dos arquivos são verificados novamente.
- acquire/read/release/clear são coordenados em série dentro do serviço; a limpeza pula leases ativos; após a liberação, a limpeza segue o orçamento/LRU.
- O HTTP escuta apenas uma porta aleatória em 127.0.0.1, os caminhos começam com um lease imprevisível e apenas arquivos listados no manifest são servidos. Após o release, a URL original retorna 404.
- A CSP proíbe connect/frame/object/form e scripts só podem rodar em um sandbox sem same-origin; a resposta traz MIME correto, nosniff/no-referrer/no-store.
- yauzl é mantido como dependência externa de execução do Desktop, evitando o require("fs") CommonJS inline no ESM, que causaria falha na inicialização; a verificação do pacote inclui esse módulo.

### Ciclo de vida e isolamento do Hero

Área do Hero fixa em 4:3, limite de 480px para o diálogo, adaptação a telas estreitas e rolagem vertical. Vídeo com muted/playsInline, pausado quando oculto/com reduced-motion/fechado; Lottie é destruído ao fechar, com JSON de no máximo 2 MiB, 50.000 nós, 40 níveis, proibindo imagens, fontes e expressões externas.

Os recursos interativos preservam céu estrelado, ingresso, entrada, pressão ociosa, inclinação do ponteiro, clique para virar e Replay. Após o load é enviado o init (instanceId/theme/locale/reducedMotion/data); sem ready em 5 segundos há fallback. As mensagens só aceitam o contentWindow atual + instanceId + channel; eventos de exibição desconhecidos são descartados. Eventos de exibição do iframe não se conectam ao dispatcher de actions de negócio.

O ícone de benefício usa o SVG Lucide Gift fornecido pelo usuário (três paths e um rect), sem mais usar o caractere ◇. O SVG é inline no template de recurso e clonado por linha de benefício; 12×12px, stroke=currentColor, reutilizando a cor de tema ticket-accent, aria-hidden=true; o texto continua usando textContent e não executa strings remotas como SVG/HTML.

Artefato histórico da versão Gift: no arquivo, `marketing-touch-weekend-v3/weekend-plan-hero-v3.zip`, 7041 bytes, SHA-256 `6cfaae6807b181c3c38eb1be1f3f8a348a2eb67e940495f864b35e3ccf8067c0`. Os exemplos de downlink e os antigos v1/v2 no mesmo diretório também ficam no arquivo do workspace de produção de recursos, ainda precisam ser substituídos por URL/hash ou asset_id após o upload; não é a saída do build atual.

Verificação do Gift: as novas asserções de caminho do SVG falhavam antes da modificação; após ela, 10 testes unitários relacionados e 5 E2E do App no macOS passaram. As asserções de visibilidade aguardam a conclusão da entrada, evitando confundir a frente temporariamente oculta durante a virada com ícone ausente; foram mantidas as regressões de virada nos dois temas, replay e relato. Tipos/tipos de E2E/arquitetura passaram, Lint com 0 erros/46 avisos já existentes e nenhuma validação em máquinas reais de outras plataformas.

Correção das animações do Hero de Weekend: o JS do pacote é o único owner do estado de animação. Quando a entrada termina ou é interrompida por um clique, is-entering é limpo; o painel nativo do eixo Y só fica oculto durante a entrada e nunca deve ficar permanentemente com visibility:hidden; frente, verso nativo e painel de entrada reutilizam o mesmo fundo e a máscara de recorte do ingresso. O replay cancela primeiro a animação e a pressão da rodada anterior e só então inicia nova entrada; replays rápidos repetidos não acumulam animações. Quando oculto/com efeitos reduzidos, o RAF ocioso não é agendado e é retomado ao voltar a ficar visível; destroy cancela as animações e as mensagens de recurso só aceitam o parent.

```text
init/replay -> 取消旧动画 -> entering -> animationend -> idle
entering/idle -> 点击 -> 清理入场状态 -> rotateY（同色背板） -> idle
visibility=false/reducedMotion -> 停止RAF；destroy -> 停止全部动画
```

Este ciclo não redesenha o céu estrelado nem altera a interface de marketing. Continua compatível com o protocolo existente init/data/theme e o mapeamento de dados de exibição de pacotes do App é mantido temporariamente; não se afirma equivalência pixel a pixel com o Hero React original. A saída é um novo ZIP de diretório com metadados correspondentes, mantendo o pacote antigo; depois que o novo pacote for enviado, a nova URL/hash deve ser sincronizada. A verificação inclui o quadro intermediário de 180° para esquerda/direita após a entrada, o painel de verso nos dois temas, o replay e a cadeia de diálogo de sucesso/relato do App.

Verificação (2026-09-10): 4 testes unitários de ciclo de vida dos recursos antigos falharam e os testes do App reproduziram o estado de entrada não finalizado; após a correção, 9 testes unitários relacionados, 2 testes de fixture HTTP e 5 E2E do App no macOS passaram. Nos temas claro/escuro, os quadros intermediários de 180° para esquerda/direita mostram um painel de verso visível da mesma cor, com máscara consistente entre frente e verso. Tipos, tipos de E2E e arquitetura passaram, Lint com 0 erros/46 avisos já existentes. Não houve validação em máquinas reais Windows/Linux/celular nem aceitação manual pixel a pixel; o E2E permanece como pending.

Artefato histórico: no arquivo, `marketing-touch-weekend-v2/weekend-plan-hero-v2.zip`, 6707 bytes, SHA-256 `db3acb08ba1aae3f74e8735774217a5c8c295ecb34b9268b53f9a48b25ca2712`. O index.html legível, os metadados e os exemplos de downlink no mesmo diretório, bem como o pacote antigo `marketing-touch-weekend`, permanecem no arquivo do workspace de produção de recursos; o código-fonte dentro do ZIP é igual ao código da época e não representa mais o fonte mais recente. A URL de CDN de exemplo, plan_id e asset_id ainda precisam ser preenchidos após o upload e não indicam implantação.

Falhas na obtenção/verificação do JSON de exibição seguem a política de falha do Marketing Touch; quando a preparação do recurso falha, o título/descrição/botões já verificados continuam sendo exibidos. Erros em tempo de execução degradam o Hero e não bloqueiam o fechamento.

## Limites multiplataforma e de lançamento

A UI pública e o HTML embutido no App podem ser reutilizados por Desktop/Web/celular; o celular em tela estreita usa o mesmo componente. A entrada temporária de pré-visualidação de desenvolvimento do App foi removida. Web/mobile **não podem usar a URL de loopback do Desktop**; bundles remotos não resolvidos usam fallback/placeholder e não executam o ZIP.

O hospedamento de recursos ZIP reais no Web/celular ainda não foi integrado; o cliente de exibição do Desktop já está conectado ao Marketing Touch, mas o backend real ainda precisa de integração e não se pode descrever o E2E do Desktop como um lançamento na nuvem para todas as plataformas. Não foram alterados desktop continuous / web remote replayable, owner/lease, workspaceIdentity nem o protocolo do Agent; o lease de recurso aqui não é o task owner lease.

Aceitação adicional na fase de produção: publicação confiável HTTPS/CDN com certificação, assinatura, isolamento por conta, limitação de frequência de exibição, canário/rollback e hospedagem de recursos no Web. SHA-256 prova apenas a consistência de bytes, não a confiabilidade do publicador.

O plano completo por fases e os registros de aceitação estão em [cloud-content-dialog-plan.md](./cloud-content-dialog-plan.md).
