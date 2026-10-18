# Diálogo Público de Conteúdo na Nuvem: Plano Completo de Implementação e Aceitação

Data: 2026-09-04. Status: o mock de Desktop e os componentes comuns P0–P5 foram entregues; a integração em produção está fora do escopo desta rodada. O contrato atual e o modo de uso estão em `docs/cloud-content-dialog.md`, e as evidências de teste em `docs/testing/cloud-content-dialog-coverage.md`. O plano de fases e a linha de base abaixo são preservados como rastro de design e não representam lacunas atuais.

Entrega atual: o contrato e a validação de runtime de P0/P1, o serviço de recursos ZIP de Desktop em P2, os quatro tipos de Hero e o shell comum em P3, a entrada de mock HTTP do App em P4 e a adaptação do Weekend em P5 já estão implementados. O preview completo do App 4/4 e o Weekend 4/4 passaram; WebM/Lottie reais, download/verificação/cache/liberação de ZIP, HTML, botões dinâmicos, chinês/inglês, temas, layout de 390px e reduced-motion foram verificados. A encerramento complementa a restauração de foco ao fechar um diálogo controlado, e o resultado final está registrado de forma unificada no documento de coverage.

Iniciar o mock de desenvolvimento: `node packages/desktop/scripts/cloud-content-mock.mjs`, por padrão `http://127.0.0.1:4319/dialog`; em seguida, iniciar o dev do Desktop, escolher o conteúdo na entrada de preview no canto inferior direito e carregar. O mock já está conectado ao App; os parâmetros detalhados estão na spec atual.

P2 usa um diretório de cache exclusivo do host, URL de recurso com lease aleatório e liberação no fechamento/cancelamento na saída. O cache garante apenas o reuso dentro do ciclo de vida do mesmo host, sem promessa de cache persistente entre processos ou reinícios. Web/celular não têm hospedagem de recursos ZIP; apenas a compatibilidade do componente comum, a degradação para recurso inacessível e o build Web foram concluídos, sem se passar por aceitação em dispositivo real. P6 (CDN de produção/assinatura/entrega) e o banner público estão fora do escopo desta rodada.

Os novos E2E permanecem como manual-review/pending; a aprovação automática não equivale a promoção manual. Erros de rodadas anteriores e suas bases de correção permanecem registrados no documento de coverage.

## 1. Objetivo, Situação Atual e Limites

A aceitação se baseia nas evidências reais de execução do documento de coverage atual; o build Web ou o teste de desktop em tela estreita não equivalem a um teste real em celular.

Objetivo: dentro da entrada de desenvolvimento do App, obter o JSON do diálogo por HTTP real, baixar o ZIP, verificar e extrair, carregar um Hero isolado e exibir e executar por completo o conteúdo controlado declarado na nuvem. A campanha é apenas uma das partes; apresentação de novas funcionalidades e notificações podem reutilizar o mesmo componente.

### Linha de Base de Início (histórica, já substituída pela implementação acima)

| Item                          | Situação Atual                                                                    | Base                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Recurso independente do Weekend Hero | HTML já extraído, contendo céu estrelado, ingresso, entrada, inclinação, virada e Replay | `packages/ui/src/assets/cloud-content/weekend-plan-hero.html`                     |
| iframe                        | Já tem sandbox e mensagens básicas de init/ready/theme/visibility/destroy          | `packages/ui/src/components/cloud-content-dialog/CloudDialogHero.tsx`             |
| Dados de mock                 | Import de JSON local; adapter cobre texto dinâmico e URL de HTML do Vite; sem interface HTTP | `mockCloudContentDialog.ts` e `mocks/weekendPlanResultDialog.zh-CN.json` no mesmo diretório |
| ZIP                           | Não implementado; hoje `bundle.url` ainda aponta para HTML                         | idem                                                                             |
| Diálogo público               | Ainda não há um componente de shell completo; o Hero é usado dentro do diálogo de resultado do Weekend | `ManualClaimPlanResultDialog.tsx`                                              |
| Consumo de campos             | title/description e o comportamento dos botões ainda não são unificados e dirigidos pelo payload | idem                                                                             |
| image/video/lottie            | Apenas o tipo é declarado; o renderer não está implementado                        | `cloudContentDialogTypes.ts`, `CloudDialogHero.tsx`                               |
| HTML simples                  | A spec e o rascunho de teste já existem; o componente de produção não está implementado | `packages/ui/test/cloudDialogDescription.test.ts` referencia um componente ainda inexistente |

