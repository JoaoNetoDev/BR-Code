# Registro de Aceitação dos Diálogos de Conteúdo Público

Data: 2026-09-04. Origem da semântica dos cases: seção 7 de `docs/cloud-content-dialog-plan.md`
(accepted cases).

## Mapeamento de cobertura

Convenção mais recente do botão de fechar (2026-09-11): como um fundo Hero arbitrário não pode ser
inferido do tema do App, o diálogo de conteúdo público passou a usar um botão de overlay de mídia
circular: fundo preto com 50% de opacidade, ícone branco, sem borda, e no hover preto a 65%. O estilo
fica restrito ao diálogo de conteúdo público; tamanho, posição, foco, lógica de fechamento e
telemetria permanecem inalterados. Os testes unitários restringem o escopo do estilo, o E2E do App
verifica ícone nos temas claro e escuro, ausência de borda, fundo real e hover/restaurar ao sair; os
registros de ghost transparente e traço claro abaixo representam apenas versões históricas.

Regressão do botão de fechar: 8 testes unitários de componente e 13 E2Es de App no macOS passaram
(`desktop-e2e-20260911081628031-p81577-df8067a6323428fc`), com fundo real transparente por padrão,
não transparente no hover e restaurado ao sair. typecheck/typecheck de E2E/verificação de arquitetura
passaram, lint com 0 erros e 46 warnings preexistentes; Windows/Linux/mobile em máquina real não
foram complementados.

Posicionamento final em 2026-09-11 (sobrescrevendo os dois julgamentos temporários abaixo): a captura
de tela da janela real com `Page.captureScreenshot({fromSurface:false})` reproduz o bloco quadrado de
forma estável, e a captura da superfície de renderização padrão o perde. Depois de esconder o iframe
o bloco escuro desaparece; clip-path/mask da camada pai e border-radius do iframe são inofensivos; ao
desligar o backdrop-filter do DialogOverlay o bloco escuro desaparece. Diálogos com iframe interativo
mantêm apenas a máscara semitransparente, sem desfoque de fundo; outros dialogs de mídia e comuns
mantêm o desfoque original. Remove-se o clip-path inofensivo e mantém-se o raio de canto no topo do
Hero. A regressão precisa incluir a captura da janela real; acerto no DOM e captura padrão não são
suficientes para aceitar esse problema.

Verificação final: as capturas A/B da janela nativa do App do usuário não apresentam mais o bloco
escuro após desligar o backdrop-filter; 13 testes unitários em 2 arquivos passaram (iframe
interativo sem desfoque, imagem comum com desfoque), 12 E2Es de App isolado passaram, run
`desktop-e2e-20260911071241976-p81265-05dd209b62561d94`. typecheck/typecheck de E2E/verificação de
arquitetura passaram, lint com 0 erros e 46 warnings preexistentes. Não foram modificadas permissões
de iframe, protocolo de mensagens ou ZIP; não foi complementada a verificação em máquina real no
Windows/Linux/mobile.

Revisão de aparência em 2026-09-11: o diálogo de conteúdo público não exibe borda externa, mantendo o
raio de canto e a sombra originais; o slot Hero recorta por conta própria todo o meio (incluindo o
iframe) conforme o raio de canto do topo do diálogo, sem depender da implementação de raio nos
subrecursos. Mantêm-se a rolagem vertical do diálogo e a interação de fechar, e não se modificam o
Dialog global, o ZIP ou o protocolo de mensagens. Os testes unitários restringem o estilo do shell e
do recorte, e o E2E do Marketing Touch App valida a borda, o raio de canto e as regiões de acerto nos
cantos após um iframe real estar ready.

Complemento do feedback do mesmo dia: na captura do usuário ainda havia resíduo quadrado no raio de
canto do topo, e a asserção de acerto no DOM da rodada anterior não provava que a composição final
não transbordava. O App atual do usuário já carrega o estilo com raio de canto, e a captura via CDP
não reproduz o resíduo de forma estável, o que não permite afirmar que a causa raiz no Chromium foi
determinada. O slot Hero recebeu um clip-path explícito usando o mesmo token de raio de canto,
recortando toda a subárvore de composição da mídia; a sombra do shell e a rolagem foram mantidas. A
verificação precisa checar o clip-path computado e a captura real, e não apenas overflow e hit-test.

