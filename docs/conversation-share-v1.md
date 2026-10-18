# Compartilhamento de Conversa e Continuação de Trabalho V1

## Status

- Spec de fatos atuais, data: 2026-08-31.
- Baseline de API: interface de compartilhamento de conversa revision 27, mais os acordos de
  integração de 2026-08-12.
- Este documento também restringe o lado de publicação, o lado de importação do Desktop e o contrato da
  página de share independente em `packages/web` no mesmo repositório.

## Limites de produto

O V1 suporta iniciar compartilhamento a partir de workspaces Desktop locais, SSH, WSL e Docker. O
`/remote` do celular e a Web comum não podem iniciar compartilhamento; o `/cn/share/:share_code` em
`packages/web` apenas consome a API de preview e invoca o Desktop por deep link. O Desktop Server Remote
não é suportado na primeira fase.

Uma sessão em execução pode compartilhar product turns concluídos anteriormente; um turn em execução pode
ser exibido, mas não selecionado. A seleção de compartilhamento tem `productTurnId` como identidade, e
`rowId` é usado apenas para localização no timeline. O título assume por padrão o título da tarefa atual e
pode ser editado apenas para este compartilhamento; um novo rascunho de compartilhamento entra no Dock de
confirmação com a permissão padrão `public_importable` (quem tiver o link pode importar e continuar); após
o usuário trocar explicitamente a permissão, voltar à fase de seleção ou reabrir o mesmo rascunho
mantém essa escolha.

```text
Desktop UI
  -> workspace-scoped ConversationShareService
       |- 本地 JWT / Share API
       |- local/remote Conversation Rows + fileChanges
       `- local/remote artifact staging
  -> prepare -> upload -> confirm -> share URL

Web preview
  -> https://zcode.z.ai/cn/share/<share_code>
  -> zcode://share/import?code=<share_code>
  -> Desktop continuation
  -> 当前本地 workspace 新 task/session + shared_context + 全部产物
```

A página de share é uma build estática independente: `pnpm run build:web-share` usa Vite `base=/cn/share/`
e é publicada por `Dockerfile.web-share` e `nginx.web-share.conf` nas duas entradas de idioma `/cn/share` e
`/share`. As duas compartilham a mesma SPA e os mesmos assets estáticos, e o prefixo de caminho decide a
locale de UI em chinês ou inglês; ela usa imagem, Deployment, Job de CI e versão de rollback independentes
de `/remote/v4`; o Preview público é de acesso anônimo e o Preview privado usa o OAuth Web de mesma origem.

A verificação manual da imagem e das rotas nginx usa `scripts/test-web-share-build.sh` (requer Docker
local, sem credenciais Git do CUA). Ele valida que o artefato de build fica em `/cn/share/assets`,
confirma que as entradas `/cn/share` e `/share` e o callback são acessíveis e, ao mesmo tempo, que
`/remote/v4` não é servido; esses paths base e o isolamento de rotas não são cobertos por testes
unitários, então vale rodar uma vez depois de alterar o Dockerfile ou a configuração nginx.

O callback OAuth é oferecido nas entradas por idioma como `/cn/share/callback` e `/share/callback`, e as
credenciais de login continuam sendo gravadas no `BrowserOAuthCredentialRepo` de mesma origem; assim, após
o login, as duas entradas de Share, o `/remote` e os demais caminhos Web compartilham a mesma sessão Web.
O JWT Web não entra no Deep Link nem é passado ao Desktop. As duas entradas não redirecionam uma para a
outra, evitando que a página em inglês seja trocada para a locale chinesa; assets estáticos e callback são
hospedados de forma independente pela imagem de share.

O mapeamento de permissões é fixo: `private` exige o OAuth Web do owner antes de Preview/import;
`public_readonly` e `public_importable` têm Preview totalmente aberto ao anonimo. Em requests anônimos a
um share private, tanto `401/3213` quanto `404/3211` sob política de ocultação podem mostrar apenas um
aviso genérico de login; se mesmo autenticado o resultado continuar `404`, não se pode revelar a existência
do compartilhamento nem informação do owner. A continuation do Desktop carrega um estado de login
opcional, e o cliente não pode pular a requisição por falta de JWT local; a permissão final de import é
decidida pelo servidor com base no share code, no modo de acesso e na identidade de usuário opcional.

### Página de "conteúdo não encontrado"

Quando o usuário está autenticado e o Preview retorna `not_found`, mantém-se o cartão de estado
centralizado, exibindo 「找不到分享内容」 e 「链接可能无效、分享已被移除，或当前登录账号无法访问。」; com um
parágrafo separado informando 「Z.ai 与 BigModel 的账号数据不互通。请检查是否选错了登录平台或使用了其他账号。」
A dica de conta é uma sugestão de diagnóstico e não infere se o compartilhamento existe, a qual plataforma
pertence nem quem é o owner. Chinês e inglês oferecem textos equivalentes.

Na área de ações, da esquerda para a direita, ficam o botão com contorno 「重试」 e o botão principal
「回到首页」. A página inicial reutiliza o endereço oficial existente `https://zcode.z.ai`, navega na
mesma aba e não limpa o estado de login. Os botões priorizam o layout lado a lado, permitindo quebra de
linha em telas estreitas ou textos longos; usam os tokens existentes de tema e de tamanho de fonte da UI,
sendo compatíveis com desktop, Web no celular e temas claro e escuro.

```text
Preview not_found → 现有 Loader
  ├─ 无 token → 登录选择页
  └─ 有 token → 找不到分享内容 + 账号排查提示
                   ├─ 重试 → 当前 token 再请求 Preview
                   └─ 回到首页 → 官网导航
```

O estado continua sendo mantido exclusivamente pelo `ConversationShareLandingLoader`; os componentes de
estado apenas exibem. Não se modificam o mapeamento de erros, o OAuth, as outras páginas de erro, o
Desktop continuous nem a cadeia de replay do remote no celular.

Caso de aceitação SHARE-NF01 (pending): depois de iniciar `pnpm dev:web-share:mock`, executar
`node packages/web/test/e2e/manual-review/pending/share-not-found.mjs`.
Verificar acesso anônimo ao fixture → login → checar a dica de conta → retry → navegação para a home na
mesma aba, validando os limites acima; cobrir também chinês e inglês, viewports de celular e desktop de
320px, temas claro e escuro, ausência de overflow horizontal e a garantia de que a página expirada não
apresenta conteúdo novo. O request da home é interceptado pelo teste de navegador, sem depender da rede
externa. Os testes unitários do componente complementam com asserções de isolamento para os outros estados
de erro.

Entrada local de verificação do Share: `pnpm dev:web-share:test` inicia a entrada Vite de
`@zcode/web-share` igual à de produção, conectada fixamente ao ambiente de testes; após iniciar, abrir
manualmente `http://localhost:5173/cn/share/<share_code>` ou `http://localhost:5173/share/<share_code>`, e o
share code é lido apenas do path da URL, sem necessidade de variáveis de ambiente; a primeira exibe
chinês e a segunda inglês. `pnpm dev:web-share:mock` usa os fixtures de desenvolvimento
`/cn/share/mock-private`, `/cn/share/mock-readonly`, `/cn/share/mock-importable`, `/cn/share/mock-expired`
e `/cn/share/mock-not-found`. Ambos iniciam apenas o Vite, sem Desktop, relay ou Agente independente.
Há ainda dois fixtures de compatibilidade entre versões: `/cn/share/mock-partial-unsupported` (linhas não
reconhecidas são puladas, com um aviso suave no topo) e `/cn/share/mock-outdated-client` (versão do payload
maior que esta build, mostrando 「需要更新 ZCode」 em vez de 「格式无效」).

O runtime de compartilhamento do Desktop Host sempre usa a Share API real, com o endereço da API resolvido
por `ZCODE_ENV`; não há mais chave de Mock em runtime. `ConversationShareMockApiClient` serve apenas a
testes unitários de serviço e a fixtures de protocolo, e não pode gerar links de compartilhamento
acessíveis de outro processo.