Acima registra-se apenas a situação no início dos trabalhos; naquela época, depois de adicionar os testes de HTML, a validação geral ainda não havia sido refeita com sucesso.

### Itens Confirmados e Excluídos

- Confirmado: fazer primeiro o diálogo; suportar image, video, animação interativa e lottie; recriar como recurso as animações e interações existentes; `bundle.url` é um ZIP; suportar HTML simples; validação completa de mock dentro do App.
- Não fazer nesta rodada: banner público, backend de operações, sistema de entrega automática/segmentação/prioridade/frequência, reescrita do business logic real de campanhas e capacidade de chamada de scripts remotos arbitrários no cliente.
- A integração em produção tem aceitação independente; sucesso do mock local não substitui a conclusão de lançamento.

## 2. Contrato de Dados: Cada Campo Tem um Consumidor Claro

Primeiro atualizar os tipos compartilhados e o schema de runtime, depois escrever os testes de contrato correspondentes. A seguir está o contrato v1 sugerido para congelamento, que não é a interface já implementada.

| Campo              | Semântica e consumidor                      | Validação/tratamento de falha                                          |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| schemaVersion      | Versão de protocolo escolhida pelo decoder | Versão principal não suportada rejeita a exibição e registra o motivo   |
| id / revision      | Identidade e versão do conteúdo; usados em log e registro de fechamento | ID não vazio, revision inteiro positivo; não é usado como chave de cache do ZIP |
| kind               | campaign / feature / notice                 | Não usar kind para injetar casos especiais do Weekend                   |
| locale             | Idioma real do conteúdo retornado           | A requisição carrega locale; o mock fornece fixtures em chinês e inglês, com o idioma de fallback explicitamente visível |
| dialog.title       | Componente de título comum                  | Texto puro, com limite de tamanho                                      |
| dialog.description | format + text                              | plain_text / html; a política oficial de suporte a markdown está nos itens pendentes |
| dialog.hero        | Renderer de tipo unión                      | Tipo desconhecido não é executado e degrada para sem Hero; o shell e o fechamento continuam utilizáveis |
| dialog.buttons[]   | Renderiza id, label, variant e actionId em ordem | ID único, limites de quantidade/texto, actionId precisa ser resolvível |
| actions            | Whitelist de ActionDispatcher do host       | Ações não declaradas ou indisponíveis não podem ser executadas; código dinâmico e nomes de serviço arbitrários são proibidos |

### Campos Exclusivos do Hero

| Tipo               | Campos                                                     | Responsabilidade do cliente                                            |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| image              | src, darkSrc?, alt, fit?                                   | Validação de origem HTTPS, escolha de imagem por tema, placeholder de falha de carregamento |
| video              | src, darkSrc?, poster, autoplay?, loop?, muted:true, fit?  | Reprodução muda, pausa em segundo plano/fechamento, exibição do poster se o autoplay falhar, respeito a menos efeitos |
| lottie             | src, darkSrc?, autoplay?, loop?, speed?, fallback?         | Política de JSON restrito e de recursos externos, destruição do player, degradação em erro; dependências verificadas antes para reuso |
| interactive_bundle | runtime, bundle, viewport, data, events, fallback?         | Download e parse dos recursos, isolamento do iframe, handshake, timeout e validação de eventos |

