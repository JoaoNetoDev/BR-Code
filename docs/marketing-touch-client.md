# Integração do cliente Marketing Touch

## Ponte de hover do Banner (2026-09-15)

O iframe do Banner mantém pointer-events:none, inert, não focalizável e ignora actions internas do pacote. O App Banner é o único owner de hover: ao entrar/sair o mouse sobre o Banner inteiro, envia `{type:"hover",instanceId,hovered:boolean}` pelo `zcode-cloud-hero-v1` já existente; não envia coordenadas, cliques nem eventos de negócio, nem altera campos de veiculação do servidor.

```text
entrada/saída do mouse → App Banner hovered → após ready envia hover → animação do pacote de recursos
pending / perda de foco / página oculta / touch → hovered=false → restaura
clique no Banner inteiro / fechar → Controller original → relatório confirm/cancel original
```

O hover não é enviado antes do iframe ficar ready; depois de ready, o valor atual é sincronizado. Com redução de movimento, envia-se false; a remoção de recursos segue destroy, a troca de URL cria um novo estado e a instância antiga não pode afetar a nova instância. O lado dos recursos valida parent/channel/instanceId/boolean, e o hover só atualiza a animação, sem rerenderizar benefícios. O ZIP antigo ignora as novas mensagens e precisa de um ZIP novo para responder a hover dentro do App. O Hero mantém a interação nativa, image/video não são afetados; o fallback Web não envia mensagens de iframe, tela de toque não dispara hover e o encadeamento task/controle remoto não muda.

Aceitação estendida MTC-BUNDLE: entrada/saída real do mouse gera hover, clique/fechamento continuam reportando uma vez cada e o iframe continua sem receber ponteiro; os testes unitários acrescentam pending, blur, hidden, touch, ready e reduced-motion; a verificação dos recursos no navegador confirma transformações reais e restauração.

Status: implementação do cliente concluída, E2E do App macOS com interface isolada local aprovado; servidor real/verificação de segurança da versão oficial e integração em outras plataformas ainda pendentes de aceitação. O servidor segue `marketing_touch_design.md`; este documento fixa a semântica do cliente e substitui a restrição antiga de polling de preview para resgate manual do Banner. O contrato público de exibição está em cloud-content-dialog.md.

## Contrato e responsabilidades

### O resultado do resgate não usa mais toast (2026-09-14)

`claim_zcode_plan` não exibe toast nem em caso de sucesso nem de falha. No sucesso, segue o `success_popup` do servidor (sem aviso adicional se não configurado); em falha, cancelamento pela verificação de segurança e resultado incerto, segue a janela de falha existente. Remove-se o toast de sucesso extra do Provider, sem novos estados/timers e sem modificar o protocolo do servidor, a atualização de benefícios, o polling nem o relatório confirm/cancel. Toasts de ações que não são resgate, como cópia bem-sucedida e navegação, são mantidos, com comportamento compartilhado entre desktop e Web.

```text
resultado do resgate → Controller → sucesso: success_popup (se houver)
                     └→ falha/incerto: janela de falha
                     nenhum dos dois caminhos dispara toast adicional
```

Regressão: sem toast no sucesso do Provider nem quando a atualização posterior falha; MTC-03/04/06/08 e MTC-FAIL observam o DOM de toast durante o resgate real até a janela de resultado, confirmando que não há toast de sucesso/falha e preservando as asserções originais de janela e relatório.

Verificação: primeiro reproduzido em Electron real um toast `Action succeeded` no caminho de sucesso (`desktop-e2e-20260914-092917-468`), sem toast no caminho de falha; após a remoção, `desktop-e2e-20260914-093051-737` passou nos dois (11 segundos, runner exit 0). 35/35 testes unitários relacionados, typecheck, typecheck:e2e, lint (46 warnings existentes / 0 errors) e architecture (0 violations) passaram. Não foram verificados a interface de produção real, Windows/Linux e aparelhos móveis.

### Alinhamento ao protocolo do servidor (2026-09-12)

Com base no §7.3.1 do `marketing_touch_design.md` fornecido pelo usuário, o background do Banner de marketing e o hero do Popup aceitam apenas `image / video / bundle`. Revoga-se a integração de `lottie`, `lottie.dark` e parâmetros de reprodução, que não estavam acordados, e não se trata campo customizado do cliente como capacidade do servidor. O player Lottie genérico existente é mantido, mas não é ligado à veiculação de marketing. Tipos visuais não suportados seguem a regra existente de rejeição da veiculação individual, sem afetar outras veiculações legais do mesmo lote; polling, cache de recursos, fechamento e relatório permanecem inalterados. Os testes mock de Lottie anteriores apenas provavam o encadeamento customizado do cliente e não representam suporte do servidor.

Regressão de alinhamento: 74/74 testes unitários relacionados; casos oficiais MTC-BUNDLE / MTC-RICH em Electron macOS local 2/2 (7,5 segundos), cobrindo o pacote de recursos existente, tema/dados/relatório, rich text e Banner de vídeo. typecheck, lint (45 warnings existentes / 0 errors) e architecture passaram. Não foram reverificados outros sistemas operacionais, aparelhos móveis nem o servidor real; a conclusão histórica de cobertura não muda.

### Mensagem de falha no resgate (2026-09-11)

O `msg` da resposta de falha de `POST /api/v1/zcode-plan/billing/claim` não é exibido; usa-se apenas `data.message` (já traduzido pelo servidor) como texto puro, preservando quebras de linha e sem interpretar HTML/Markdown. Quando message está ausente, não é string ou é só espaços em branco, o App usa o texto de falha genérico localizado e não deriva mais data e texto a partir de códigos de erro como 1005. A interface de resgate aceita code numérico e code em string numérica; code ausente ainda falha, sucesso ainda exige code=0 e data.plan presente; o unpacking das outras interfaces fica inalterado.

O Controller é a única fonte de estado de erro, carregando a action à qual o erro pertence; apenas a mensagem de falha de claim_zcode_plan muda de toast para Dialog. A janela não tem título visível, nem Hero/X de fechamento; o conteúdo é o Alert existente + InfoIcon + AlertDescription, com o botão「知道了」alinhado à direita abaixo. Mantém-se o título oculto para leitores de tela, e textos longos podem quebrar linha e rolar. O Alert reaproveita apenas semântica e layout de figura/texto, removendo fundo, borda e padding, sem formar um segundo contêiner visível; o Dialog externo permanece. Regressão de estilo do contêiner interno: teste unitário do componente passou, App MTC-01/07/08 e MTC-FAIL 2/2 passaram (`desktop-e2e-20260911-153048-039`), e o CSS real nos temas claro e escuro é fundo transparente, 0 borda, 0 padding. Suporta temas claro/escuro e tela estreita. Máscara/Esc/「知道了」apenas limpam o erro, sem refazer o claim nem gerar confirm/cancel extra. Na falha de resgate da janela de marketing existente, a janela original é temporariamente ocultada e restaurada ao fechar a mensagem; erros de outras ações continuam em toast.

```text
resposta do claim → servidor lê data.message → Controller error + action
                                   → pending=false → Dialog de falha
知道了/Esc/máscara → clearError → lógica original de veiculação/polling (sem resgate automático)
```