Verificação complementar: após o hot update, o valor computado no App atual é
`inset(0px round 16px 16px 0px 0px)` e a captura ampliada do topo no tema claro não mostra resíduo
quadrado; 12 testes unitários e 12 E2Es de App isolado passaram
(`desktop-e2e-20260911070253834-p64345-205b3da8a5ba0a07`), typecheck/typecheck de E2E/verificação de
arquitetura passaram, lint com 0 erros e 46 warnings preexistentes. Ainda é necessária a confirmação
do usuário no local; a captura via CDP não equivale a provar que o resíduo de composição original
dele necessariamente desapareceu; Windows/Linux/mobile não foram medidos.

| Case      | Evidência                                                               | Escopo                                                                                                               |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| CCD-01/02 | App pending preview + testes de contentBundleCache/cloudContentService | JSON HTTP, ZIP real, hash/size, URL de descompactação, ready, acerto de cache e re-download após limpar cache |
| CCD-03    | unit de cache/service/preview + caminho de hash inválido no App         | recusa de recurso ruim, sem iframe, preserva título/descrição/fechar, cenário válido pode ser retried |
| CCD-04    | unit de mídia + preview no App                                        | imagem real, decodificação WebM, canvas Lottie, Replay em iframe; dois temas; vídeo com reduced-motion/pausar ao fechar, unit de Lottie destrói |
| CCD-05    | unit de description + preview no App                                  | allowlist de tags, URL perigosa, limite de aninhamento, ZH/EN, viewport de 390px sem transbordo horizontal; não equivale a verificação Web em máquina real |
| CCD-06    | unit de dialog + preview no App                                        | ordem de campos/botões, desabilitado por falta de capacidade, single-flight, retry de falha, cópia com feedback local, ações mock registradas |
| CCD-07    | unit de Hero + checagem de iframe origin no App                        | contentWindow/instanceId/channel, rejeição de evento desconhecido; sem same-origin, não consegue ler o DOM pai |
| CCD-08    | integração cache/service                                                | acquire concorrente no mesmo serviço, múltiplos leases, proteção do pacote ativo ao limpar cache, cancelamento de download pelo host; hosts diferentes usam raízes independentes e não se declara cache compartilhado entre processos |
| CCD-09    | E2E existente start-plan-manual-claim-experience + unit de banner       | sucesso/pendente/falha, polling contínuo, copiar/Compartilhar, navegação para configurações de modelo/conexão; estado de falha não cria Hero |
| CCD-10    | tipos compartilhados, degradação de componente, Web build, viewport 390px | recursos do Desktop vão para o host local e não para o workspace; Web/mobile não têm entrada de loopback do Desktop; validação em máquina real e em workspace remoto não foi feita |
| CCD-11    | restrição explícita na spec                                             | markdown compatível apenas com o texto original; dismissal/frequência oficiais pertencem a uma entrega posterior e não são considerados cobertos |

## Evidências de execução

- Remoção do traço: 10 testes unitários de componente e E2Es direcionados do App macOS MTC-01/07/08 passaram (`desktop-e2e-20260911-110642-086`), com borda de 0px nos temas claro e escuro, fundo semitransparente e regressão de hover passando. Arquitetura e lint passaram; a verificação de tipos ainda tem erros de migração de modelo preexistentes; não foi adicionada verificação em máquina real multiplataforma.

- Botão de fechar de mídia em 2026-09-11: 10 testes unitários de componente e E2Es direcionados do App macOS MTC-01/07/08 passaram (`desktop-e2e-20260911-110305-161`), com medição de ícone branco/traço claro nos classes claro e escuro, preto a 50% por padrão/65% no hover/restaurar ao sair, e o cancelamento da telemetria. architecture-governance foi usado para limitar o escopo de estilo da UI pública e e2e-case-lifecycle preservou a regressão pending. Lint com 0 erros e 49 warnings preexistentes; a verificação de tipos completa e de E2E continua bloqueada por erros preexistentes de migração de interface de modelo. Uma execução acidental da suíte completa de marketing teve outras falhas de case e não serve como evidência de aprovação completa desta mudança; Windows/Linux/mobile em máquina real não foram verificados.