Recomenda-se adicionar ao interactive bundle `format:"zip"`, `sha256` e `sizeBytes`, mantendo `url` e o `entry` relativo. O SHA-256 deve ser realmente gerado no build, e não um hash placeholder para passar no teste. O viewport usa a proporção imposta pelo cliente, e o primeiro fixture continua 4:3. O campo data aceita apenas JSON de tamanho limitado, sem credenciais de conta, caminhos do host ou handles de serviço.

```json
{
  "bundle": {
    "format": "zip",
    "url": "http://127.0.0.1:<mock-port>/bundles/weekend-hero.zip",
    "entry": "index.html",
    "sha256": "<SHA-256 gerado após o empacotamento>",
    "sizeBytes": "<inteiro gerado após o empacotamento>"
  }
}
```

Isto é um template e não um fixture válido pronto para submissão; o gerador preenche porta, hash e tamanho inteiro. A exceção HTTP só é habilitada em modo dev/test explícito; em produção apenas origens HTTPS confiáveis são aceitas, e os redirecionamentos são validados novamente.

### Description e Ações

- HTML simples: manter p/br/b/strong/i/em/u/s/ul/ol/li/code/a/span/time, com o cliente controlando a diagramação. Proibir script, style, atributos de evento, imagens, formulários, conteúdo embutido e URLs perigosas. DOM não confiável não é montado diretamente na página; ele é reconstruído pela whitelist e as bordas do parser são testadas. Sugere-se limite de entrada de 20.000 caracteres e profundidade 32, com fallback para texto puro quando o limite for excedido.
- Links permitem apenas HTTP(S) absoluto, e o clique passa pela interface da plataforma; valores de negócio dinâmicos são escapados primeiro. Chinês, inglês, textos longos, listas e navegação por teclado precisam estar cobertos.
- `close` fecha somente a instância atual; `dismiss_content` significa não mostrar de novo, e os dois não podem ser confundidos. Recomenda-se que o dismissal do mock use um namespace exclusivo de dev; a frequência oficial por conta/versão fica para o design de entrega futuro.
- `navigate` permite apenas destinos registrados; `copy_text` e `open_external` só podem ser disparados pela ação do usuário em um botão do host.
- `claim_plan`, caso seja mantido, precisa passar pelo handler de negócio injetado, refazendo login/elegibilidade/confirmação/idempotência, e não pode ser executado pelo componente comum. O mock usa um handler sem efeito colateral real.
- Por padrão, os eventos de iframe permitem apenas eventos de exibição registrados, como Replay. Mensagens do iframe não podem ser mapeadas diretamente para ações sensíveis como resgate, navegação ou área de transferência; o comportamento de "evento desconhecido repassado com o ID original" é removido.

## 3. Arquitetura e Atribuição de Estado

```text
App dev preview / Weekend adapter
        |
        v
ContentSource -> HTTP JSON -> runtime schema -> Public ContentDialog
                                                   | title / description / buttons
                                                   |                    |
                                                   v                    v
                                              HeroRenderer       ActionDispatcher
                                                   |              -> injected handler
                                                   v
                                            ContentAssetResolver
                                                   |
                     +-----------------------------+--------------------+
                     | Desktop                     | Web/mobile         |
                     v                             v                    |
              local host asset service      platform asset adapter      |
              ZIP -> verify -> safe unzip   same bundle contract        |
              -> cache -> scoped URL        -> browser-loadable URL     |
                     +-----------------------------+--------------------+
                                                   v
                                            sandboxed iframe
                                       load -> init -> ready
```