MTC-FAIL: testes unitários do serviço cobrem code string/número, msg ignorada, message literal/ausente/em branco/valor inválido; o componente cobre Info Alert, ausência de título visível, texto puro e fechamento sem retry; o Controller cobre o fechamento de pending e que a limpeza de erro não gera relatório; o E2E do App faz Banner real → verificação de segurança → falha no claim → janela →「知道了」, verificando o texto do servidor, tema claro/escuro/tela estreita, a contagem de claims e a ausência de confirm/cancel, e preserva capturas de estilo. Componente compartilhado entre desktop e Web, com o mesmo mapeamento de serviço do Host; não muda a fronteira session continuous/replayable.

Verificação: 142 testes unitários relacionados passaram; App macOS MTC-01/07/08 e MTC-FAIL 2/2 passaram, registro de execução `desktop-e2e-20260911-150225-383`. O serviço isolado devolve uma resposta de falha no formato real, verificando o texto do servidor/o fallback em branco, o layout estreito de 358px nos dois temas, fechamento sem retry e sem novo relatório; as capturas aguardam o fim da animação de entrada. Lint com 0 erros e arquitetura com 0 violações. A verificação de tipos do repositório/E2E continua bloqueada pelos erros já existentes em modelProviderService, Root RefreshCw, Provider id e nos campos de conta/configuração antigos de marketing-touch-entitlement. Não foram verificados o resgate/produção real, a verificação de segurança real, Windows/Linux e aparelhos móveis; as capturas usam rótulos de botão em inglês do ambiente de teste.

### VisualBody e texto formatado (2026-09-11)

O background do Banner e o hero do popup compartilham o VisualBody: image / video / bundle. O vídeo (MP4) mantém download, verificação de resumo, preload reproduzível e fallback de prepareMarketingHero, sem criar outro cache ou fonte de estado. O Banner tem altura fixa de 96px, vídeo em loop e mudo, sem controls, e não intercepta o clique do botão de imagem inteira; pausa em página oculta e com movimento reduzido, e mostra fallback em caso de falha de reprodução. Os controls originais do vídeo do Hero não mudam, e o ZIP continua respeitando a exibição após ready.

```text
GET → validação do VisualBody → prepareMarketingHero → veiculação atual do Controller → Banner/Hero
texto format/content → adaptação (preservando formatação) → renderização segura compartilhada → título/descrição/botão
```

plaintext aparece como está; markdown suporta parágrafos, títulos, ênfase, listas, citações, código, links e tabelas; HTML embutido em markdown aparece como texto, e para usar HTML é preciso o format html. A saída de HTML e markdown passa pela mesma reconstrução segura de tags/atributos, preservando as regras existentes de class/style, sem executar scripts e sem carregar imagens embutidas. Título e botões usam modo inline (tags de bloco convertidas em span), links mostram apenas texto e não geram interação aninhada; links http(s) da descrição ainda passam pelo callback da plataforma. As strings title/label antigas do Dialog público são mantidas por compatibilidade, e o adaptador de Marketing fornece formattedTitle/formattedLabel apenas para uso de UI, sem novos campos de servidor. O destaque de texto herda a cor de primeiro plano do botão e não pode quebrar o contraste do botão primary. A ação do botão, o seq e o relatório permanecem. Componente compartilhado entre desktop e Web, sem mudar Host, controle remoto ou semântica de mensagens de session.

Aceitação: o protocolo aceita vídeo e o recurso tem fallback; o componente verifica a tipografia segura de Markdown/HTML, a preservação de formatação e o clique em título/botão; o E2E MTC-RICH verifica a exibição real de rich text no App, o relatório de fechamento e o Banner de vídeo.

Verificação: 117 testes unitários relacionados passaram; App macOS MTC-01/07/08 e MTC-RICH 2/2 passaram, registro `desktop-e2e-20260911-123103-540`. Foram verificados decodificação real de MP4/loop/mudo/sem controls, altura de 96px, rich text nos temas claro/escuro e em tela estreita de 358px e relatórios cancel/confirm. No primeiro teste o WebM foi rejeitado pela verificação de material e foi trocado por MP4 dentro do protocolo; o vídeo de teste estático de quadro único não conseguia loop, e passou após gravação de múltiplos quadros, sem afrouxar a validação do produto. Lint com 0 erros e arquitetura com 0 violações. A verificação de tipos do repositório e do E2E continua bloqueada pelos erros já existentes em modelProviderService, Root RefreshCw, Provider id e nos campos antigos de conta/configuração de marketing-touch-entitlement. Não foram verificados Windows/Linux, aparelhos móveis nem o serviço de produção real; a propriedade de estado de sincronização, polling e relatório não foi modificada.

### Tema dos botões da janela

Os botões do conteúdo da janela sempre mostram apenas texto, sem adicionar automaticamente ícone de compartilhamento, marca de cópia bem-sucedida ou qualquer outro ícone com base na action. O feedback textual de cópia bem-sucedida, o clique repetido, o estado desabilitado e o relatório confirm/cancel permanecem; o X no canto superior direito não é afetado. O componente e o E2E MTA-01 cobrem a ausência de SVG antes e depois da cópia.

O popup independente e o `success_popup` suportam `theme` com variant/class/style em `buttons[]`. O variant aceita default/outline/secondary/ghost/destructive/warning/link; omitido ou string vazia equivalem a default. Theme omitido ou null também usa default e não deriva mais secondary pela action close. class/style são strings opcionais (cada uma com no máximo 512 caracteres), class é mesclado pelo cn existente e não há lista branca de nomes de classe; apenas classes Tailwind já compiladas no App têm efeito, e não se executa um compilador Tailwind remoto. style reaproveita a validação de propriedades e valores de cloudDescriptionStyle, permitindo propriedades existentes como cor, texto e espaçamento limitado, e proibindo URL de recurso, posicionamento fixo, `!important` etc.; o estilo inline final sobrescreve class, e class sobrescreve o layout base e o variant. O Banner ignora theme (incluindo variant desconhecido), e os estilos de fechamento/loading permanecem como estão. O X no canto superior direito da janela, a máscara e o Esc não pertencem a `buttons[]`, e comportamento e estilo não mudam. Nós de texto mantêm apenas format/content; o antigo text.style é descartado como campo desconhecido, sem rejeitar veiculações históricas. class/style no conteúdo de texto HTML continuam usando o parsing original, sem impacto.

```text
envio → validação de theme de popup/success_popup → adaptação → Button compartilhado
     → theme de banner é ignorado
clique → action original do Controller → relatório confirm/cancel original
```

MTC-THEME: o protocolo cobre os sete variants, o default, o limite de tamanho, o descarte de campos antigos e o ignore no Banner; o componente cobre a prioridade de class/style, o filtro de estilos perigosos e o clique; o E2E MTC-HTML verifica ao mesmo tempo o tema dos botões, tema claro/escuro/tela estreita e o relatório cancel. Componente compartilhado entre desktop e Web, sem modificar o processo de serviço nem a fronteira de sincronização do controle remoto.