A exibição do corpo da página pública reutiliza a camada de apresentação somente-leitura de
`packages/ui`: por meio de `buildConversationTurnRenderUnits` mantém a ordem de turnos e blocos de
trabalho do Desktop, usando o mesmo conjunto de `ConversationUserInputBody`,
`ConversationUserInputContent`, `MessageResponse`, `Reasoning`, `ToolLayout` e `ToolSummaryRow`. O Share
apenas injeta locale, theme e code preview defaults, e não injeta Host, workspace nem file service; as
ações de Desktop, abertura de arquivo, edição, retry e feedback continuam existindo apenas no Desktop.
Ferramentas contínuas como Explore/Execute/CUA também passam antes pelo agrupamento
`buildAssistantWorkRenderItems` do Desktop, e a página pública exibe apenas resumo seguro e detalhes
somente-leitura, evitando que o resultado de cada ferramenta vire um cartão grande independente.

O Share assume o próprio scroll vertical da página, sem alterar a convenção Desktop/remote global de
`body/#root { overflow: hidden }`. A raiz de scroll também é marcada com
`data-markdown-table-layout-root`, mantendo independentes o scroll vertical da página e o scroll horizontal
interno das tabelas Markdown longas. O modo público do `MessageResponse` consiste em um `TooltipProvider`
efêmero, um handler de link externo somente-leitura e a limpeza de citations: citations locais não vazam
caminhos e diretivas de protocolo não são renderizadas quando não há correspondência com um artifact
público.

A barra fixa no topo da página pública de compartilhamento sempre mantém altura de linha única de 64px. A
marca `ZCode`, o título do compartilhamento e o CTA de continuação usam o mesmo trilho geométrico contínuo;
quando o CTA completo não consegue reservar a largura mínima visível para o título, ele troca por um CTA
de ícone que preserva o nome acessível e deixa o título encolher via CSS ellipsis. O título completo
permanece no nome acessível/`title`. `public_readonly` nunca mostra CTA; essa estratégia responsiva afeta
apenas a exibição da landing page Web e não altera Deep Link, permissões ou comportamento
Desktop/remote.

Quando o compartilhamento pode continuar por importação, o fim da linha do tempo do corpo também mostra um
botão “去 ZCode 继续” com o mesmo estilo e comportamento do CTA do topo, centralizado horizontalmente na
coluna de conteúdo do corpo e reutilizando o mesmo deep link `zcode://share/import`. Clicar em qualquer uma
das entradas, superior ou inferior, entra no mesmo fluxo automático de abertura; `public_readonly` continua
sem nenhuma entrada de continuação. O botão inferior faz parte do fluxo do corpo, não pode ocultar o
último conteúdo compartilhado e não altera a semântica somente-leitura do conteúdo compartilhado.

O "número de resultados" nos metadados públicos conta apenas linhas `kind: "artifact"` dentro dos `rows`
públicos, ou seja, os cartões de resultados do Assistant realmente exibidos no timeline.
`preview.artifacts` é o manifest completo de downloads, compartilhado entre resultados e
`userInput.attachments`, e não pode ser usado diretamente como contagem de resultados; anexos de entrada
do usuário continuam participando do mapeamento de URL/nome e do download, mas não contam como "resultados".

## Prioridade de protocolo

Quando soluções históricas, exemplos de interface e este documento entrarem em conflito, aplicam-se as
regras abaixo:

1. O confirm envia apenas `selected_product_turn_ids`, `projection.rows`, os dois hashes de integrity e a
   confirmação de divulgação.
2. title, schema version, access mode, client request ID e payload hash são enviados apenas na preparation.
3. O integrity de Preview / Continuation tem apenas `projection_sha256` e `artifact_set_sha256`.
4. A resposta de sucesso do upload de artifact precisa conter um `safety_status` não vazio; o cliente não
   faz branch conforme o valor.
5. HTTP 409 / code `3215` é estado não terminal da verificação de segurança; para a mesma preparation e o
   mesmo DTO de confirm em termos de bytes, faz polling serial, preferindo um Retry-After legítimo, senão
   5 segundos, com espera total de no máximo 2 minutos.
6. TTL, limites e allowlist de produtos seguem estritamente as capabilities; PDF só é liberado após
   declaração explícita do servidor.

## Disciplina de compatibilidade entre versões

O conteúdo compartilhado flui entre **4 componentes que podem ser atualizados/revertidos de forma
independente**: o Desktop publicador, o backend Share API, a imagem da landing page implantada de forma
independente (ver "imagem, Deployment, Job de CI e versão de rollback independentes" acima) e o Desktop
importador. Eles não podem estar na mesma versão, então a projeção pública é de fato um **formato de
troca de dados entre versões**. As disciplinas abaixo não são sugestões:

1. **Resposta tolerante, requisição estrita.** Schemas de entrada (capabilities / preview / continuation /
   envelope de erro / eco de descriptor de artifact) nunca são strict, e campos desconhecidos passam;
   schemas de saída (preparation / confirm / continuation request) mantêm `.strict()`, e campos extras são
   bug local e precisam explodir na hora. Adicionar `.strict()` de volta a um schema de entrada equivale a
   fazer o próximo campo novo do backend matar todos os clientes já em uso.
2. **A integridade é validada apenas contra os valores enviados como vieram do servidor**, nunca contra o
   produto da análise do zod (`verifyConversationShareIntegrity`). O zod remove campos desconhecidos por
   padrão, e recalcular o hash sobre o produto da análise reportaria uma evolução de row puramente aditiva
   como 「分享文件校验失败」. Digest e conhecimento de schema precisam ficar permanentemente desacoplados.
3. **rows só podem ser aditivos.** Novos campos precisam ser `optional`; **nunca remova um campo, nunca
   estreite um enum, nunca mude a semântica de um campo** — remover campos e estreitar enums também fazem o
   outro lado perder conteúdo, apenas na direção oposta.
4. **Um novo row kind ou valor de enum significa que clientes antigos pulam aquela linha**
   (`decodeConversationShareRows` degrada linha a linha e a UI mostra um aviso suave de 「部分内容需要更新 ZCode 查看」).
   Antes de adicionar, pergunte: com essa linha pulada, o compartilhamento ainda é coerente? Só mudanças
   semânticas que não podem ser puladas chegam a justificar o item 5.
5. **`schema_version` só é incrementado quando rows sofreram uma mudança destrutiva que não pode ser
   pulada**, e antes de incrementar é preciso confirmar a proporção de versões dos clientes existentes e
   das imagens de landing page já implantadas — incrementar uma vez equivale a fazer todos eles não
   conseguirem ver os novos compartilhamentos. Quando a versão é superior ao conhecimento local, usa-se
   `unsupported_schema_version`(「请升级 ZCode」), sem misturar em `invalid_contract`(「分享格式无效」).
6. **O switch exaustivo de `projectRow` (`conversationSharePublicProjection.ts`) é uma barreira de
   compilação proposital; não adicione um `default` a ele.** Um novo row kind precisa fazer o build falhar,
   forçando o desenvolvedor a tomar a decisão do item 4 em vez de começar silenciosamente a emitir na projeção pública
   algo que clientes antigos não conseguem ler.

A cobertura de regressão está na seção "cross-version forward compatibility" de
`packages/shared/test/conversationShareContract.test.ts`, e no caso de ponta a ponta "importando um
compartilhamento publicado por uma versão mais nova" em `conversationShareImportService.test.ts`. Após
alterar um contrato de entrada, é preciso rodar os dois.

## Autoridade e fronteiras de segurança

O HTTP de publicação, o JWT e os arquivos temporários de staging pertencem sempre ao Desktop Host.
SSH/WSL/Docker fornecem apenas Rows, fileChanges e bytes de arquivo remotos, e não recebem credenciais de
login do Desktop. O serviço precisa usar o `clientMode` confiável injetado pelo Host attachment: apenas
`desktop-continuous` pode publicar/importar; `web-remote-replayable` precisa ser recusado.

A leitura de Rows/fileChanges do Share precisa reutilizar o
`createZCodeAgentConnectionScope(...).service` do attachment MessagePort atual, cujo handshake já foi
concluído. É proibido chamar diretamente a query V4 do Agent cru e proibido criar outro connectionId,
hello/clientHello, Host, runtime de Agente ou subscription para o Share. O ciclo de vida do connection scope
continua sendo gerenciado pelo owner do attachment; o Share apenas mantém uma facade leve durante a
chamada atual.