| Estado/Fato                  | Owner autoritativo               | Cache ou espelho        | Ponto de aplicação do efeito |
| ---------------------------- | -------------------------------- | ----------------------- | ---------------------------- |
| Payload de conteúdo          | mock/serviço de conteúdo futuro  | cache em memória do ContentSource | Não altera o resultado do resgate |
| Estado de exibição/foco/carregamento | uma instância de Dialog | sem sincronização entre janelas | estado local do React |
| ZIP e integridade            | serviço de recursos de conteúdo  | cache por hash          | cache do App, sem gravar no workspace |
| Animação dentro do Hero      | iframe                           | sem espelho de negócio  | DOM/RAF próprio do iframe    |
| Navegação, compartilhamento, resgate | capacidades já existentes do host / business Controller | não copiado para o iframe | handler injetado |
| dismissal                    | por enquanto, só namespace de dev preview | por id+revision   | escopo oficial de conta a definir |

Main apenas injeta os caminhos de plataforma necessários e registra/encaminha o canal de recursos, sem assumir o download do ZIP nem o negócio de extração. A UI usa hooks/serviços com injeção de plataforma e não acessa diretamente Repo, sistema de arquivos ou window bridge.

### Cache do ZIP e Sequência de Falhas

Diretório sugerido (a registrar em caminho absoluto após confirmar a raiz de plataforma do runtime):

```text
<platform app cache>/content-bundles/
  staging/<unique-attempt>/
  <sha256>/index.html
  <sha256>/assets/...

absent -> downloading -> verifying -> extracting -> ready
                     failure -> discard staging -> retryable error
ready -> acquire lease -> render -> release lease -> eligible for eviction
```

- Todo IO é assíncrono; requisições concorrentes do mesmo hash são deduplicadas. Fechar a instância libera a referência; não se deve cancelar por engano o download ainda usado por outra instância.
- O tamanho e o tempo do download, o tamanho total após a extração, o tamanho de arquivo individual e a contagem de arquivos têm limites fixos no cliente, e a declaração do servidor não pode ampliá-los. A contagem real não pode confiar apenas nos metadados do ZIP.
- Rejeitar caminhos absolutos, `..`, links simbólicos, entradas duplicadas/conflitantes e escape de caminho entre plataformas; verificar se a entry existe e é um arquivo HTML permitido. Tratar ZIP bomb, hash divergente, download interrompido, disco cheio e escrita concorrente.
- Após a verificação do staging, fazer a promoção atômica no mesmo sistema de arquivos; caches incompletos ficam invisíveis. A URL de recurso expõe apenas caminhos dentro do pacote verificado, e não a capacidade de leitura arbitrária do disco.
- O cache é limpo por orçamento de volume e uso recente; recursos em uso não podem ser limpos. Limpeza de cache e retry oferecem controles de dev e evidências observáveis.
- Timeout de ready sugerido de 5 segundos e timeout de download único sugerido de 30 segundos, com os limiares concretos congelados após os testes e a validação de volume de recursos. Em caso de falha, exibir fallback ou Hero vazio, sem bloquear título/botões/fechamento.

### Limites Multiplataforma e Itens Desconhecidos

Fato: o adaptador de carregamento de recursos entre plataformas ainda não foi implementado, e o caminho do desktop não pode ser tratado como URL de celular.

Recomenda-se fazer uma verificação técnica antes de congelar o transporte: o Desktop usa um canal de recursos local restrito; Web normal/celular usa uma URL estática de descompactação do mesmo hash servida por um serviço confiável, ou um adaptador de recursos Web controlado. Qual das opções vale depende da capacidade de hospedagem existente, e não se deve adicionar silenciosamente um servidor público de recursos. Se for necessário encaminhamento via shared-host, reutilizar apenas o attachment de autenticação existente, sem iniciar outro Agent/runtime, e ler a documentação de arquitetura de acesso remoto antes de definir a interface.

É obrigatório validar sub-recursos do iframe, CSP, origem isolada, MIME, cache e comportamento de invalidação. Quando a Web normal ou o celular não tiver capacidade, fornecer um fallback explícito, sem afirmar que os quatro tipos de Hero funcionam em todas as plataformas. Quando o desktop estiver em workspace SSH/WSL/Docker, os recursos continuam pertencendo ao App local e não são enviados para o workspace remoto.