Verificação em 2026-09-11: 83 testes unitários relacionados passaram, E2E do App macOS isolado de MTC-01/07/08 e MTC-HTML 2/2 passaram; lint com 0 erros e verificação de arquitetura passaram. A regressão completa de delivery teve 9 aprovações/5 falhas, sendo a primeira falha um timeout de navegação de Provider de modelo já existente, e a janela remanescente interferiu nos casos seguintes; o caso isolado de tema via grep direto do WDIO passou. A verificação de tipos do repositório e do E2E continua bloqueada pela API/campos antigos do Provider após o rebase e pelo problema de import do Root RefreshCw, e não é estendida nesta rodada. Windows/Linux e aparelhos móveis não foram verificados; a tela estreita é validação de layout dentro do desktop.

Correções posteriores em 2026-09-12 ([registro de implementação E2E](testing/marketing-touch-e2e-implementation.md)): foi ligado `providerSettingsService.refresh("marketing-plan-claim")` mantendo a atualização de benefícios best-effort, corrigida a correspondência de navegação por `providerId` e o import do ícone de erro do Root, e a verificação de tipos voltou a passar. O dialog em bundle interativo começa com foco no botão de fechamento da camada pai, evitando que o iframe engula o primeiro Esc; o usuário ainda pode entrar no Hero ativamente. Na saída do Host, os serviços de recursos em nuvem que oferecem apenas `disposeAllAndWait` são reconhecidos e a liberação do lease e do diretório de cache deste Host é aguardada; o caminho de saída síncrono só inicia a limpeza best-effort e não a trata como espera concluída. As regressões novas continuam pending, e a cobertura completa e as lacunas de plataforma seguem o registro de implementação, sem alegar que os 95% foram alcançados.

### Atualização após a conclusão da tarefa (2026-09-18)

Quando um workspace montado observa a sessão indo de um estado não concluído para `completedSuccess`, ele busca novamente uma vez `GET /api/v1/marketing/touch` e atualiza os candidatos de Banner e Popup ao mesmo tempo. Não depende do interruptor de notificações do sistema. O primeiro snapshot histórico, a linha de base após troca de workspace/reconexão, estados concluídos repetidos, falhas e interrupções manuais não disparam. Várias tasks concluídas no mesmo lote disparam apenas uma vez; requisições em andamento continuam sendo combinadas pelo poller único da janela em uma consulta subsequente. Página oculta não envia requisição, e ao voltar a ficar visível reaproveita a atualização existente. A exibição do Popup continua sujeita às regras existentes de obstrução e deduplicação.

```text
CLI task owner → projeção somente-leitura do sessions-index → hook do workspace observa a borda de sucesso
  → poller Marketing Touch da janela → query → candidatos de Banner/Popup e gates de exibição existentes
desktop continuous / mobile replayable: mantém o transport original, sem novo owner de recuperação de mensagem ou de estado de task
```

O hook do workspace reaproveita a assinatura do endpoint + workspaceIdentity (com fallback local para workspacePath), guarda apenas o valor observado anteriormente; não assina enquanto o RPC não estiver pronto, limpa a linha de base de observação fora do período live e libera as referências após o unload. Aceitação MTC-TASK-COMPLETE: atualização por conclusão bem-sucedida, ausência de atualização por histórico, ausência por falha/interrupção, deduplicação de repetição, conclusão ao rodar novamente, combinação de conclusão em lote, restauração da linha de base após desconexão, identidade remota e limpeza, além de agendamento com página oculta/requisição em andamento.

### Prioridade do slot compartilhado entre o Banner de token no canto inferior esquerdo e o cartão de compartilhamento Highspeed (2026-09-20)

O Banner de marketing「领 token」no rodapé da barra lateral esquerda e o cartão de compartilhamento Highspeed (notificação global `highspeed-share`) colapsam no **mesmo slot de exibição** e, quando ambos são atingidos ao mesmo tempo, o **Banner de token tem prioridade e cobre o Highspeed**; depois que o Banner desaparece ou é fechado, o mesmo slot exibe o cartão de compartilhamento Highspeed. A arbitragem é feita pelo componente de projeção somente-leitura `SidebarBottomActivity`: lê a visibilidade do store de cada lado e renderiza um deles, sem copiar estado nem adicionar timers. A visibilidade do Banner reaproveita o predicado único `isMarketingBannerRenderable` (`banner && resource_position === "banner" && (image || bannerHero)`, e durante o `pending` do resgate ainda conta como visível). A sequência completa e a atribuição estão em [Especificação do cartão Highspeed §9.5](highspeed/highspeed-card-spec.md).

```text
banner visível → renderiza o Banner de token (cobre o Highspeed)
banner desaparece/é fechado/o pending termina sem veiculação → renderiza o cartão de compartilhamento Highspeed no mesmo slot (se ainda dentro da janela de 24h)
```

### Número de sequência seq da requisição inicial

`GET /api/v1/marketing/touch?seq=0`: a primeira requisição real usa 0 e, a partir daí, incrementa. O número é mantido pelo módulo de serviço do Marketing Touch dentro do processo e compartilhado entre múltiplas instâncias de serviço; remontagem de componente, troca de workspace, de conta e de idioma não zera. Não é persistido, e o reinício do processo de serviço recomeça em 0. Cada Host de janela do desktop e cada processo de serviço Web independente conta separadamente; o celular, ao pedir pela entrada de serviço existente, segue o número do processo daquele serviço, sem nova sincronização entre dispositivos. O número é atribuído quando a validação de credencial/dispositivo/idioma passa e a chamada HTTP está prestes a acontecer; falha de rede e falha de parsing da resposta também consomem número, e requisições concorrentes não repetem. Requisições não enviadas, polling pausado e POST de action não consomem número. Serve apenas para o log do servidor localizar eventos e não altera a decisão de veiculação, o período de polling, a deduplicação nem a semântica de relatório. Este acordo sobrescreve a descrição anterior da documentação do servidor, que começava em 1.

```text
início do processo (0) → validação da requisição → GET seq=0 → GET seq=1 → ...
                         falha também incrementa; recriar a instância de serviço não zera
```

Aceitação: os testes do serviço cobrem primeira chamada, sequencial/concorrente, falha, rejeição por validação, login e mudança de idioma, recriação da instância de serviço, inicialização do módulo em processo novo e action sem contagem. Nenhuma interação de UI é modificada nesta rodada, e o E2E de exibição existente é reaproveitado.

### Borda e raio do Banner (atualizado em 2026-09-11)

Verificação: 11 testes unitários e 14 E2E do App macOS passaram (`desktop-e2e-20260911092935856-p13324-22f4d65aa5e1e68e`); os estilos computados em execução confirmaram botão de 96px, iframe de 94px, borda de 1px e raio de 12px, e as capturas confirmaram o recorte. typecheck, tipo de E2E e arquitetura passaram; Lint com 0 erros/46 warnings existentes. Apenas mudança de camada de exibição, sem execução separada em Windows/Linux/aparelho móvel.