A key de isolamento remoto é fixa:

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
```

A execução e a exibição de caminhos continuam usando `workspacePath`. Roteamento remoto, cache, tentativa
de publicação e file source precisam carregar simultaneamente `workspaceIdentity` e `remoteSessionId`, e
não podem comparar igualdade apenas por caminho.

O status de publicação não entra no conversation snapshot, no task sqlite, em owner/lease, no CommandInbox,
no relay nem no mirror mobile replayable. Logs não podem registrar JWT, Signed URL, corpo de Conversation
Rows, conteúdo de arquivo ou caminho absoluto.

### Fronteira defensiva da página pública contra conteúdo de terceiros

A página pública de compartilhamento (`/share`, `/cn/share`) renderiza um **corpo controlado pelo
publicador**, e o visitante é anônimo, então nesse ponto de entrada o corpo precisa ser tratado como
conteúdo não confiável. As duas defesas precisam estar presentes, nenhuma pode faltar:

1. **Remoção no lado de renderização**: `normalizeConversationShareMarkdown`
   (`packages/ui/src/v4/conversationShareMarkdown.ts`) rebaixa a sintaxe de imagens remotas no corpo e na
   saída de ferramentas para links comuns (`![alt](https://x)` → `[alt](https://x)`). Trata apenas
   `http:` / `https:` / `//` relativo a protocolo; `data:` não sai pela rede e caminhos relativos caem na
   própria origin, então ficam como estão; escritas dentro de cercas de código são protegidas por
   `findMarkdownCodeRanges` e não são reescritas. Motivo: como o timeline somente-leitura não passa
   `workspacePath` / `sessionId` / `readAttachment`, o `MarkdownImage` cairia no fallback
   `<img src={remoto} loading="lazy">`, e então qualquer visitante, ao abrir a página, dispararia
   automaticamente uma requisição para um terceiro especificado pelo publicador, vazando IP / UA / Referer
   — o equivalente a um tracking pixel controlável pelo publicador. Ficar no lado de renderização tem a
   vantagem de valer **imediatamente para compartilhamentos antigos já publicados**.

2. **CSP no lado de transporte**: `img-src 'self' data: blob:` em `nginx.web-share.security-headers.conf`
   cobre qualquer forma que tenha escapado da primeira defesa. Esse arquivo também fornece
   `X-Frame-Options` / `X-Content-Type-Options` / `Referrer-Policy`, e **precisa ser incluído
   explicitamente por cada `location`**: o `add_header` do nginx não é herdado, e qualquer `add_header` em
   um nível filho (por exemplo `Cache-Control`) descarta o conjunto inteiro de declarações do nível server.

Duas restrições rígidas do CSP (leia antes de mexer, senão a página em produção quebra silenciosamente):

- `script-src` precisa ter `'wasm-unsafe-eval'`: o realce de código do shiki usa por padrão wasm oniguruma
  (`createHighlighter` em `packages/ui/src/lib/shikiHighlighter.ts`), e dar apenas `'self'` quebraria todo
  o realce de código da página de share. Ele só libera compilação wasm; `eval` / `new Function` continuam
  bloqueados (já verificado empiricamente).
- `connect-src` permanece `https:`: a origin da API é injetada em tempo de build do vite conforme `ZCODE_ENV`
  (`packages/web-share/vite.config.ts`), e fixar uma origin concreta obrigaria test e production a terem
  um conf cada.

Artifacts são abertos apenas via `window.open`, sem `<img src>`, portanto não são afetados pelo
endurecimento de `img-src`.

## Projeção de publicação

A projeção pública é construída a partir de `ConversationRow[]` oficiais, nunca por inferência a partir do
DOM, de MessageWithParts legados ou de DTOs Web.

- Permitidos: `turnHeader`, `userInput`, `assistantText`, `reasoning`, `toolCall`, `timelineMarker`, `artifact`.
- Detalhes de `subagent` são filtrados, mas o toolCall do Agente correspondente e os demais Rows públicos do
  mesmo turno são mantidos.
- Cada classe de Row cria um objeto novo por allow-list, removendo actions, source/root command ID,
  client ID, approval ID, active progress e referências locais de artifact.
- Reconstrói deterministicamente os IDs públicos de product-turn, turn, row, entity, tool-call e artifact,
  preservando a ordem estável dos Rows e o fecho de referências.
- O descriptor não envia `original_path`. A referência de artifact é fixa em
  `zcode-artifact://share/<artifact_id>`.

A seleção precisa conter pelo menos um product turn terminal. Cada ID selecionado precisa ter exatamente um
`turnHeader` e o estado não pode ser `running`. Qualquer inconsistência de revision/log epoch entre
paginação precisa falhar antes da preparation.

## Descoberta e upload de produtos

Os candidatos de compartilhamento incluem os `userInput.attachments` do turno atual, os cartões de preview do
Assistant exibidos finalmente no turno atual, e as imagens embutidas em saídas de ferramentas concluídas. O
row `artifact` oficial deixa de ser uma fonte de descoberta independente; ele só entra no compartilhamento
pela via do cartão de preview, se tiver.formado um.

Os candidatos de cartão de preview precisam ser gerados uniformemente pelo shared candidate builder, e UI
e Share Service usam o mesmo conjunto de ordem, deduplicação e limite de quantidade visível. Caminhos
`~/...` no corpo comum, input/output de Bash, varreduras de workspace, `fileChanges` isolados e arquivos que
não formaram cartão de preview não são candidatos. `fileChanges` é usado apenas para a associação
active/reverted de cartões Markdown/HTML e não descobre arquivos de forma independente.

Os arquivos candidatos passam primeiro por stat no lado de execução dono e só então se obtém o conjunto
final de cartões visíveis; um arquivo de cartão do Assistant que não existe é tratado como "cartão não
exibido", não entra no compartilhamento e não gera warning. Anexos de entrada do usuário mantêm o warning
de anexo inexistente.

PDF, Office, Markdown/HTML, vídeo e áudio podem ser candidatos de preview, mas video/audio atualmente só
entram no warning "existe, mas o tipo não é suportado" e não entram no manifest de artifacts enviável. O
mesmo canonical path é enviado apenas uma vez.

```text
正式 attachment / assistant 文件引用
                 |
                 v
    PreviewableArtifactCandidate（文件预览候选集合）
                 |
       +---------+---------+
       |                   |
       v                   v
  UI preview card     Share Artifact Row
```

Os arquivos passam por realpath containment, arquivo comum, tipo, tamanho e mtime no lado de execução
dono. Arquivos remotos entram em staging temporário no Desktop por `readFileRange` em blocos, com cálculo
de SHA-256 durante a escrita; mudanças de size/mtime, chunk vazio, desconexão ou escrita fora dos limites falham de forma
fail closed. Depois do prepare só são enviados os bytes imutáveis do staging. O upload é serial na ordem
de um manifest estável; qualquer falha impede o confirm, e o finally limpa o staging.

`userInput.attachments` são autorizados para leitura pelo connection scope do Agente atual, via
`rowId + entityId + attachmentIndex`; não é permitido ao Renderer usar o caminho do anexo como alvo de
leitura. Texto longo colado mantém o tratamento de caminho existente
`~/.zcode/tmp/paste-attachments/<date>/<uuid>.txt` e não é reintegrado ao corpo no envio; no
compartilhamento, a mesma cadeia de leitura é reutilizada. Quando o arquivo já foi limpo, a leitura falha ou
os bytes mudaram, apenas aquele anexo é pulado e um warning `input_attachment_unavailable` é exibido no
estado de sucesso da publicação, sem gravar caminhos inválidos na projeção pública. Anexos disponíveis são
reescritos uniformemente como `zcode-artifact://share/<artifact_id>`, sem inserir um Row `artifact`
adicional e fechando diretamente pelo manifest.

O tipo de artifact de compartilhamento ganha `text`, correspondente a `txt` / `text/plain`; o servidor
faz a revisão de segurança síncrona de texto UTF-8 igual à de Markdown/HTML. O tipo `text` é habilitado
depois que cliente, servidor e landing page independente de share forem atualizados juntos.

## Máquina de estados da UI

```text
closed
  -> loading capabilities/catalog
  -> selecting terminal turns
  -> preflighting selected turns and attachment metadata
  -> confirming title + access mode + disclosure in share dock
  -> collecting -> uploading i/N -> confirming
                           `-> 3215 safety pending -> confirming
  -> published | failed
```

O `SharePreflight` da fase de seleção é uma verificação somente-leitura independente, que não envia
arquivos, não lê o conteúdo completo dos anexos e não altera o rascunho de seleção. Ele se liga ao
`sessionId` atual, a `workspaceIdentity/workspacePath`, ao `remoteSessionId`, à seleção, à
`revision/logEpoch` das rows, ao fingerprint de capabilities e ao fingerprint de candidatos; depois de
mudanças na seleção, no conjunto de candidatos, no status de alterações de arquivo ou no nível de água da
sessão, o resultado antigo precisa ser marcado como stale.

Os resultados do preflight são divididos em quatro categorias:

- **Bloqueante**: a seleção ficou inválida, falta product turn, há turno/corpo/ferramenta/subagente/compact/goal
  verification ainda em execução, URL local ou inline, referência de artifact não fechada, nível de água
  obsoleto, capacidade conhecida excedida ou não há nenhum conteúdo compartilhável. Itens bloqueantes ficam
  na fase de seleção e não permitem entrar na fase de confirmação.
- **Ignorável**: arquivo de cartão de preview que existe mas não é suportado, anexo de entrada do usuário
  explicitamente inexistente ou alterado. Permite continuar, pulando o arquivo correspondente na publicação
  e exibindo um warning no estado de sucesso.
- **Cartão desapareceu**: o candidato de preview do Assistant não existe no stat; é tratado como um cartão
  que a UI não exibe, não entra no compartilhamento e não gera warning.
- **Adiado para a confirmação**: permissão insuficiente, desconexão remota ou timeout de stat, ou seja,
  situações em que não é possível provar que o arquivo não existe. A fase de seleção apenas avisa que isso
  será reconfirmado na publicação, e a fase de publicação segue o resultado real da leitura.

  A classificação precisa se basear nos fault codes estáveis do lado do protocolo
  (`ZCODE_ATTACHMENT_FAULT_CODES`), e não em casamento de texto de erro. `conversationAttachmentStat` é
  uma sondagem metadata-only, e seu limite superior de `totalBytes` (`attachmentStatMaxBytes`) e o limite
  superior do canal de leitura que transporta bytes (`attachmentPreviewMaxBytes`) são duas fronteiras
  independentes: o stat precisa ser capaz de expressar o tamanho real de um arquivo além da capacidade de
  transporte, senão o bloqueio determinístico de "capacidade conhecida excedida" degenera em "adiado para
  confirmação" e o anexo é descartado silenciosamente na publicação. A determinação de tipo vem antes da
  determinação de tamanho — um tipo não suportado nunca será enviado, seu tamanho é irrelevante para o
  compartilhamento e não deve ser elevado a bloqueio.

- **Remoção silenciosa**: `forkNotice`, `forkCreated`, `checkpointRestored` e outros markers internos
  concluídos mas impossíveis de expressar em um timeline público linear são removidos diretamente da
  projeção pública, sem gerar warning, sem contar como ignorados e sem exigir que o usuário cancele o turno.
  Se, após a remoção silenciosa, a seleção inteira não tiver outro conteúdo compartilhável, aí sim ela é
  bloqueada como "sem conteúdo compartilhável".

O Dock de seleção exibe o estado `checking` durante o preflight; itens bloqueantes mostram o turno específico
e a ação "cancelar a seleção deste turno" (a remoção é do turno inteiro conforme o `productTurnId` carregado
pelo issue, e `turnOrdinal` é usado apenas no texto de exibição — as duas numerações têm critérios
diferentes, e usar o ordinal para consultar o diretório cancelaria o turno errado); quando há arquivos
ignoráveis, a linha de ações mostra a quantidade ignorada. As fases de confirmação e publicação ainda
precisam reutilizar o mesmo conjunto de validações e rechecar revision/log epoch, stat de arquivo, tamanho e
SHA-256, evitando mudanças por corrida no arquivo ou na sessão depois do preflight.

Os resultados do preflight são cacheados pelo owner renderer-local do fluxo de compartilhamento atual por
`productTurnId`, em vez de rechecar a seleção inteira repetidamente. Ao entrar pela primeira vez na fase de
seleção, apenas os turnos ainda não atingidos são verificados em lote; seleções posteriores verificam apenas
as novas e ainda não atingidas. Cancelar turnos já verificados, reselecionar turnos já verificados e clicar
em "Próximo" apenas leem o cache e não disparam novos RPCs de preflight. O cache está ligado a
`workspaceKey`, `remoteSessionId`, `sessionId`, `productTurnId`, revision/log epoch das rows, fingerprint
de turno/candidato, status de fileChanges e fingerprint de capabilities; quando o conteúdo do turno atual, o
conjunto de candidatos, o status de alterações de arquivo ou as capabilities mudam, apenas os turnos
afetados são invalidados.

O cache não entra no banco de dados nem no conversation snapshot, e é limpo ao cancelar/concluir o
compartilhamento ou ao trocar de session/workspace.

O Dock de seleção não insere mais uma barra independente "verificando o conteúdo compartilhado". O estado
do preflight é expresso pela entrada de estado da linha de ações, e o botão "Próximo" sempre mostra apenas
texto curto, sem ícone de espera ou placeholder reservado para ícone; permanece desabilitado antes de a
verificação terminar e, depois, mantém as condições de desabilitação por problema bloqueante e por contagem
de seleção. A lista detalhada de bloqueios/ignorados é exibida em um Popover da entrada de estado, evitando
que a mudança de status de verificação faça a altura do Dock e a largura do botão saltarem.

Os labels em lote do Dock de seleção permanecem em linha única conforme a largura do conteúdo, sem separar
checkbox, label e contagem; quando falta espaço na área de ações, os botões cancelar/próximo vão como um
grupo inteiro para a linha seguinte e ficam alinhados à direita. Chinês, inglês, tamanho de fonte ampliado e
painel estreito seguem o mesmo layout CSS, sem alterar o estado de seleção ou a cadeia de compartilhamento.

Seleção e confirmação de publicação são duas fases de UI reversíveis que sempre reutilizam o mesmo bottom
dock. A fase de seleção cuida apenas de marcar product turns concluídos; ao clicar em 「Próximo」, a fase
de confirmação exibe dentro do dock, simultaneamente, o título deste compartilhamento, a permissão de acesso
e a confirmação de informações sensíveis, sem abrir um modal separado. Quando um rascunho novo entra pela
primeira vez na fase de confirmação, a permissão de acesso padrão é `public_importable`; ao clicar em
「Voltar」 para a fase de seleção, é preciso preservar seleção, título, permissão e o resto do rascunho
renderer-local. O timeline da fase de seleção serve apenas para visualização e localização e não muda a
fase de negócio. Após clicar em 「Confirmar e gerar link」, o dock troca no próprio lugar para o progresso de
organização, upload e verificação de segurança; depois que a publicação começa, a fase não pode mais ser
trocada.

O estado de runtime renderer-local do dock de compartilhamento precisa ser salvo de forma independente por
`sessionId` atual, incluindo pelo menos a sobrescrita de título, a confirmação de informações sensíveis, o
estado "em publicação", o progresso, o link de sucesso, os detalhes de falha, os warnings e a tentativa
idempotente atual. O SessionPane pode reutilizar a mesma instância de pane para trocar de sessão, mas a
troca só altera a chave de leitura do dock atual: não pode projetar o resultado da sessão anterior na sessão
atual, nem limpar o estado de compartilhamento de outras sessões por encerrar o compartilhamento da sessão
atual. Rascunho de seleção e estado de runtime do dock são estado de UI renderer-local e não entram no
conversation snapshot, no SQLite, no CommandInbox nem nas mensagens de recuperação mobile
`web-remote-replayable`; o cache de preflight continua sendo limpo nas trocas de session/workspace pelas
regras existentes.

```text
Session A:  closed -> selecting -> confirming -> publishing -> published
Session B:  closed -> selecting -> confirming -> publishing -> published

switch A -> B: read/write dockStates[B] only
switch B -> A: read/write dockStates[A] only
```

O resumo na base do dock de progresso de publicação usa uma única linha em linguagem natural que expressa
ao mesmo tempo o escopo do compartilhamento e a permissão de acesso, por exemplo
“分享 2 个对话轮次，链接持有者可导入并继续”; as permissões privada e somente-leitura substituem
respectivamente por “仅自己可见” e “链接持有者可查看”. Durante a publicação não é exibido um aviso extra de
“não é possível modificar o conteúdo compartilhado”, porque os controles de título, permissão, voltar,
cancelar e confirmar já estão ocultos ou desabilitados; o título de progresso, a fase e o botão desabilitado
expressam juntos o estado atual. Telas estreitas permitem essa quebra natural do resumo sem alterar a
semântica.

A entrada de compartilhamento no topo reaproveita o `Button variant="ghost" size="icon-md"` da barra de
ferramentas, com área de clique e fundo padrão de 28×28 CSS px, igual aos botões de ajuda, terminal e barra
lateral; o ícone usa o Lucide `ShareIcon size-4`, sem ajuste separado de escala de máscara. O Windows
continua reaproveitando a sobreposição existente de dimensões do caption control. Hover e fundo de seleção
seguem os tokens semânticos; nome acessível, operação por teclado e visibilidade atual da entrada são
preservados, e o `/remote` do celular não ganha entrada de compartilhamento. Essa ajuste afeta apenas a
aparência e não muda a posse do rascunho de compartilhamento nem a semântica de clique.

Ao clicar na entrada de compartilhamento do topo para entrar na fase de seleção, os product turns candidatos
começam todos selecionados, o painel de seleção vem recolhido por padrão e mostra o timeline. Com o
compartilhamento aberto, clicar de novo na entrada do topo cancela o compartilhamento da sessão atual,
reaproveitando `finishSelection` para limpar o rascunho de seleção e o estado visível do dock; o
comportamento é o mesmo nas fases de seleção, confirmação, falha e sucesso e não afeta outras sessões.
Durante a publicação vale a proteção de cancelamento do dock e a entrada do topo fica desabilitada, evitando
que o resultado assíncrono da publicação seja reescrito depois da limpeza.

O ajuste do escopo de seleção é feito reabrindo a entrada à esquerda do timeline. Essa mudança envolve
apenas o estado do renderer e não altera a fronteira de Desktop continuous, celular replayable e a regra de
que o `/remote` do celular não inicia compartilhamento.

```text
普通对话 --顶部分享--> 选择/确认/结果 --顶部分享--> finishSelection(sessionId) --> 普通对话
发布中   --顶部分享禁用--> 等待发布结束
```

Quando a confirmação de informações sensíveis não está marcada, 「生成分享链接」 permanece clicável; clicar
não inicia a publicação, e sim rola a área de confirmação para a posição visível, foca o checkbox e pisca uma
vez com fundo de warning (600ms), voltando ao normal ao final, sem adicionar texto de aviso nem realce
persistente. Cliques repetidos reproduzem novamente, sem acumular animações; com preferência por menos
movimento, apenas posiciona e foca o checkbox. Depois de marcar, não há publicação automática e é preciso
clicar no botão de novo. Título vazio, nada selecionado ou publicação em andamento continuam desabilitados, e
o retry após falha mantém o comportamento original. A confirmação de divulgação continua sendo mantida pelo
estado existente, e o Dock não ganha novos estados de aviso; desktop e Web compartilham esse comportamento, e
o protocolo de publicação não muda.

A área de confirmação de informações sensíveis permanece em linha única quando a largura disponível
permite: à esquerda o checkbox e o texto de confirmação, à direita uma breve explicação da detecção
automática e a entrada 「查看检查范围」, com o conteúdo da direita no mesmo tamanho `text-ui-xs` e
alinhado à direita como um todo. A lista completa de credenciais, tokens, senhas, chaves privadas, endereços
internos e informações pessoais continua no Popover de escopo de verificação; em telas estreitas o
conteúdo da direita pode quebrar naturalmente, sem mudar a semântica da confirmação nem as condições de
validação.

O cartão de confirmação compartilha com o campo de título e o seletor de permissão a mesma trilha de
conteúdo `mx-3`, mantendo um espaçamento `mt-3` independente em relação à área de permissão, para evitar que
a área de confirmação fique colada no cartão de permissão ou apresente limites laterais inconsistentes.

### Layout do Dock de confirmação de compartilhamento em largura estreita (SHARE28)

O Dock de confirmação responde à largura da caixa de conteúdo do próprio contêiner; não é possível inferir o
espaço restante pelo breakpoint `md` da janela. Abaixo de 640px a permissão fica em coluna única, com labels
e descrições quebrando por completo; a partir de 640px, permissão e fase de publicação voltam a três
colunas. Abaixo de 480px a ação principal ocupa a primeira linha sozinha, e voltar/cancelar fica na segunda
linha; a partir de 480px o layout horizontal é restaurado. A ordem do DOM é ajustada para 「生成分享链接」
primeiro e voltar/cancelar depois (em tela estreita, a ação principal na primeira linha decorre diretamente
dessa ordem), e a partir de 480px o container largo usa `order-last` para posicionar visualmente a ação
principal na extrema direita. Em tela estreita, a ordem de foco por Tab coincide com a ordem visual; em
container largo, o primeiro ponto de parada do Tab é a ação principal, na direção oposta à ordem visual
(voltar/cancelar primeiro) — esse é um trade-off conhecido por não ser possível compartilhar uma única
ordem de DOM entre as duas visuais "ação principal na primeira linha em tela estreita" e "ação principal na
mais à direita em tela larga", e ter a ação principal como primeiro ponto de parada também corresponde ao
caminho mais usado por usuários de teclado. O campo de título pode encolher até a largura do contêiner; na
tela estreita a explicação da confirmação oculta o escudo decorativo e reduz a indentação repetida,
mantendo o checkbox, a borda de alerta, o texto completo da confirmação, a explicação da detecção
automática e a entrada de escopo de verificação. A altura total do Dock não passa de 70dvh, o corpo rola
verticalmente de forma independente e a área de ações não sai junto com o corpo; o tamanho da fonte não
diminui, nenhum texto de permissão novo é adicionado e a verificação de publicação não muda.

```text
container width -> CSS layout only -> single column / wrapped actions
sessionId      -> existing dock state -> title / permission / acknowledgement
```

Verificação do SHARE28: painéis de 320/400/640/800px (incluindo painel estreito dentro de janela larga),
chinês e inglês, temas claro e escuro, viewport baixo; controles e textos de permissão não estouram
horizontalmente, a área de ações permanece visível e estreitar e depois alargar preserva título, permissão e
o checkbox de confirmação. Reaproveitando o E2E existente de compartilhamento pendente, acrescentam-se
asserções de geometria e de estado para painel estreito, sem elevar a formal. Barra lateral, página pública
de compartilhamento, fronteira de publicação do `/remote` no celular e cadeias desktop continuous / mobile
replayable permanecem inalteradas.

Após a publicação bem-sucedida, entra em um estado de resultado `published` independente: o título do
compartilhamento é mantido como informação somente-leitura, com um estado persistente de "compartilhamento
criado" e uma explicação; permissão de acesso, contagem de seleção, dicas de confirmação, 「上一步」 e
「取消」 são ocultados. As ações de negócio ficam apenas em 「去浏览器查看」 e 「复制链接」, e as duas mantêm o
estado de resultado após concluídas, com saída pelo ícone de fechar ou `Esc`. O Toast de sucesso é apenas
feedback imediato e não substitui o aviso persistente de sucesso do estado de resultado. Havendo arquivos
ignorados, eles são exibidos como warning secundário no estado de sucesso, e sucesso parcial não pode ser
relatado como falha.

Os três bottom docks de compartilhamento (seleção, confirmação e sucesso) compartilham a mesma superfície
base de entrada do Composer comum: a largura herda a coluna de conteúdo do timeline e usa `rounded-2xl`,
`border-input-border` e `bg-input`. O dock de compartilhamento não usa mais ring de popover nem sombra
grande, evitando diferenças desnecessárias de camadas e halo ao alternar entre campos comuns. As alturas
de conteúdo exclusivas de compartilhamento, os botões de ação, o scrim da fase de seleção, a máscara de
fade da camada de mensagens e as animações de entrada/saída do bottom dock continuam; esses efeitos não
mudam o estado de compartilhamento, o protocolo de publicação nem a fronteira desktop continuous / mobile
replayable.

### Altura do painel de seleção e desvio da área inferior de entrada

O `ConversationShareSelectionPanel` à esquerda na fase de seleção usa altura adaptativa ao conteúdo: com
poucos candidatos, o painel envolve apenas o header, o conteúdo da lista e o padding interno, sem espaço em
branco por altura fixa; quando o conteúdo dos candidatos excede o limite visível, apenas o `ScrollArea` da
lista dentro do painel rola verticalmente. A altura final do painel é o menor valor entre a altura natural do
conteúdo e a altura disponível do contêiner da sessão acima do composer/share dock inferior, sem um teto de
altura em pixels. A altura disponível é medida de verdade em runtime e recalculada quando o dock inferior
cresce, o campo de entrada vira multilinha, a janela é redimensionada ou o layout de tela dividida muda; há
pelo menos 16px de espaço entre o fundo do painel e o topo do dock, e a área de entrada não pode ser
coberta nem espremida.

O painel de seleção não exibe botão de fechar no canto superior direito; o usuário volta ao timeline
clicando no overlay ou usando a entrada de reabertura à esquerda do timeline. Clicar na área de texto de
uma entrada do painel apenas posiciona o corpo no turno correspondente e não muda a visibilidade do painel de
seleção; somente clicar fora do painel o recolhe e retorna ao timeline. Clicar no checkbox continua mudando
apenas o estado de seleção do turno atual e não dispara o posicionamento do corpo.

```text
会话内容区
┌──────────────────────────────┐
│ 顶部安全边距                  │
│ ┌─ 选择面板 ───────────────┐ │
│ │ header                   │ │
│ │ 列表：自然高度            │ │
│ │ 超过可用高度时仅列表滚动  │ │
│ └──────────────────────────┘ │
│ 至少 16px 间距                │
│ 底部 composer / share dock    │ ← 实时测量顶部
└──────────────────────────────┘
```

Essa regra de layout ajusta apenas a geometria do painel de seleção no renderer e não muda o estado de
seleção, o bloqueio de scroll do timeline, o protocolo de publicação nem a fronteira de capacidade de
compartilhamento do `/remote` no celular.

## Contrato dos detalhes de erro de publicação

Uma falha de publicação não pode mostrar apenas o primeiro erro ou um Toast sem contexto. Antes do prepare,
o Host precisa executar um SharePreflight e, em caso de falha, retornar no máximo 5 `issues` desidentificados;
o excedente é retornado apenas como contagem. Cada issue pode conter o número do turno, o nome do arquivo
(apenas basename), o artifact type, a extensão, o MIME, o valor real e o limite de capacidade; é proibido
incluir caminho absoluto, URL, conteúdo do arquivo, hash, Token ou IDs internos de persistência.

Problemas estruturais precisam ser subdivididos pelo menos em: turno em execução, row em streaming, chamada
de ferramenta ativa, subtarefa ativa, compact/goal verification em execução, anexo de entrada do usuário,
URL local/inline, referência de artifact não fechada e revision obsoleta. Markers internos de
fork/checkpoint concluídos não são erros acionáveis pelo usuário e precisam ser removidos em silêncio;
imagens embutidas de ferramentas seguem as regras de conversão de produtos descritas abaixo. Itens
bloqueantes são agrupados por turno e oferecem a ação de cancelar aquele turno.

Problemas de allowlist de produtos precisam mostrar o nome do arquivo, o type/extension/MIME real e os
formatos permitidos pelas capabilities atuais; a combinação `html + text/markdown` do Markdown e a
combinação `html + text/html` do HTML precisam ser diferenciadas.

Contagem de linhas, quantidade de produtos, tamanho de arquivo único, tamanho total de produtos e tamanho do
payload JSON precisam reportar simultaneamente valor real e limite, sem degradar tudo para "excede o limite
de compartilhamento". Erros de rede, de upload e de verificação de segurança precisam marcar a fase da
falha; se o servidor não retornou informação localizável, mostra-se apenas o tipo de erro estável, a fase e
uma sugestão de retry segura, sem exibir o texto original do servidor.

A classificação de erros HTTP parte da fonte da falha: páginas de erro 5xx não-JSON devolvidas por
gateway/load balancer (502/504 em HTML) são falhas de infraestrutura e precisam ser classificadas como
`network`, e não como `invalid_contract` só porque o body não pôde ser interpretado (a semântica de
`invalid_contract` é o servidor violando o contrato da API, o que enganaria o troubleshooting e a
mensagem ao usuário). O upload de artifact é uma transmissão grande que o usuário espera ativamente, e o
timeout de requisição única é ampliado dinamicamente conforme os bytes do artifact (com uma estimativa de
bandwidth mínima); ele não pode reutilizar o timeout padrão das requisições JSON comuns. As regras de
ampliação de timeout fora do confirm têm a mesma origem.

O dock de compartilhamento permanece aberto, a falha de publicação continua no dock em estado de publicação e
os detalhes de erro são exibidos inline e roláveis abaixo das informações de progresso; a falha de publicação
não exibe mais o Toast de erro no topo. O estado de erro mantém 「上一步」, 「取消」 e 「重试生成链接」, e os
detalhes antigos são limpos quando o usuário muda seleção, título ou permissão. Todos os textos de detalhe
precisam suportar chinês e inglês, temas claro/escuro e layout estreito.

O `x-request-id` do servidor nos detalhes de erro não é exibido inline no dock de erro por padrão; o texto de
guia de erro coloca no fim um botão de detalhe de erro somente por clique, que exibe e copia o request-id
legítimo do servidor em um Popover que abre para cima. Quando não há request-id de resposta HTTP, a entrada
continua presente, com um aviso de ausência estável no Popover e sem ação de copiar; nunca se pode usar um ID
de request gerado pelo cliente para se passar por ID do servidor. Múltiplas issues compartilham uma única
entrada de detalhe, sem repetir o request-id depois de cada issue. O botão de erro e o texto de erro mantêm a
mesma coluna de conteúdo, usam uma área de clique de 24px e cor semântica destructive, e precisam suportar
ativação por teclado, fechamento por Esc/clique fora, ajuste de colisão em tela estreita e temas claro e
escuro. Na fase de seleção o painel pode ser fechado para o timeline e restaurado pela reopen tab à
esquerda; essa ação só muda o `view`, não limpa seleção, título, permissão ou rascunho de erro, e a reopen
tab aparece apenas quando `stage=selection`.

O cartão de detalhes de erro usa layout compacto de linha única quando há apenas um texto acionável: o
texto, o botão de detalhe e a ação "Fechar" ficam centralizados verticalmente, com padding vertical
consistente, usando `p-2` menor e estreitando o espaçamento entre o cartão e a barra de ações para `mb-2`;
com múltiplas issues, o espaçamento extra exigido pela lista é restaurado, evitando que um aviso de erro de
linha única deixe espaço desnecessário na base.

O usuário precisa confirmar explicitamente que o sistema não identifica automaticamente informações sensíveis.
Durante a publicação o painel não pode ser fechado. O `share_url` real só aparece após o confirm bem-sucedido;
é proibido usar URL de demo ou loading simulado. Retentativas com o mesmo título, permissão, seleção e
conteúdo reutilizam o clientRequestId, e uma nova ID é gerada após mudanças na entrada.

A falha de publicação precisa exibir uma dica acionável por kind de erro estável, sem degradar tudo para
"请重试". O Desktop Host registra `operationId`, fase, kind, HTTP status/code e contagens seguras; Server
Remote e outras rejeições ativas registram um reason explícito. Logs não podem conter JWT, Signed URL, corpo
de Rows, nomes de arquivo ou caminhos absolutos. Falhas na projeção pública e no staging de produtos
registram ainda um `reasonCode` estável (como `input_attachment`, `running_turn`, `artifact_changed`, `unsafe_url`)
e campos de diagnóstico seguros `rowKind/rowId/artifactType/phase`; a UI usa o reasonCode para sugerir a
próxima ação e não exibe o texto de erro bruto da camada inferior.

## Importação e continuação de trabalho

O CTA Web usa `zcode://share/import?code=<share_code>`, e o deep link só pode carregar o share code. O main
process apenas parseia, cacheia e entrega a intent; o Renderer não bloqueia antecipadamente conforme o
estado de login local e chama uniformemente o Host import service, com a continuation API retornando a
decisão final de acesso. A resolução da janela de destino do deep link de share é igual à de outros deep
links e precisa passar pelo `resolveApplicationWindow` injetado pelo chamador (excluindo janelas auxiliares
como o indicador CUA); quando a janela ainda não está pronta, o pending import cacheado precisa estar
vinculado ao webContents id da janela de destino e ser entregue apenas a ela, sendo limpo quando a janela
destino fechar — entregá-la a qualquer renderer que ficou ready primeiro significaria criar a sessão no
workspace errado, já que a importação escreve `.zcode-share` no workspace ativado na janela de destino.

A importação cria um novo conversation task/session no workspace local atual; um workspace remoto volta ao
conversation workspace local padrão. Os produtos são gravados fixamente em
`<workspace>/.zcode-share/<share-id>/shared-artifacts/`, com reuso idempotente pelo mesmo
`workspaceKey = workspaceIdentity?.trim() || workspacePath` e pelo share code, e workspaces diferentes
criam suas próprias sessions. Depois de criar o marker import-owned:

1. Chamar a continuation e validar o schema e os dois hashes;
2. Baixar todos os artifacts para um staging no mesmo sistema de arquivos, reconferindo size/MIME/SHA-256.
   O download precisa ter timeout por requisição (conexões travadas contam como falha de rede e não podem
   ficar indefinidamente no estágio downloading) e precisa fazer uma pré-verificação de `Content-Length`
   antes de ler o body: ao exceder o `size_bytes` declarado no manifest, interrompe imediatamente, sem ler
   uma resposta grande já conhecida para a memória — a verificação de integridade depois de um download sem
   limite só garante correção e não protege os recursos do cliente;
3. Fazer rename atômico para `shared-artifacts/`;
4. `SharedContextFormatterV1` gera Markdown determinístico na ordem original dos Rows e troca as referências
   de artifact por caminhos relativos;
5. O SQLite cria em uma única transação a session, a mensagem `shared_context` única apenas para o modelo e o
   provenance `v4/shared_context_import`, com estado inicial `pending`;
6. Apagar o marker, ativar o workspace/session e mostrar o handover do Share URL.

Restrições de integração (Todo103): a importação não executa modelo e não depende da disponibilidade atual
do Provider. A mensagem de contexto compartilhado segue o contrato de armazenamento estruturado de
`modelSelection` atual; quando há uma escolha explícita ela é preservada, quando não há vínculo não se
fabrica origem de modelo e não se reescrevem os campos antigos `model.providerID/modelID`. A importação
atômica e a validação de modelo da execução normal posterior são duas fronteiras distintas.

### Inicialização da seleção na primeira importação (Todo139)

Depois que o serviço de importação retorna `reused=false` e antes de ativar a Session, o Renderer prepara um
rascunho de Composer independente para aquela Session, com base no workspacePath/workspaceIdentity real do
resultado. Um rascunho Root já inicializado copia apenas mode/modelSelection (inclusive uma escolha
explicitamente vazia), não copia corpo, anexos ou menções e não limpa o Root. Quando o rascunho alvo já
existe, ele não é sobrescrito; `reused=true` não inicializa.

Sem Root já inicializado, a mesma gravação do rascunho guarda a marca `initializeFromNewTask` de inicialização
pendente, e a nova tarefa comum e essa marca compartilham a função de inicialização: a seleção completa e o
modo dos Recents têm prioridade, senão a seleção padrão pública / build. Se o Registry ainda não está
pronto, o conteúdo é aberto primeiro e a marca impede que um snapshot de Session vazio faça a inicialização
cedo demais; assim que a leitura pública estiver pronta, a inicialização é concluída uma única vez. Se o
usuário alterar antecipadamente modelo/modo, isso encerra a intenção de inicialização padrão e um resultado
tardio não pode sobrescrever; a edição do corpo não limpa a marca de inicialização pendente. Histórico
existente não infira primeira importação a partir de um modelo vazio.

```text
import result (reused=false) → seed independent draft → activate returned workspace/session
                                  ├─ initialized Root → copy selection only
                                  └─ pending marker → shared new-task initialization when View ready
reused=true → existing session/draft unchanged
user submission → existing context_refs + full modelSelection/mode → accepted updates Recent
```

Nenhum campo ou mecanismo de sincronismo novo de Host/CLI; o rascunho do Renderer continua separado da cadeia
autoritativa de mensagens desktop continuous / mobile replayable. A marca pertence apenas ao armazenamento
de rascunho existente, não é gravada no banco de dados da sessão e não é preenchida retroativamente em
registros de importação antigos.

A projection V4 carrega, por metadados de snapshot aditivos de `sharedContextImport`, o `contextId`, o
título, a Share URL canônica e o estado `pending/reserved/attached/discarded`. Excluir a sessão não exclui
arquivos comuns do workspace; depois que a importação termina, a expiração do compartilhamento não afeta a
cópia local.

Na importação, os rows públicos e os metadados dos produtos são gravados juntos em
`<workspace>/.zcode-share/<share-id>/shared-conversation.json`; com base nisso, o topo da sessão renderiza um
**bloco somente-leitura + linha divisória** (reaproveitando o `ConversationShareReadonlyTimeline` da página
de share), e tanto a forma clicável quanto a estática da divisória usam uniformemente o ícone Lucide
`SquareArrowRightEnter`, evitando confusão com o ícone de branch do Fork; tamanhos existentes, cor de tema e
layout multidispositivo são mantidos.

Abaixo da divisória está a conversa ao vivo do próprio usuário. O bloco somente-leitura não busca a origem,
então funciona offline mesmo com o compartilhamento expirado ou ainda não publicado; ele não é um row
`timelineMarker`, não entra na exportação de transcript e não participa de um novo compartilhamento.

Os cartões de artifact no bloco de importação do Desktop só oferecem ação de abrir quando a cópia local tem
um `workspaceRelativePath` legal: o botão principal reaproveita o `OpenSplitButton` da visualização normal para
abrir o PreviewPane, e o menu suspenso reaproveita o mesmo conjunto de escolha de editor e de cópia de
caminho absoluto/relativo. O caminho precisa continuar dentro de `.zcode-share/<share-id>/shared-artifacts/`;
a validação no lado de renderização é uma allowlist de forma (`.zcode-share/<dir>/shared-artifacts/<file>`
com exatamente quatro segmentos, sem `..`/`.`/caminho absoluto), sem cruzar com o shareId — os metadados são
gravados de forma autoconsistente pelo próprio serviço de importação, e copiar as regras de sanitização para
a UI só introduziria risco de drift; o trade-off está detalhado no comentário `resolveImportedArtifactPath` de
`ConversationShareReadonlyTimeline.tsx`; metadados ausentes, absolutos ou contendo `..` voltam à exibição
puramente somente-leitura. A página pública de Share continua usando apenas os `artifactUrls` do servidor
para baixar arquivos, e o botão do cartão de recurso exibe uniformemente 「下载文件」/「Download file」
(igual em navegador de desktop e de celular), sem injetar Host, workspace, file service ou menu local de
abertura.

`ConversationShareReadonlyTimeline` é o arquivo de fronteira de segurança compartilhado entre a landing page
pública e o Desktop, portanto `OpenSplitButton` e sua subárvore open-with (platform hooks, tab store,
modelo da árvore de arquivos, preferências de editor) **não são importados estaticamente por esse arquivo**;
em vez disso, são injetados como componente `artifactOpenAction` pelo consumidor do Desktop
(`ConversationShareImportNotice`); o arquivo do timeline mantém apenas `import type` para
`@/OpenSplitButton.js` (apagado em tempo de build). Isso garante que o bundle da página pública anônima
não contenha fisicamente essa subárvore, e que futuras adições de dependência ao timeline compartilhado
precisem considerar antes o tamanho do pacote da página pública e o ambiente sem host Desktop
(`window.zcode`, PlatformProvider). A restrição é guardada mecanicamente por
`packages/ui/test/conversationShareBundleBoundary.test.ts`: o guard normaliza de forma unificada os
import specifiers do arquivo de fronteira (caminhos relativos resolvidos pelo diretório do arquivo de
fronteira e reconvertidos para a forma do alias `@/`) e só então compara com a denylist, cobrindo quatro
formas de importação — `import`/`export ... from` com cláusula from (aceitando apenas a cláusula `type`),
`import "..."` de efeito colateral e `import("...")` dinâmico (as duas últimas não têm variante de apagamento
de tipo, então um acerto já falha). O extrator do guard traz um autoteste com fixture próprio, para evitar que
uma futura alteração de regex ou da lógica de normalização abra pontos cegos.

O lado do modelo continua recebendo o conteúdo apenas pela mensagem oculta `shared_context`: ela é anexada
junto com a primeira mensagem quando fica visível, e por isso não são mais oferecidos o Share URL Chip no
Composer, o empty state centralizado de handover nem a abertura automática da página de share na barra
lateral depois da importação; a página de share passou a ser aberta pelo usuário ao clicar na divisória. O
comando `discardSharedContext` e o estado `discarded` são mantidos, mas sem entrada de UI por enquanto. O
título da sessão é definido na importação para uma forma com prefixo (`来自分享：…` / `From Share: …`,
`titleSource: "custom"`).

O limpador de inicialização apenas varre markers com import ID correspondente sob `.zcode-share/<share-id>/`.
Diretórios de importação sem provenance são removidos; sessions com registro transacional mas ainda não
ativadas têm o índice reconstruído e são ativadas. Uma limpeza que falha só pode apagar o
importRoot/staging desta tentativa; é proibido apagar recursivamente o workspace do usuário.

## Invariantes de aceitação

### Notificações de status da importação

Uma operação de importação por Share Deep Link só pode ocupar um Toast global. Os estágios de progresso de
download, instalação e criação de sessão são atualizados no lugar dentro do mesmo Toast, sem poder anexar
vários Toasts por estágio. Na importação bem-sucedida, o Toast de progresso é substituído no lugar pelo
resultado final contendo o título da sessão; nenhum aviso separado de "compartilhamento importado" pode ser
exibido. Na falha, o Toast de progresso é substituído no lugar pelo erro e pela entrada de retry, sem deixar
um aviso de progresso já vencido na tela. Uma importação concluída muito rápido pode pular a exibição
intermediária de progresso, mas precisa preservar o aviso final de resultado.

A atualização de progresso por id do Toast funciona junto com a deduplicação existente por dedupeKey;
atualizações armazenadas antes da montagem também são mescladas primeiro no item final e só então
deduplicadas, e a integração do compartilhamento não pode fazer a página de configurações empilhar avisos
repetidos.

O aviso de progresso usa o contêiner de Toast existente, centralizado no topo, o `--color-toast` existente e
a hierarquia de fontes `text-ui-*`; em andamento e no fallback para o workspace usa semântica de informação
neutra, sem o yellow de warning. Essa restrição de exibição afeta apenas a orquestração de notificações do
renderer do Desktop e não muda os estágios de `ConversationShareImportProgress`, a Share API, a transação de
importação, o isolamento por `workspaceIdentity` nem a fronteira Desktop `desktop-continuous` / celular
`web-remote-replayable`.

- `private` só permite preview/import pelo owner; `public_readonly` permite preview anônimo, mas não
  import; `public_importable` permite preview anônimo. O Desktop usa JWT opcional na continuation e toma a
  resposta do servidor como base para a permissão de import; quando o servidor retorna
  `authentication_required`, exibe-se como restrição de login não retentável.
- Não existe entrada de publicação no celular, e o attachment mobile que chama o RPC diretamente continua
  sendo recusado.
- local/SSH/WSL/Docker usam a mesma projeção pública e o mesmo DTO de API; no remoto, apenas a autoridade de
  Rows/File é substituída.
- `shared_context` `pending/reserved/discarded` não é injetado no provider; `attached` é injetado exatamente
  uma vez após hydration/compact e não gera bolha de histórico visível.
- A primeira entrada de Share URL mantém a semântica de queue/guide: depois de aceita pela queue/guide ela
  entra em `reserved` e, no consumo real, é anexada atomicamente à user message; ao remover a entrada
  enfileirada, volta para `pending`.
- Restrição de integração da mesclagem: os `context_refs` do compartilhamento são enviados junto com a Submission
  completa atual; nenhum dos três caminhos — Session existente, primeiro envio com pré-aquecimento e criar
  Session antes de enviar sem pré-aquecimento — pode perder modelSelection/mode. O contexto compartilhado
  não escolhe outro Provider e não restaura a espera pelo Registry antes do envio.
- Apenas uma Aba de navegador é aberta por session/context; o renderer Web e o Browser embutido usam sessões
  OAuth diferentes.
- Falha na publicação ou na importação não deixa metade de um share, metade de um workspace visível localmente,
  diretório de artifact incompleto ou metade de uma session.
- "Se dá para previsualizar, dá para compartilhar" vale apenas para candidatos de preview baseados em arquivo
  e permitidos pelas capabilities; preview apenas de URL localhost não vira automaticamente um produto
  compartilhável.
- Não implementar escuta de todos os arquivos do workspace; arquivos intermediários de Python/Bash que o
  modelo não referenciou explicitamente e que nenhuma ferramenta registrou explicitamente não são exibidos
  nem compartilhados.

### Atribuição e diagnóstico de falhas de publicação

- Problema de conteúdo local, anomalia de contrato HTTP, falha de requisição de rede ou falha de leitura do
  corpo da resposta precisam ser apresentados separadamente; `invalid_contract` não pode ser mapeado para a
  sugestão de cancelar o turno em execução ou a imagem.
- `checking` significa confirmação de publicação e não permite, sozinho, afirmar rejeição da revisão de
  segurança. Após a falha, seleção e identidade idempotente de retry existente são preservadas.
- Falha de leitura do corpo da resposta é classificada como `network`; o status HTTP e o request ID do
  servidor são salvos antes da leitura. O request ID do cliente e o request ID do servidor são mantidos
  separadamente e passados pelos detalhes de RPC existentes até os detalhes do erro; o operationId serve
  para correlacionar a publicação inteira.
- O diagnóstico registra apenas método da requisição, path da interface, status HTTP, request ID, tipo de
  mídia da resposta, tamanho em bytes da resposta e se houve redirect; não registra o corpo da resposta,
  informações de autenticação nem URL com parâmetros de query.

### Imagens embutidas de ferramentas e consistência da fase de seleção

- `node_repl_images` de ferramentas concluídas são convertidos na ordem original em image artifacts
  existentes e inseridos após a ferramenta correspondente; o payload público não carrega base64, e o upload
  reaproveita o manifest existente, o SHA-256, o fluxo prepare/upload/confirm e a cadeia de download da
  importação.
- O preflight e a publicação compartilham a mesma entrada de conversão; o preflight processa apenas os
  dados embutidos já lidos junto com os rows e não lê arquivos de anexo adicionais. O tipo de imagem é
  determinado pelas capabilities do servidor; quando não suportado ou quando os dados da imagem estão
  corrompidos, o texto da ferramenta é mantido com um aviso explícito de que aquela imagem foi pulada, sem
  perda silenciosa.
- A contagem pública de linhas é cacheada por turno e recalculada conforme a seleção atual; ao cancelar um
  turno, o grupo antigo de erros de excesso de limite não é mantido; o fingerprint inclui o display da
  ferramenta, e uma mudança de imagem precisa invalidar o preflight antigo.
- Os limites conhecidos de arquivo único, tamanho total e quantidade para imagens suportadas são
  verificados na fase de preflight; a publicação ainda regenera o snapshot e reconfere. Ferramentas em
  execução continuam bloqueando, e imagens intermediárias não podem se passar por produto final.
- Falhas de interface e de rede não exigem cancelar o turno; a falha de publicação preserva a seleção e a
  identidade idempotente. Áudio/vídeo e formatos de arquivo arbitrários só são carregados quando o protocolo
  existente e a capacidade do servidor suportam, sem forjar MIME ou extensão para burlar limites.

Aceitação: turnos concluídos com imagens embutidas passam pelo preflight, sobem as imagens originais e geram
artifacts baixáveis/importáveis; imagens não suportadas ou corrompidas geram warnings precisos; o excesso de
capacidade de imagens é detectado na fase de seleção; HTTP 405 em HTML e corpo de resposta interrompido são
exibidos como erros de interface/rede, com os detalhes preservando os IDs de correlação.