## 4. Limites de Segurança

- O hash do ZIP prova consistência de conteúdo, não a confiabilidade do publicador; em produção são necessárias ainda uma origem HTTPS confiável e uma política de autenticação de publicação, e se a assinatura é obrigatória depende da confirmação da arquitetura de publicação.
- O iframe mantém `sandbox="allow-scripts"`, sem same-origin/forms/popups/top-navigation, e não toca em Node/preload.
- O canal de recursos do host aplica CSP e isolamento de origem, e não pode confiar apenas no CSP que o HTML remoto traz junto. Restringir conexões externas de connect/frame/object/form, impedindo que um recurso exfiltre data acessando a rede por baixo dos panos.
- As mensagens verificam o contentWindow atual, instanceId, channel, tipo, whitelist de eventos e limite de payload; iframes antigos, outras janelas, ready duplicado ou mensagens fora de ordem não podem corromper o estado.
- O log de conteúdo não confiável não imprime HTML completo, data, credenciais ou URLs com parâmetros sensíveis; eventos de animação de alta frequência não entram no log info de produção.

## 5. Varredura de Impacto (Impact Brief)

Modo: planning. Camadas: presentation, validation, commit-effect, persistence. Sementes principais: CloudDialogHero, createWeekendPlanResultDialogMock, ManualClaimPlanResultDialog.

| Cenário/Entrada de UI                | Implementação compartilhada         | Origem padrão e validação               | Commit/persistência                    | Isolamento de modo                                    |
| ------------------------------------ | ----------------------------------- | --------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Resultado de resgate do Weekend     | Dialog comum + adapter de negócio   | resultado de claim existente, schema comum | navegação/compartilhamento/resgate pelo Controller original | não altera login/verificação de segurança/refresh do provider |
| App dev preview (novo)              | o mesmo Dialog                      | fixture HTTP, escolha explícita de cenário | ações de mock, dismissal/cache de dev | não depende de resgate real nem entra na entrada de produção |
| Web normal/celular                  | mesma UI, adapter de recursos diferente | mesmo schema + verificação de capacidade | navegação/capacidades da plataforma atual | não copia caminhos de arquivo do desktop nem estado de recuperação de task |

Compartilhado: parsing de campos, diagramação, protocolo do Hero e whitelist de ações. Diferenças: forma de carregar recursos, disponibilidade de ações de plataforma, dados de negócio da entrada e escopo do dismissal; não forçar a unificação do owner de negócio.

| Nível           | Relação e motivo                                                                      | Evidência                                                                                       |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| must-inspect   | ManualClaimPlanBanner -> ResultDialog -> Hero/mock; única entrada de produção já encontrada | o código dos componentes acima, chamadores diretos via rg, profundidade 2                     |
| must-inspect   | mock fixture -> tipos -> renderer; os três não estão completamente alinhados hoje      | o diretório cloud-content-dialog                                                                  |
| should-inspect | serviços de plataforma, canal de recursos e cache; nova fronteira de IO               | `packages/shared/src/platform.ts`; `packages/desktop/src/main/localMediaPreviewProtocol.ts` como semente adjacente, sem assumir reuso direto |
| conditional    | esquema de recursos acessível em Web/mobile                                             | adaptação de transporte pendente, sem estender o protocolo de task/Agent                      |
| invariant-only | autoridade de login/claim/provider, continuous/replayable, isolamento de workspace    | a cobertura existente de manual-claim e as restrições de arquitetura do repositório            |
| evidence-only  | teste unitário do Hero, manualClaimPlanBannerInteraction, start-plan-manual-claim-experience | testes existentes; não substituem os testes do novo fluxo de ZIP                      |