O requisito visual mais recente sobrescreve as convenções históricas sem borda e de altura proporcional deste documento: o botão de imagem inteira de imagem, ZIP e fallback usa uniformemente `h-24 border border-border rounded-xl overflow-hidden` (96px fixos incluindo a borda, borda de 1px do tema e recorte de raio 12px), com largura adaptativa; sem fundo ou sombra adicional. A imagem preenche com object-cover, o viewport do ZIP preenche a área de conteúdo de 94px de altura e a altura não é mais calculada pela proporção 236:100; o pacote deve responder a largura variável e altura fixa. Fechamento/loading continuam como sobreposições irmãs, preservando ghost/rounded-full, posição original e o focus ring de teclado. Web do desktop e do celular, e temas claro/escuro, usam o mesmo componente, sem mudar os estados de ready/cache/action/relatório. MTC-03 e MTC-BUNDLE verificam altura fixa, borda computada, raio, overflow e acerto nos cantos, e as regressões existentes de clique/fechamento/loading/relatório são preservadas.

### Pacote de recursos ZIP do Banner

`banner.background` suporta `image | bundle` (não aceita video/lottie). O bundle compartilha com o hero do Popup `{type:"bundle",bundle:{bundle:{src,sha256},entry:"index.html",fallback?:{src,sha256}},args?:{...}}`. A veiculação antiga em image permanece compatível; as regras de botão do Banner e o success_popup não mudam. O ZIP usa a autorização de host existente, a verificação SHA-256, a extração segura e lease/cache, sem nova entrada de download.

Exemplo de background (URL/hash são placeholders, substituídos no publicação pelos recursos reais e pelo SHA-256):

```json
{
  "type": "bundle",
  "bundle": {
    "bundle": {
      "src": "https://cdn.example.com/weekend-banner.zip",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    "entry": "index.html",
    "fallback": {
      "src": "https://cdn.example.com/weekend-banner.png",
      "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  },
  "args": { "planName": "Weekend Build", "amountValue": "300,000,000", "amountUnit": "Tokens" }
}
```

```text
GET -> shared Schema -> autorização de recursos -> prepareMarketingHero(background)
                                      -> ZIP lease -> iframe isolado -> init(args/theme/locale)
                                                                   -> ready -> exibição do Banner
                                                                   -> error/5s -> fallback / ocultar
botão de imagem inteira/fechar do App -> Controller original -> verificação de segurança/resgate -> confirm/cancel
```

A proporção de exibição do bundle do Banner é 236:100, com largura adaptativa à barra lateral, e a cena do pacote deve responder a esse viewport. A camada externa não tem fundo de cartão/borda/raio/sombra, e o iframe é transparente, não focalizável e não recebe ponteiro; o botão de imagem inteira do App recebe clique e teclado, com fechamento e loading sobrepostos a ele. O pacote é responsável apenas pela cena e pelas animações automáticas; mensagens de action internas do pacote não executam ações de negócio nem oferecem interação interna independente de clique/arrasto. Continuam sendo usadas as mensagens init/theme/visibility/destroy/ready/error de `zcode-cloud-hero-v1`; args chegam em data pelo mapeamento de exibição de planos existente, os campos originais de args são preservados e nenhuma credencial é carregada. Resize não altera a proporção fixa.

O Controller continua sendo o único owner de veiculação/ação, e o componente guarda apenas o estado de prontidão do iframe. Depois que o download e a extração terminam, o iframe é montado fora da tela; antes de ready nada é exibido nem habilitado nos controles; em caso de erro usa-se o fallback decodificado e já verificado, senão oculta-se sem reportar. Substituição/remoção/fechamento/troca de identidade descartam recursos atrasados pelo generation existente e liberam o lease, e os recursos de success_popup e do Banner são mantidos e liberados separadamente. A mesma veiculação não remonta, e os recursos são reaproveitados pelo cache existente; nenhuma deduplicação de campanha é adicionada. O Web não pede o loopback do desktop e mostra apenas o fallback; sem fallback, oculta. O componente compartilhado cobre tema/idioma/tela estreita, e o attachment de task continuous/replayable e de controle remoto não muda.

Aceitação: os testes unitários de MTC-BUNDLE cobrem Schema, autorização, mapeamento de dados/lease, ready/mensagem falsificada/erro/timeout, remontagem, controles em pending e o ignorar de ações internas do pacote; o E2E do App usa um ZIP real e verifica exibição após ready, proporção, dados, tema e relatórios de clique/fechamento, além do reuso de cache do mesmo SHA. O E2E de image original é preservado, e as plataformas não verificadas precisam ser listadas no registro de conclusão.

Verificação em 2026-09-11: 91 testes unitários relacionados e 14 E2E do App macOS passaram (run `desktop-e2e-20260911091948588-p91654-49a47f54650b1782`); typecheck, E2E typecheck, architecture e a verificação de diff passaram, Lint com 0 erros/46 warnings existentes. A primeira execução do E2E falhou porque a navegação anterior ficou na página de configurações sem voltar ao workspace; na segunda, a extração de texto visível falhou durante a animação de entrada do voucher e passou depois de validar separadamente com dados DOM precisos e o fechamento da animação. As capturas de execução confirmam o iframe renderizado de verdade na barra lateral; o Hero 4:3 original foi reaproveitado apenas como fixture de encadeamento, e sua cena fica recortada em 236:100 e não é um recurso de design oficial do Banner. Nenhum novo ZIP de Banner foi publicado, a veiculação do servidor não foi modificada e nenhum plano real foi resgatado; Windows/Linux/aparelho móvel não foram verificados e o fallback Web é coberto por teste unitário.

As novas actions estão em [protocolo de navigate e copy_text](marketing-touch-actions.md): o cliente já está ligado à navegação nas seções de configurações, gestão/mercado de plugins e detalhes, além da cópia de texto puro; não inclui criação de task nem troca de modelo. Depois de confirmar o componente de destino, a navegação fecha o conteúdo e reporta confirm; a cópia bem-sucedida mantém o conteúdo e reporta confirm a cada cópia real, e o fechamento posterior do Banner/Popup independente ainda reporta cancel. Nenhum dos dois dispara success_popup.

A descrição em HTML suporta class sem passar pelo filtro de lista branca de nomes de classe, e inline style sujeito à validação de atributos e valores, com as regras completas em [HTML styling](cloud-content-html-styling.md). Apenas o CSS Tailwind já empacotado tem efeito e o description.style externo não muda; o conteúdo do servidor precisa ser confiável e não se promete isolamento de layout para qualquer class.

A compra de upgrade usa `{"type":"navigate","args":{"page":"upgrade"}}` e apenas o desktop reaproveita a página de compra embutida do site oficial e a seleção de provedor da barra lateral, sem aceitar parâmetros de plano ou de pagamento automático. A janela de marketing é ocultada enquanto a página fica waiting ready, e falha/cancelamento/timeout restauram o conteúdo sem reportar confirm; depois que a página fica ready, reporta-se confirm uma única vez, indicando abertura bem-sucedida e não compra bem-sucedida. Login e pagamento continuam sendo tratados pela página de compra original.