- Sem borda/corte do topo em 2026-09-11: primeiro foi adicionado um teste unitário que falhou, e só então a correção; 12 testes unitários em 2 arquivos passaram. 12 E2Es do Marketing Touch App isolado no macOS passaram, run `desktop-e2e-20260911065419725-p49538-44fd937cd2b33621`, incluindo o canto superior do iframe real sem acerto, raio de canto igual ao do shell, borda 0 e a regressão de interação original. A inspeção das capturas mostrou o corte do topo normal. typecheck, typecheck de E2E e verificação de arquitetura passaram; lint com 0 erros e 46 warnings preexistentes. Desta vez não foi complementada a verificação em máquina real no Windows/Linux/mobile nem a aceitação visual completa nos dois temas, e a fronteira de compatibilidade original não muda.

- Preview completo do App: 4/4 passaram, `packages/desktop/.e2e-artifacts/desktop-e2e-20260904040413280-p12214-57effa9488fe0d38/summary.md`, incluindo tela estreita/reduced-motion, fechar o conteúdo voltando ao botão de carregamento e fechar o painel voltando à entrada, com as asserções de foco.
- Regressão final do Weekend: 4/4 passaram, `packages/desktop/.e2e-artifacts/desktop-e2e-20260904040659110-p17722-92d58f3c5b964911/summary.md`.
- Web build, typecheck da raiz e typecheck de E2E passaram; lint com 0 erros e 40 warnings originais.
- Testes focados finais: 80/80 passaram em 10 arquivos (incluindo as duas regressões de foco); 2/2 do mock HTTP em Node passaram.

## Problemas encontrados durante as execuções

1. A nova dependência de ZIP foi inlined no ESM main/host, e o Electron reclamou na entrada com `Dynamic require of "fs" is not supported`. O yauzl foi externalizado, listado como dependência de runtime do Desktop e incluído na verificação de dependências do artefato; o App real iniciou e concluiu os cases de ZIP, e foi adicionado um teste de regressão de tsup.
2. Em duas regressões do Weekend apareceu um clique extra de "configurações de modelo → voltar para a workspace" durante a espera de polling; o log prova que o resultado foi fechado por close e não por descarregamento do owner. A rodada sem essa operação extra passou 4/4; o diagnóstico de eventos de entrada do teste foi mantido e a máquina de estados de polling não foi alterada com base nisso.
3. O `safeParse` já chegou a lançar exceção diretamente no refine de `https://`; foi adicionada uma verificação prévia com URL.canParse, mais um teste de URL inválida.
4. O teste de tela estreita chegou a amostrar 421px durante a transição de largura (viewport alvo de 390px); com a adição de uma espera de convergência de layout a fronteira original foi mantida, sem afrouxar o CSS de produção.
5. O diálogo controlado não tem Radix Trigger, e após o fechamento o foco padrão ia para o body. Depois de reproduzir no teste unitário, foi adicionado registro/fonte da origem e restauração, e o painel de preview usa DialogTrigger; o carregamento assíncrono desabilita temporariamente o botão e faz o activeElement se perder, então o preview passa explicitamente um returnFocusRef do lado hospedeiro (não é um campo vindo da nuvem). As asserções de foco do botão de carregamento/entrada no App real passaram.
6. Na reexecução de encerramento do Weekend, uma delas teve timeout na expansão do submenu de modelo de Subagents depois de o diálogo de resgate fechar e a navegação de configurações/atualização de benefícios completar; apenas o diagnóstico da cena de falha foi adicionado, sem modificar a lógica de negócio de modelo nem afrouxar as asserções. A reexecução com o mesmo código de produção passou 4/4. Essa instabilidade de interação não prova a causa raiz e é mantida como risco de estabilidade do E2E, sem alegar que foi corrigida.

## Limitações e aceitação manual

- Os novos cases de preview permanecem em `ui-shell/manual-review/pending`, sem promoção automática.
- A verificação atual é no Electron do macOS; Windows/Linux/mobile real não foram medidos. As restrições de caminho multiplataforma são cobertas por testes unitários do serviço e não se passam por resultado de execução em plataforma.
- Hospedagem de ZIP na nuvem para Web/mobile, confiança/assinatura/distribuição pelo CDN de produção não estão integradas. O cache do Desktop garante apenas reuso dentro do ciclo de vida do mesmo host.
- As ações dos cenários mock não chamam o negócio real; a fronteira real de resgate é verificada pelo E2E do Weekend existente e não faz requisições a campanhas online.