A ferramenta de codegraph não está disponível no momento, então usa-se rg preciso para rastrear as sementes acima e os chamadores diretos; não se trata todo componente estaticamente alcançável como impacto de funcionalidade. O feature graph atual já tem cloud-content-dialog/shared-cloud-dialog-hero e a relação com o Weekend. Graph drift: o nome pode fazer o leitor achar que a capacidade completa já está implementada, e isso deve ser esclarecido pelo status deste documento. Graph delta: a nova superfície de dev e as relações de asset-service/cache são propostas e devem ser reescritas depois que o esquema de adaptação for confirmado; esta rodada não registra como fato nenhum owner não implementado.

## 6. Fases de Implementação e Portões de Entrega

Convenção de migração da P5: o estado de sucesso do Weekend só constrói o payload, injeta as capacidades de navegação/cópia e o aviso local de cópia bem-sucedida, e não cria mais um shell próprio de botões/descrição; o estado de falha mantém a caixa de confirmação de negócio original. O componente comum mantém o limite de 480px, o Hero 4:3, botões na mesma linha com quebra e rolagem de conteúdo em tela estreita. O texto de cópia bem-sucedida é um label de localização do host, e uma mensagem de recurso não pode acionar a área de transferência. O Weekend de produção continua usando o HTML empacotado com o App como `resolvedUrl` explícito, sem depender do serviço HTTP de desenvolvimento; já o bundle do mock remoto precisa ser um ZIP real e passar pelo prepare do host. Essas duas origens precisam ser distinguidas nos tipos e na documentação, sem afirmar que a produção já está conectada à nuvem.

Ordem de cada fase: atualizar spec/casos -> escrever testes -> implementar -> verificar. Ao fim de cada fase, entregar o caminho dos artefatos, a saída dos testes e os riscos restantes.

| Fase                          | Trabalho                                                                              | Portão de conclusão                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P0 Contrato e verificação técnica | Congelar campos, política de erro e permissão de ações; verificar o carregamento de recursos em Desktop/Web; tratar o estado dos testes de HTML incompletos | desenho de schema/fixture/interface de adaptação consistente; esquema multiplataforma com evidências e pendências explícitas |
| P1 Recursos e mock HTTP      | Empacotar o HTML atual em ZIP; gerar hash/size reais; fornecer rotas de JSON/ZIP/cenário de erro e o comando de inicialização | conseguir requesting real do JSON e download do ZIP, com animação autocontida após a extração; sem troca fraudulenta por URL do Vite |
| P2 Serviço de recursos       | Download assíncrono, verificação, extração segura, cache, resolução de URL, cancelamento/limpeza/códigos de erro | primeira 다운로드, acerto de cache, cache contaminado, ZIP malicioso e concorrência aprovados em teste de integração |
| P3 Componente comum          | Shell do Dialog, quatro tipos de Hero, título, HTML simples, botões dinâmicos, ActionDispatcher, estados de carregamento/erro | mudar o JSON altera todos os campos visíveis e os comportamentos permitidos; sem caso especial do Weekend; teclado e foco funcionando |
| P4 Fechamento do mock no App  | Entrada de preview dev-only; escolha de cenário, tema/idioma, limpeza de cache, retry, informações de estado | cadeia completa visível dentro do App, do HTTP até ZIP/cache/iframe ready, sem login nem resgate |
| P5 Migração e regressão        | Migrar o adapter do Weekend para o componente comum; remover implementações temporárias duplicadas de descrição/botões; complementar a verificação multiplataforma | o fluxo original de resgate, o resultado de falha, a navegação e o compartilhamento se mantêm; os quatro tipos de Hero e chinês/inglês, dois temas e tela estreita passam |
| P6 Integração de produção na nuvem (independente posterior) | Trocar a fonte de dados, CDN confiável/autenticação de publicação, isolamento por conta, política oficial de entrega, rollout/rollback | contrato do servidor integrado e portões de segurança e publicação aprovados; enquanto não for concluído, só se fala em mock concluído |