Aceitação das novas actions em 2026-09-11: 86 testes unitários relacionados, 11 E2E do App macOS isolado e as verificações de tipo/tipo de E2E/arquitetura/formatação passaram; Lint com 0 erros/46 warnings existentes. Os runs detalhados e as plataformas não cobertas estão no registro de verificação do protocolo de actions. A integração com veiculação e estatísticas do servidor não faz parte da declaração de conclusão.

O controle de fechamento usa `ghost + rounded-full`, transparente por padrão e com o estilo de hover existente; o loading também não tem fundo, evitando cor de base na troca de estado. Nenhum dos dois adiciona `bg-card`. Desta vez é apenas uma correção de camada de exibição, com o mesmo componente reaproveitado entre temas/desktop/celular e sem mudar os estados de action e relatório. MTC-03/04 verificam simultaneamente o estilo computado transparente de fechamento e loading.

Verificação em 2026-09-11: a asserção de fundo falhou antes da mudança; depois, 16 testes unitários e 5 E2E de delivery do macOS passaram, com fundo de fechamento/loading em runtime de rgba(0, 0, 0, 0). typecheck, E2E typecheck e architecture passaram; Lint com 0 erros/46 warnings existentes. Não foi executado separadamente Windows/Linux/aparelho móvel nem a aceitação visual dos dois temas.

### Migração de nomenclatura do protocolo do Banner

Com base na nova documentação do servidor, o slot de recurso é unificado como `resource_position: "banner"` e o campo de conteúdo é `banner`; o protocolo antigo `card` deixa de ser aceito. Arquivo do componente, tipos públicos, estados/actions do Controller, arquivos de teste e testid passam a usar Banner/banner. Slots de recurso antigos desconhecidos são rejeitados de forma independente, sem afetar um Popup legítimo.

Desta vez só o nome é migrado, preservando imagem pura, texto de botão vazio, fechamento/loading, verificação de recursos, janela de sucesso, polling e semântica de relatório; o Banner não ganha novos tipos de fundo. O Controller continua sendo o único owner de estado, desktop e celular reaproveitam o mesmo caminho e a fronteira task continuous/replayable não muda. A fixture HTTP é atualizada para Banner; as três versões existentes do JSON de entrega são todas Popup independentes, sem campos antigos, e não precisam de modificação. Os bytes e o hash do HTML/ZIP do Hero não mudam. Os tokens de estilo genéricos de Card e a nomenclatura dos cartões de benefícios não pertencem a esta migração.

```text
GET banner -> Schema -> autorização de recursos do Service -> Controller -> MarketingBanner
                                                    -> success_popup / report
card antigo -> rejeitado de forma independente; o Popup da mesma resposta é preservado
```

Aceitação: o novo Banner e o Popup são analisados ao mesmo tempo; o card antigo é rejeitado; clique/fechamento com texto vazio, redelivery de 30 segundos e confirm/cancel do E2E do App continuam passando.

Verificação desta vez: antes da migração, 5 asserções do novo protocolo falhavam; depois, 45 testes unitários em 8 arquivos e 5 E2E de delivery no macOS passaram, com typecheck, E2E typecheck e architecture aprovados e Lint com 0 erros/46 warnings existentes. O hash dos três ZIPs do Hero não mudou. O E2E adicional de benefícios não passou: na execução conjunta o fixture compartilhado removia o Popup; ao rodar isolado conforme a documentação os passos do Popup passaram, mas a página de configurações não tinha a opção de conexão Start (`selectBigModelPlan`), e o código executável desse caso é idêntico ao de antes da migração, com a causa a ser investigada separadamente. Veiculação online, verificação de segurança real e Windows/Linux/aparelho móvel não foram verificados, e o caso adicional de benefícios não é marcado como aprovado.

O `style` do texto é metadata opcional: omitido, `null` ou objeto são válidos; omitido/null usa o estilo padrão do cliente e objeto ainda não é injetado diretamente no DOM. Essa regra se aplica uniformemente aos botões do Banner, título/descrição/botões do Popup e success_popup, sem afrouxar a validação de parâmetros de negócio como action.args.plan_id.

Regressão de `style:null`: antes da mudança 1 teste falhava, depois 14 testes unitários relacionados passaram; 3 E2E do App macOS usando fixture com estilo null passaram (run `desktop-e2e-20260910104035687-p56768-d8445a96ab6405e9`). As verificações de tipo/tipo de E2E/arquitetura passaram, Lint com 0 erros e 46 warnings existentes; nenhuma nova verificação em aparelho de outra plataforma.

GET /api/v1/marketing/touch retorna data.server_time, language e deliveries; cada uma usa os campos banner ou popup conforme resource_position, sem wrapper content. POST /api/v1/marketing/touch/action envia apenas campaign_id e action_type(confirm/cancel). As duas interfaces carregam X-Device-Mid, X-Client-Language, X-ZCode-App-Version e Authorization opcional.

O Banner é o nome do slot de recurso da interface e não indica a aparência de cartão no cliente. A camada externa da imagem não ganha borda, fundo, recorte de raio ou sombra, e a área transparente deixa a página aparecer; a imagem mantém a proporção original. O controle de fechamento/loading no canto superior direito mantém o estilo e a posição atuais, e o botão de imagem inteira mantém a indicação de teclado focus-visible. Desktop e Web do celular e todos os temas usam a mesma regra; este ajuste puramente de exibição não muda polling, preparação de recursos, actions ou estados de relatório. MTC-03 acrescenta asserções de componente sem decoração de cartão e verificação de estilos computados no App.

O texto do botão do Banner pode ser vazio (incluindo espaços em branco e HTML que fica vazio após a extração); havendo action close, mostra-se o X, e havendo action não-close, habilita-se o clique na imagem inteira — a existência da action não pode ser julgada pelo valor de verdade do texto. ConnectedBanner deriva hasAction/hasClose das actions e usa common.open/common.close localizados para rótulos vazios, apenas em aria-label/texto alternativo da imagem, sem novo texto visível. Sem a action correspondente, o clique na imagem inteira continua desabilitado e o X oculto; durante o pending, o clique continua desabilitado e o X é substituído por loading. MTC-04/08 acrescentam a verificação de clique, fechamento e relatório com texto vazio, e a semântica dos demais estados de veiculação/controle remoto não muda.

O `text.format` do botão do Banner permite ainda a string vazia `""`, e o Schema compartilhado normaliza uniformemente para `plaintext`, independentemente de o content estar vazio; não se rejeita a veiculação por causa disso. A regra vale apenas para `banner.buttons`, e título, descrição e botões do Popup independente e do success_popup ainda exigem plaintext/html/markdown; formato desconhecido ou ausente/null ainda é rejeitado. Segue-se o caminho original de parsing → preparação de recursos → exibição/relatório de action, sem mudar o owner de estado nem o encadeamento desktop/celular. O teste unitário MTC-01 valida o escopo e os valores inválidos, e as fixtures HTTP de MTC-03/04/08 usam format vazio e content vazio para verificar a action da imagem inteira, o fechamento, o loading e o relatório.

Regressão de formato vazio (2026-09-11): antes da mudança 2 testes falhavam; depois, 54 testes unitários de protocolo e 13 E2E de delivery no macOS passaram. Com um GET real retornando dois format vazios, o resultado corrigido do parsing é deliveries=1/rejectedCount=0; isso não representa ter verificado o resgate online. typecheck, E2E typecheck e architecture passaram, Lint com 0 erros/46 warnings existentes. Windows/Linux/aparelho móvel não foram executados separadamente e o ZIP do Hero não foi alterado.

Regressão de texto vazio (2026-09-10): antes da mudança a asserção do componente falhava, depois 16 testes unitários relacionados e 5 E2E do App macOS passaram. Na fixture HTTP o texto de action e de fechamento do Banner é vazio, e foram verificados o X visível, a imagem pura sem texto novo e os relatórios de clique/loading/sucesso e fechamento; tipos, tipo de E2E e arquitetura passaram, Lint com 0 erros/46 warnings existentes. Windows/Linux/aparelho móvel não foram executados separadamente e o ZIP do Hero não mudou.

Verificação de estilo da imagem pura (2026-09-10): antes da mudança o teste do componente reproduziu a falha da asserção de borda, depois 14 testes unitários relacionados e 5 E2E de delivery do App macOS passaram. Os estilos computados do navegador confirmaram 0px nos quatro lados, fundo transparente, raio 0px e sombra none; tipos, tipo de E2E e arquitetura passaram, Lint com 0 erros/46 warnings existentes. Não foi executada separadamente a aceitação visual dos dois temas/aparelho móvel/Windows/Linux; o caso permanece pending.

O DTO do serviço é separado do CloudContentPayload; o adaptador cria IDs internos de botão/revision de instância, e um identificador de mudança de conteúdo não serve como lote de veiculação. hero.args fornece dados de exibição por mapeamento explícito, sem credenciais e sem disparar negócio do host. Todas as URLs/hashes são verificadas antes do uso.

```text
Touch Service -> App Shell Controller -> fila de Banner / Popup -> CloudContentDialog
                       |                    |
                       |                    -> Asset Service -> verify -> decode/extract -> ready
                       -> registered action -> verificação de segurança -> claim -> confirm report
                                                           -> success_popup
```

O Service responde por HTTP/credenciais/IO de arquivo; o Shell Controller estável é o único owner do estado de exibição da janela e do polling. Trocar de workspace não cria outra instância de veiculação, e workspace remoto usa as capacidades do App local. main/relay/Agent não possuem estado de negócio de marketing. Componentes compartilhados e layout do celular são reaproveitados; o encadeamento de mensagens de task de desktop-continuous/web-remote-replayable permanece isolado. O lease de recursos não é o lease de task owner.

## Sequência de recursos e ações

A imagem do Banner é baixada, tem SHA-256 verificado e é decodificada antes de ser exibida; em caso de falha, é ocultada. O Popup prepara os recursos antes de abrir; se o recurso principal falhar, prepara o fallback e, sem fallback, degrada para o corpo e o fechamento. O vídeo é baixado por completo e verificado; o ZIP é extraído com segurança e recebe uma entrada controlada, degradando se o handshake ready após a montagem exceder o tempo. A declaração de tamanho do ZIP é opcional, os bytes reais/a expansão sempre têm limite e é proibido forjar tamanho. Permanecem as limitações existentes de ZIP 8MiB, expansão 32MiB etc. A fonte confiável é a configurada pelo host, e não se aceitam endereços arbitrários nem bypass por redirecionamento. O Web não usa o loopback do Desktop e, sem hospedagem segura do bundle, mostra apenas o fallback.

Depois de receber o Banner, o success_popup é preparado em background, sem pré-executar ação de negócio. Os recursos são reaproveitados por hash; cancelamento/troca de identidade/unload liberam as referências, e resultados atrasados não reabrem o conteúdo.

```text
ready -> login -> verifying -> submitting -> success-preparing -> result
                    |              |
                    -> cancelled   -> failed / uncertain
                           |               |
                           -> ready        -> reconcile or explicit feedback
```

Enquanto verifica/submete/aguarda o resultado dos recursos, a imagem não muda, não há máscara e o X no canto superior direito vira loading; um lock síncrono evita clique duplicado, com texto aria-live localizado. A entrada de interação da verificação de segurança continua disponível. Cancelamento ou falha claramente reexecutável restaura o X. A requisição fixa um snapshot de Campaign/action/success_popup, e o polling em background não pode substituir o Banner que está sendo operado. O sucesso do resgate determina o fato imediatamente; a atualização de benefícios/provider é paralela e best effort, sem reverter o sucesso. Timeout não reenvia automaticamente a requisição de escrita; sem capacidade de consulta/idempotência, dá-se um feedback explícito de resultado a confirmar. Todas as esperas têm prazo. Sem success_popup, usa-se feedback local de sucesso.

## Polling e exibição

Frequência por ambiente restaurada: em build oficial com `ZCODE_ENV=production`, o intervalo normal de polling é de 10 minutos; em build de teste ou desenvolvimento, 30 segundos. O jitter aleatório é removido, mantendo o backoff de falha e o refresh imediato por evento. Os antigos ManualClaimPlanBanner/ResultDialog e sua lógica auxiliar exclusiva e testes são removidos; o guia de seleção de modelo em uso no campo de entrada, o texto de falha compartilhado, o HTML/ZIP do Hero e as fixtures de teste são preservados.

```text
query concluída -> build de produção + env de produção ? 600s : 30s -> próxima query
oculto -> para o timer; eventos de retorno ao primeiro plano/sucesso etc. -> combinam-se em uma query imediata
```

Verificação desta rodada: 32 testes unitários relacionados e 3 E2E do App macOS passaram; os logs automáticos de query mostram 18:54:29.865 e 18:54:59.873, com intervalo de cerca de 30 segundos. As quatro combinações de ambiente (600s em produção e 30s em teste/desenvolvimento) são verificadas com precisão por fake timer. typecheck, typecheck:e2e e architecture passaram, Lint com 0 erros/46 warnings existentes. Windows/Linux/aparelho móvel não foram executados separadamente; o código antigo pode ser restaurado pelo histórico do Git, e o hash do ZIP do Hero não mudou.

O poller único substitui as requisições agendadas do Banner Billing Preview. Início/retorno à visibilidade/mudança de identidade/mudança de idioma/retorno da conectividade/sucesso de negócio disparam refresh; requisições em andamento idênticas são combinadas e, ao terminar, o agendamento é feito com setTimeout. Build oficial em ambiente de produção, 10 minutos; teste/desenvolvimento, 30 segundos; sem jitter aleatório; backoff exponencial de falha limitado a 10 minutos; pausa ao ocultar e requisição imediata ao voltar. Sucesso com array vazio limpa os candidatos, e a falha mantém por pouco tempo o último Banner válido (no máximo 10 minutos), sem tratar falha de rede como snapshot vazio. A geração de identidade invalida respostas antigas, e a troca de conta limpa a view da operação atual.