Tanto P2 quanto P3 dependem do contrato de P0/P1, e só depois da confluência da P4 há um mock completo verificável pelo usuário. Não se toma "componente React pronto" como critério de conclusão.

## 7. Planejamento de Casos, Poda e Handoff de E2E

A entrada de aceitação do mock do App já entrou em implementação: `ui-shell/manual-review/pending/cloud-content-preview.test.ts` cobre os caminhos representativos de CCD-01/02/03/04/05/06. O caso possui um serviço fixture em loopback na porta 4319 (igual ao endereço padrão da entrada de desenvolvimento; se a porta estiver ocupada, o caso falha, e ele não conecta ao fixture de outra pessoa); o host usa um diretório de dados separado para E2E. Este caso não faz requisição de modelo nem resgate real; os casos novos permanecem pending, e a aprovação automática não equivale à promoção manual.

Registro de esclarecimentos: o usuário já definiu prioridade do diálogo, os quatro tipos de Hero, ZIP e HTML simples; as regras oficiais de entrega não foram definidas, e não se deriva de "diálogo público" uma estratégia de popup automático ou de não mostrar novamente.

Domínios incluídos: exibição de conteúdo, download/persistência de recursos, capacidades de plataforma e verificação de segurança. Fora da implementação: configuração de modelo, estado de conversation e runtime do Agent, mantendo apenas a regressão de isolamento.

Dimensões: tipo de Hero × validade do conteúdo × estado de rede/cache × tema/idioma/tela × capacidade de ação. Cruzamentos de alto risco: caminhos de ZIP e regras de caminho do Windows; múltiplas instâncias e cancelamento/limpeza; URLs de recurso em celular e desktop; HTML com links e interpolação dinâmica; eventos de iframe e permissão de negócio.

| Case ID | setup -> ação                                       | Asserções e camada de evidência                                                | Status                                       |
| ------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| CCD-01  | cache vazio -> abrir Hero interativo no App preview | requisições HTTP de JSON/ZIP, arquivo de cache correspondente ao hash, iframe ready, conteúdo vindo do fixture | accepted/planned E2E                        |
| CCD-02  | em cache -> reabrir/trocar revision com o mesmo hash | sem novo download do ZIP; novo texto em vigor, conteúdo do pacote igual; evidência de rede + arquivo | accepted/planned integration + E2E          |
| CCD-03  | 404/interrupção/timeout/hash errado/ZIP malicioso -> abrir | não executa recurso ruim nem deixa cache ready contaminado; fallback e fechamento utilizáveis | accepted/planned integration, um caso de erro representativo em E2E |
| CCD-04  | quatro tipos de Hero -> abrir, trocar tema, segundo plano, fechar | exibição correta, pausa/destruição, sem listeners ou animações residuais; UI+runtime | accepted/planned E2E                        |
| CCD-05  | chinês/inglês, tela estreita, HTML longo -> exibição/operação por teclado | diagramação, rolagem, restauração de foco, whitelist de tags, URL segura; UI+DOM | accepted/planned unit + E2E                 |
| CCD-06  | fixture alterando ordem/texto/action dos botões -> clique | renderização conforme os dados, apenas handlers registrados atingidos; ação desconhecida não executável | accepted/planned unit + E2E                 |
| CCD-07  | janela errada/instanceId/evento -> postMessage       | sem escrita cruzada de estado e sem efeito colateral de navegação, cópia ou resgate | accepted/planned unit + runtime test       |
| CCD-08  | várias janelas com o mesmo hash, fechar uma, limpar cache -> continuar usando | download não cancelado por engano; pacote em uso não removido; evidência de lease/arquivo | accepted/planned integration              |
| CCD-09  | Weekend com sucesso/pendente/falha -> ação           | asserções originais de refresh/navegação/compartilhamento do resgate inalteradas; descrição comum no sucesso, sem Hero na falha | accepted/update existing E2E               |
| CCD-10  | Desktop local/workspace remoto, Web/mobile -> abrir   | sem criar outro runtime; recurso acessível ou degradação explícita; sem alterar o fluxo da task | accepted/planned; esquema de transporte pendente |
| CCD-11  | markdown / estratégia oficial de dismiss_content     | semântica de produto não congelada, sem alegar cobertura                     | undefined                                   |