O Popup independente abre automaticamente quando seus recursos estão prontos, a página está visível e não há modal/camada de verificação de segurança. A janela de resultado tem prioridade sobre um Popup independente aguardando exibição; um Popup aguardando que seja removido é cancelado; conteúdo já aberto fica fixo até o fechamento e não muda com o polling. O mesmo Popup não é enfileirado de novo enquanto está em exibição, e depois de fechado pode abrir novamente quando o GET seguinte o reenviar. Fechar o Popup não afeta o Banner.

O servidor é o único owner da elegibilidade de veiculação; o cliente não guarda conjuntos processed/shown/reported por campaign_id, não usa claim por broadcast nem suprime outras janelas com eventos já processados. Cada janela exibe conforme seu próprio GET mais recente; o mesmo ID com o mesmo conteúdo pode ser exibido novamente em um envio posterior, sem necessidade de novo ID ou campo de lote. campaign_id só relaciona a veiculação atual ao relatório de operação e não é uma lista negra de histórico do cliente.

```text
GET -> recursos prontos -> exibição -> sucesso no clique/fechamento -> oculta a instância atual e reporta
                                            | descarta respostas em andamento anteriores à conclusão da operação
próximo GET -> o servidor ainda envia o mesmo ID -> recursos prontos -> exibição novamente
           -> o servidor não envia        -> sem exibição
```

Mantém-se apenas o pending atual do Controller contra clique rápido, a exclusão mútua de janelas e a proteção por generation contra respostas atrasadas. Ao concluir a operação, as consultas/preparações de recursos antigas são invalidadas e o Banner diferido antigo é liberado, sem deixar que o snapshot anterior à operação restaure o conteúdo recém-ocultado; novas requisições não sofrem restrição histórica. Após o sucesso, o refresh é disparado depois de a operação atual ser fechada; a requisição de resgate não é reenviada automaticamente. Uma nova exibição ou nova operação após fechamento/sucesso exige novo relatório, e eventos não podem ser engolidos por Campaign.

## Relatório

O usuário fecha o Banner/Popup independente -> cancel do campaign_id de origem; sucesso de negócio claro ou aceitação pelo host de um link externo -> confirm. Fechar um resultado bem-sucedido não repete cancel; cancelamento pela verificação de segurança, falha de negócio clara, remoção pelo polling e download não reportam confirm. Não há evento show online. Uma operação local gera um único evento, fechando a UI primeiro e reportando de forma assíncrona; o servidor não tem idempotência e o POST com resultado incerto não é repetido. Falha no relatório é registrada em log e não bloqueia o fechamento; eventos de conta antiga não podem ser enviados com credenciais novas.

### Regressão de autoridade de veiculação do servidor (2026-09-10)

- Antes da mudança 4 testes de regressão unitários falhavam; depois, 24 testes de Controller/Poller/Adapter/Resources passaram, cobrindo nova exibição e novo relatório do Banner de mesmo ID após sucesso/fechamento, nova exibição do Popup, ausência de sobreposição da janela atual e descarte dos snapshots de consulta/recurso/deferred anteriores à operação.
- 5 E2E de delivery do App macOS passaram (`desktop-e2e-20260910111749436-p19940-a7dcfa2d853c65d5`); a fixture faz o servidor decidir a remoção/reenvio mantendo o mesmo ID e verifica duas rodadas de espera automática de 30 segundos, sem contornar o filtro do cliente mudando o ID. A query concluída registrou 19:19:20.278 e 19:19:50.286, com intervalo de cerca de 30 segundos; o reenvio do Popup independente foi acelerado pelo evento online.
- 1 E2E de benefícios/conexão de modelo pós-resgate que usa a fixture compartilhada passou, confirmando que o ajuste da fixture do servidor nesta rodada não quebrou o fluxo vizinho.
- `typecheck`, `typecheck:e2e` e architecture passaram, Lint com 0 erros/46 warnings existentes. Controller/Provider tiveram remoção líquida de 87 linhas de produção; o ZIP do Hero não foi alterado. Os testes permanecem em manual-review/pending e não representam aceitação de resgate online/verificação de segurança real, múltiplas janelas ou Windows/Linux/aparelho móvel.

## Implementação e aceitação

P0 spec/fixture -> P1 DTO/service/adapter -> P2 assets -> P3 controller/poll -> P4 Banner/actions -> P5 popup/report -> P6 E2E/migration.

| Caso   | Cenário e asserções                                                          | Camada de verificação |
| ------ | ---------------------------------------------------------------------------- | --------------------- |
| MTC-01 | parsing independente dos dois slots de recurso; Banner ruim não afeta o Popup; action/layout desconhecida rejeitada | unit |
| MTC-02 | cabeçalhos necessários e ID original em GET/POST; troca de conta rejeita relatório atrasado; POST sem retry | service |
| MTC-03 | Banner oculto antes da validação/decodificação; hash errado rejeitado; reuso de cache do mesmo hash | integration/E2E |
| MTC-04 | cliques rápidos geram apenas um claim; X->loading; cancelamento da verificação de segurança restaura | unit/E2E |
| MTC-05 | troca de conteúdo durante pending não substitui o snapshot de action; isolamento de resposta atrasada | unit/E2E |
| MTC-06 | fato de sucesso não é revertido por falha de refresh; preload/degradação de falha/sem janela de resultado | unit/E2E |
| MTC-07 | Popup independente não se sobrepõe; mesmo ID reabre após fechamento; remoção do candidato cancela | unit/E2E |
| MTC-08 | close cancel, success confirm, close do resultado sem reenvio; falha não bloqueia | unit/E2E |
| MTC-09 | pausa/retomada em hidden, serialização, backoff de falha, array vazio, geração de idioma/identidade | unit |
| MTC-10 | sem interceptação de veiculação por histórico entre janelas; tela estreita/tema/teclado; degradação de bundle no Web | integration/E2E |
| MTC-11 | Banner de mesmo ID reenviado após fechamento/sucesso pode ser exibido e reportado; resposta antiga não pode ressuscitar a instância | unit/E2E |

A fixture usa endpoint local controlado, ZIP/hash reais e ledger de requisições, sem resgatar planos online. Exige architecture:check, typecheck, lint, testes unitários relacionados e E2E do App; plataformas/caminhos não executados de fato ficam com lacuna explícita. O estado dos testes e de conclusão é preenchido à parte, sem citar mocks antigos para fingir aprovação da integração oficial.

Varredura de impacto: must-inspect WorkspaceSidebar/ManualClaimPlanBanner/CloudContentDialog/CloudContentService/registro de serviço; should-inspect login e verificação de segurança, atualização de benefícios; invariant-only task runtime/remote replay. A ferramenta codegraph não está disponível e a verificação dos dois níveis de caminho usa busca precisa de chamadores. O mapa de funcionalidades já inclui a capability marketing-touch, o shell controller, os serviços de query/report e a fronteira inalterada do fluxo de mensagens de task.

## Limites da implementação atual

### Remoção do mock temporário do App

Remove-se a entrada「内容 Mock」、o componente de preview e o texto correspondente, além das RPCs de debug status/load/clear do CloudContentService, do mockOrigin fixo e do bypass de autorização de origem de desenvolvimento. Em todos os ambientes, o App obtém veiculação e autorização de recursos somente pelo Marketing Touch. Os recursos do Hero ZIP/HTML, o empacotamento e as fixtures de teste automatizado são preservados, e o servidor de teste não é ligado à cadeia de inicialização normal do App.

```text
App -> Marketing Touch GET -> autorização de URL/hash -> preparação/liberação do ZIP -> Dialog
runner de teste -> servidor de fixture independente (não é entrada de fallback do App)
```

Aceitação: o App não tem entrada de preview nem RPC de debug; ZIP sem autorização é rejeitado; ZIP autorizado com download/cache/iframe ready e confirm/cancel continua passando. Os casos exclusivos do painel de preview antigo são aposentados, e o E2E de Marketing Touch ganha uma asserção de inexistência da entrada. A sincronização de task/controle remoto e o conteúdo do pacote ZIP não mudam.

A função de texto de falha de resgate é isolada como módulo puro, e o Marketing Touch não traz mais payload de mock local indiretamente pelo Banner antigo. O componente antigo do Banner e seus testes exclusivos foram removidos, mantendo-se apenas a fixture de teste do Hero independente.

Verificação da remoção: 47 testes unitários relacionados, 2 testes de fixture HTTP independentes e 3 E2E do App macOS passaram (run `desktop-e2e-20260910100604307-p7477-2c05101905c03088`); as verificações de tipo/tipo de E2E e arquitetura passaram, Lint com 0 erros e 46 warnings existentes. O SHA-256 do ZIP preservado é `aae7d25f1618d27859152d4676f6b49902ef6bbfee761eee4313499f893eeb29`. Não foi executada separadamente a verificação em aparelho Windows/Linux/celular.

- Mídia permitida no download: PNG/JPEG/WebP (8 MiB) e MP4 (16 MiB); SVG/HTML arbitrário não são aceitos como imagem. A lista de recursos é concedida apenas por respostas GET verificadas pelo host, com URL + SHA-256, e em produção a entrada de mock de desenvolvimento continua desligada enquanto ZIPs autorizados ainda carregam. Imagem/vídeo são consumidos como data URL depois da validação, e o ZIP usa um serviço de recursos seguro separado. Requisições de rede duram no máximo 30 segundos e a decodificação no máximo 10 segundos; após a invalidade o resultado é descartado e o lease liberado, sem garantia de cancelamento de requisições de negócio que já chegaram ao servidor.
- Diretório de cache: `cache/content-bundles/<host-instance-uuid>/` sob o diretório de configuração do aplicativo do host, com extração segura e contagem de referências reaproveitando o ContentBundleCache existente; não se escreve no workspace nem se usa uma entrada do ZIP diretamente como caminho arbitrário de disco.
- Não se usa claim de marketing entre janelas nem broadcast de já processado; a verificação de segurança e as requisições de negócio só prometem a proteção síncrona contra clique duplicado do Controller atual. A validação de elegibilidade do servidor é a autoridade do fato de resgate entre janelas, e não se pode prometer exactly-once global sem chave de idempotência do backend.
- O Web reaproveita componentes e serviços do host, o bundle usa o fallback e não acessa o loopback do Desktop. Um Web/servidor independente sem deviceMid do host rejeita a consulta antes do HTTP e não forja nova identidade de dispositivo; o attachment de host do controle remoto e o enlace de realtime de task não mudam.
- Envios posteriores da mesma Campaign obedecem inteiramente ao servidor e não precisam de identificador de lote. Tema, internacionalização, estratégia de recursos multiplataforma e a semântica de mensagens de desktop-continuous/web-remote-replayable permanecem inalteradas.

## Registro de verificação de 2026-09-10

- Testes unitários relacionados: 12 arquivos com 50 testes passando; depois de adicionar o caso de ZIP de produção autorizado, os 3 testes de cloudContentService passaram (51 casos relacionados no total). Cobrem isolamento de DTO, autenticação e relatório, hash/cache/ZIP de recursos, degradação no Web, polling, cancelamento da verificação de segurança, recursos atrasados, snapshot aguardando operação e exclusão mútua de janelas.
- `pnpm typecheck` e `pnpm --filter @zcode/desktop typecheck:e2e` passaram.
- `pnpm lint`: 0 error, 46 warnings existentes; `pnpm architecture:check --changed`: 0 violation.
- E2E de delivery em Electron macOS: 3 passaram, run final `desktop-e2e-20260910085452990-p8774-6db97d91e9675478`. HTTP/ZIP/iframe ready reais, claim pendente observando loading e asserções de ledger para confirm/cancel e para a ausência de requisição de preview.
- E2E de entitlement em macOS: 1 passou, run `desktop-e2e-20260910085137939-p2018-6b1a685ecf45e04b`. Preservados a atualização de benefícios e a correlação de seleção Start/Individual e Subagent.
- Os dois novos E2E ficam em `packages/desktop/test/e2e/ui-shell/manual-review/pending/marketing-touch-*.test.ts`. Seguindo e2e-case-lifecycle, permanecem pending, e aprovação automática não representa aceitação visual manual nem promoção oficial para a suíte.
- Não executado: campanha/resgate real online, serviço real de verificação de segurança, múltiplas janelas em aparelho real, Windows/Linux, Web do celular e aceitação visual de tela estreita nos dois temas; fixtures locais não podem passar por essas verificações.

Confirmação do usuário em 2026-09-12 de promoção: os três specs (delivery, entitlement, anonymous) estão em `packages/desktop/test/e2e/ui-shell/`. Reexecução: `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/ui-shell/marketing-touch-*.test.ts'`, sem necessidade da flag MANUAL_REVIEW. A fixture fornece automaticamente Banner, Popup independente, Hero em ZIP, resgate pendente/liberado e ledger de relatório, sem acessar planos reais. Usa Electron local, sem Docker. As evidências mais recentes e os limites de cobertura estão em `docs/testing/marketing-touch-e2e-implementation.md`; o caminho pending acima é registro histórico.

# Restrições de correção de regressão de push (2026-09-11)

Quando o gate completo sofre um SIGSEGV nativo no pool de threads do Node 24/macOS, pode-se usar `ZCODE_TEST_POOL=forks` para passar os casos comuns ao modo de isolamento em dois processos; isso não muda o conjunto de testes, as asserções nem os grupos de isolamento serial existentes, e o padrão continua sendo threads. O processo que quebrou desta vez tinha PID 88256, o sistema reportou node-2026-09-11-200243.ips e ainda não é possível localizar com isso um defeito específico de V8/módulo nativo.

A integração de marketing não pode remover nem reverter traduções não relacionadas já existentes; o texto novo de marketing atual é preservado. O servidor de teste só monta as fixtures de marketing quando marketingTouch é habilitado explicitamente, e os testes antigos de plano não carregam o handshake de release de marketing. O teste de isolamento do Root substitui a subárvore de negócio de marketing na fronteira do Provider, evitando dependências incompletas e timeout de importação na primeira rodada; o negócio de marketing continua coberto por testes unitários dedicados e pelo E2E do App, sem modificar a lógica de seleção de produção.

```text
testes de plano antigo -> servidor padrão -> claim responde direto
E2E de marketing -> marketingTouch explícito -> claim espera -> release -> resposta
```