Poda: as variações de caminho do ZIP malicioso são enumeradas sobretudo na camada de integração do serviço, mantendo um caso no E2E; tema/idioma são cobertos em pares no renderer compartilhado, sem repetir a exaustão de todas as falhas de rede; o workspace remoto não é multiplicado por SSH/WSL/Docker, porque os recursos pertencem ao App, mas precisa de uma verificação de execução representativa. As combinações de entrega automática/controle de frequência por conta foram podadas por estarem explicitamente fora do escopo do mock, e não por suposição de suporte.

Fixture de E2E: mock server local independente em porta aleatória, raiz de cache temporária, geração de ZIP verificável e registrador de ações no lugar do resgate real; aguardar requisições/estado ready, sem sleep fixo. É preciso registrar evidências em três camadas: rede, arquivo e UI. O preset de Docker/container segue o harness existente quando implementado, e não se pode passar a formal-proof atual (que só cobre conversation) por cobertura do diálogo.

Backfill: foi adicionado `docs/testing/cloud-content-dialog-coverage.md` e a coverage existente do Weekend foi atualizada. Os novos E2E já foram implementados e passaram, mas permanecem como manual-review/pending, aguardando review humano, sem promoção automática; a tabela acima preserva o registro de design accepted/planned original.

Portões de qualidade: unit/integration focados, E2E do App, `pnpm typecheck`, `pnpm lint`, verificação de formatação dos afetados e build Web; itens que não podem ser testados de fato em macOS/Windows/Linux e em celular são listados explicitamente como risco, e não como aprovados.

## 8. Lançamento, Rollback e Itens Pendentes

A fonte de dados de mock e o preview são habilitados apenas de forma explícita em dev/test; o build de produção não mostra a entrada. Durante a migração, manter fontes de dados/adapters de negócio alternáveis, para que o rollback não reverta o estado de resgate do usuário. Protocolo desconhecido é rejeitado, falha de recurso degrada e o cache de versão é imutável; em produção é possível parar de entregar um determinado conteúdo, e o cliente ainda consegue fechar a instância já aberta.

Valores padrão sugeridos, a congelar antes da implementação:

1. A primeira rodada garante plain_text + HTML simples; markdown precisa receber diagramação segura ou ser explicitamente removido do conjunto suportado na v1, e não pode continuar "aceito pelo tipo, sem funcionalidade correspondente".
2. O mock é disparado manualmente primeiro, sem entrega automática; close não é persistido, e a semântica oficial de dismiss_content por conta e revision aguarda confirmação do produto.
3. O esquema de hospedagem de recursos em Web/mobile exige verificação técnica e confirmação da capacidade de deploy; se ela ainda não existir, só é possível anunciar o mock de Desktop concluído, não a conclusão em todas as plataformas.
4. Assinatura de publicação em produção, domínios confiáveis, orçamento de recursos e prazo de retenção ainda não estão definidos; esses itens bloqueiam a P6, mas não bloqueiam o desenvolvimento de fixture offline e do mock de Desktop.

Aceitação final do mock: dentro do App, apenas modificar/trocar o fixture HTTP já exibe a campanha ou a apresentação de nova funcionalidade; os quatro tipos de Hero, o título, a descrição em HTML e os botões dináticos têm efeito conforme os dados; o Hero interativo realmente passa por download e verificação do ZIP e pelo cache; primeira abertura, reabertura, falha e retry são comprováveis; os efeitos colaterais de negócio são controlados; o escopo de compatibilidade e as limitações restantes ficam claramente escritos.