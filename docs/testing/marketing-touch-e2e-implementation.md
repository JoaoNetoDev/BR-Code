# Especificação de implementação deplemento do Marketing Touch E2E

### Refresh ao concluir tarefa (2026-09-18)

MTC-TASK-COMPLETE corresponde ao [acordo do cliente](../marketing-touch-client.md#任务完成后刷新2026-09-18).
Spec candidata: `packages/desktop/test/e2e/ui-shell/manual-review/pending/marketing-touch-task-completion.test.ts`.
O caso inicia uma tarefa pelo composer real e recebe sucesso de um fixture sintético local do case com atraso no texto, durante a execução reinicia o cronômetro de polling pelo ponto de entrada online já existente, e então afirma que uma nova requisição HTTP de marketing aparece em até 15 segundos, excluindo um falso positivo do polling de 30 segundos. Não promovida; não representa verificação de entrega real do servidor nem em dispositivo real de celular.

Cobertura de testes unitários: histórico/duplicata de conclusão não dispara, falha/interrupção não dispara, conclusão de nova execução, agrupamento de conclusões do mesmo lote, baseline de reconexão, RPC readiness, passagem de workspaceIdentity/endpoint remoto e liberação da referência no unmount. Provider desktop/Web ambos verificam que a entrada de refresh de conclusão reaproveita a coalescência em voo do poller; comportamento oculto segue a regressão do poller.

Verificação: 39 testes unitários aprovados; macOS App E2E `desktop-e2e-20260918-092233-578` 1/1 aprovado, runner exit 0. A primeira execução foi bloqueada pelo onboarding de primeiro uso da conta isolada, e o caso candidato passou depois de acrescentar o fechamento público por Esc. typecheck, desktop typecheck:e2e, architecture e verificação de formatação aprovados; lint 55 warnings / 0 errors. A combinação desktop/Web Provider e a identidade remota têm evidência de teste unitário; o controle remoto ponta a ponta em celular e Windows/Linux não foram verificados.

### Regressão de hover do Banner (2026-09-15)

Estende o MTC-BUNDLE existente: mouse real entrando/saindo do Banner do App, observando no iframe isolado o postMessage de hover true/false do host; mantém pointer-events:none, o cache original e uma asserção cada para confirm/cancel. macOS Electron `desktop-e2e-20260915-125754-599` 1/1 aprovado (6,7 segundos, runner exit 0). 14 testes unitários de UI aprovados, cobrindo ready, pending, touch, blur, hidden e reduced-motion dinâmico. 11 testes unitários do workspace de recursos externos e a regressão de navegador dos três pacotes aprovados (incluindo o CSS transform real do cartão). O App E2E usa um fixture ZIP isolado para validar o protocolo, e não um ZIP de entrega on-line; não foram verificados Windows/Linux, dispositivo real de celular nem substituição por servidor real. Nenhuma nova action de negócio nem ampliação do limite de controle remoto.

Status: em 2026-09-12 o usuário autorizou continuar a implementação; itens incompletos não podem ser substituídos por auditoria concluída.

### Decisão de promoção (2026-09-12)

Antes do push, os testes unitários completos revelaram que o caminho de captura de tela já existente em delivery não atendia ao gate de caminho de runtime do E2E. As quatro capturas passam a gravar uniformemente no `ZCODE_E2E_ARTIFACT_DIR` fornecido pelo runner, falhando explicitamente quando ausente, sem gravar em diretório temporário do sistema e sem alterar as asserções de negócio; o gate de caminho original é mantido como teste de regressão.

O usuário ajustou o limiar para 90% (excluindo Lottie) e exigiu explicitamente a promoção. Já existem 60 casos aprovados da mesma rodada e evidência de Renderer em 90,07%; esse número não representa cobertura de todo o domínio de execução. Os três specs de marketing-touch foram movidos para o diretório oficial `packages/desktop/test/e2e/ui-shell/`, preservando o fixture HTTP isolado existente e todas as asserções. No caminho oficial não há dependência do switch MANUAL_REVIEW, o Electron local foi verificado novamente, sem Docker e sem push. Plataformas ainda não cobertas e as fronteiras restantes da matriz histórica continuam registradas e não passam a ser cobertas com a promoção.

O dry run da ferramenta padrão de promote recusou o caminho ui-shell (só suporta conversation-session); portanto migrou-se dentro do domínio original e corrigiu-se o caminho relativo do helper, sem forçar a migração para conversation-session e sem gerar fixture de replay DeepSeek sem relação.

Verificação de promoção concluída: `desktop-e2e-20260912-042005-517` executado no caminho oficial, em Electron local sem MANUAL_REVIEW definido, **60/60 aprovado, runner exit 0**. anonymous 2 casos (44,6 segundos), delivery 57 casos (4min 28,3s), entitlement 1 caso (3,9s), log em `/tmp/marketing-formal-e2e.log`. Testes unitários relacionados 31/31, typecheck, desktop typecheck:e2e, lint (45 warnings existentes / 0 errors) e architecture (0 violations) aprovados. Os três specs sofreram apenas renomeação e ajuste de referência de helper, com todas as asserções preservadas; o padrão `test/e2e/**/*.test.ts` inclui o caminho oficial. Código de produto inalterado; os 90,07% são evidência da rodada de cobertura anterior e a cobertura não foi remedida nesta rodada. Docker não foi executado e nada foi enviado. O backend do Goal original ainda mantém a meta antiga de 95% e não permite substituir uma meta não concluída; esse estado do painel não pode ser considerado sincronizado com a mudança do usuário nesta rodada.

### Decisão de escopo mais recente: excluir Lottie (2026-09-12)

O usuário exigiu explicitamente "ignorar lottie". Esta aceitação de 95% não cobre a implementação exclusiva de Lottie, não remove código de produto e não adiciona protocolo de marketing Lottie; o bloqueio de escopo que aguardava autorização para a extensão Lottie foi resolvido. O denominador completo histórico e o teto de 93,71% abaixo são mantidos apenas como registro da metodologia antiga e deixam de ser o teto de aceitação atual.

O escopo excluído são as duas funções `CloudLottie` / `LottieResource` de `CloudDialogMediaHero.tsx`, mais `cloudLottieRuntime.ts`; atualmente 84 linhas executáveis de diferença. São mantidos image/video no mesmo arquivo, o ambiente comum e a lógica de dispatch do Hero; não se pode excluir arquivo inteiro de código compartilhado. Os itens excluídos devem ser listados separadamente, sem reescrever o relatório de cobertura anterior; as ferramentas de auditoria futuras precisam aplicar mecanicamente o mesmo escopo, sem tomar o recálculo manual como gate de cobertura completa.

Recalculado a partir de `desktop-e2e-20260912-035844-296` da mesma rodada: a lista unificada de código-fonte tem **1252 linhas restantes (1336−84)**; as linhas de diferença mapeadas do Renderer têm **816 linhas restantes (900−84)**, com acertos ainda em **735 linhas, ou seja 90,07%**. Esse recorte de Renderer precisa de mais 41 linhas acertadas para chegar a 95%; não é uma cobertura global entre domínios. A normalização geral de acertos confiáveis, os casos accepted restantes e o gate completo ainda precisam ser concluídos; continua sem promoção e sem push.

### Registro de verificação do denominador unificado

A lista unificada de código-fonte usa transpilação TypeScript ESNext/JSX-preserve fixa (sem tree-shake), depois instrumentação Istanbul, e volta às linhas de início das statements do arquivo original pelo source map compilado. Todos os domínios de execução compartilham essa lista, contando apenas linhas do diff do Git; import/puro tipo/espaços em branco não contam, e enums etc. são mantidos depois de serem transpilados para código de runtime. Falhas de parse ou statements geradas sem mapeamento original precisam ser listadas explicitamente como unknown, sem encolher o denominador silenciosamente. Esta etapa apenas estabelece canonicalExecutableLines, não projeta contadores brutos de Node em acertos confiáveis e não muda o recorte histórico de 900 linhas do Renderer; a cobertura geral final ainda depende da verificação da confiabilidade dos acertos e de todo o escopo.

Execução real de `/tmp/marketing-canonical-audit.json` (merge-base fixo até `a27a0446ae`, código de produto igual ao atual) deu **41 arquivos e 1336 linhas executáveis de diferença**, com falhas de parse e unmappedStatements ambos em 0. Lottie Hero 48 linhas + runtime 36 linhas = 84 linhas; o único uso de produção atual de CloudContentDialog é MarketingDialogs, e o visual body de marketing não tem entrada Lottie. Portanto, nesta lista completa, mesmo com cobertura total das demais linhas, o teto é `(1336 - 84) / 1336 = 93,71%`. Isso difere do teto anterior só do Renderer, e agora há evidência de teto para a lista completa. Foi solicitada novamente ao usuário a decisão sobre autorizar a complementação do protocolo Lottie e de entradas reais; sem autorização, o protocolo não é ampliado e o denominador não é reduzido, e os demais cenários accepted continuam avançando.

4 novos testes de lista (somente tipos, enum/namespace, JSX/função não chamada, código inválido) e os 8 testes de diagnóstico existentes passaram; typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors), architecture e diff check aprovados. Apenas a ferramenta de auditoria e dependências/documentação fixas foram modificadas; os counters de E2E não foram reexecutados nem mesclados, e não se afirma que a cobertura geral real já foi calculada.

Os contadores brutos da conversão V8 original do Main apresentam casos de "linha de código-fonte não gerada contada como 1": no source map da mesma rodada, `contentBundleCache.ts` tem mapeamento apenas das linhas 1–14 e 24–26, mas o relatório contam as linhas 50–54 como 1 e o fnMap está vazio. A ferramenta de diagnóstico recebeu uma checagem cruzada pelo source map de build por domínio de execução: antes de ler o map do out atual, é preciso casar um a um o SHA do build-source-evidence desta rodada; ausente, alterado ou não fresh-stable marca apenas unverified, e o artefato atual não pode ser usado para ratificar relatórios antigos. O relatório mantém a contagem original e lista separadamente positiveLinesWithoutGeneratedMapping; são contagens suspeitas e não um novo denominador de cobertura, sem remover o escopo de código-fonte e sem gerar um percentual global.

Verificação do relatório original de `desktop-e2e-20260912-032342-498`: `/tmp/marketing-generated-map-audit.json` aponta 759 no Main e 112 no Host linhas de diferença com contagem positiva sem mapeamento gerado correspondente, sendo que o hash do map Main de `contentBundleCache.ts` casa e a contagem original não tem evidência de código gerado correspondente. Isso inclui linhas em branco/de tipo etc., então não pode ser contabilizado inteiramente como linha executável não coberta. Os 8 testes de diagnóstico deste lote passaram, typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors) e architecture aprovados; apenas ferramenta de diagnóstico/dependências/documentação mudaram, o App não foi reexecutado, o relatório de cobertura original não foi alterado e o geral continua nulo. trace-mapping usa fixamente a versão 0.3.31 do lockfile existente; apenas a declaração de dependência raiz é acrescentada, sem atualizar outras dependências.

Analisar o código-fonte original diretamente com o parser TypeScript/JSX do `istanbul-lib-instrument` exclui import, interface e type, mas o experimento confirmou que ele não gera statement para `enum` de runtime. Portanto esse resultado não pode ser usado diretamente como denominador unificado de linhas executáveis de todos os domínios. Esse candidato não foi ligado à estatística e não altera os relatórios de cobertura existentes; é preciso verificar depois a conversão de compilação e o source map, mantendo unknown para o que não for identificado.

Executar em conjunto os três specs pending atuais, com `ZCODE_E2E_SOURCE_EVIDENCE=1` ligado, verificando o resultado da mesma rodada e a impressão digital do código-fonte; aprovações por lotes históricos não equivalem a aprovação completa da mesma rodada.

### Décimo primeiro lote: 48 casos da mesma rodada e recuperação do relatório de cobertura

`desktop-e2e-20260912-025655-416`: delivery 45, entitlement 1, anonymous 2, total **48/48 aprovados**, com os três specs levando 6min 59s. Log em `/tmp/marketing-full-source-e2e.log`. A lista de build está fresh-stable e o código-fonte não mudou antes/depois do build.

O runner original encontrou ENOSPC ao gerar o relatório de cobertura Node no onComplete e **saiu com 1**, não podendo ser registrado como verde de ponta a ponta. Depois de comprimir sem perda os JSONs de cobertura antigos desta tarefa já encerrados, a finalize do Node collector original foi reutilizada com os dados brutos da rodada atual e o comando de recuperação saiu com 0; em `/tmp/marketing-full-source-recovery.log`, complete de Main/Host/CLI é true e missingRawProcessCount e baselineFailureCount são 0. Nenhum caso foi reexecutado ou reescrito e nenhum counter foi mesclado entre execuções.

Após a recuperação, `/tmp/marketing-full-source-audit.json`: linhas de diferença mapeadas do Renderer **721/900 = 80,11%**, funções 178/222, ramos 609/885; a identidade de código-fonte de Renderer/Host/Main casa e a de CLI não é verificada. O mapeamento de linhas físicas do Node e as anomalias por domínio de execução continuam existindo e o percentual global permanece nulo. Casos aprovados, coleta recuperada e cobertura de código atendida são três conclusões diferentes, e esta rodada ainda não atingiu o Goal de 95%. Regressão da ferramenta de auditoria 7/7 aprovada; este lote é só mudança de documentação, sem alterar produto nem código de teste, o estado pending permanece e nada é enviado.

### Décimo segundo lote: mensagens inválidas em iframe real

Dois casos independentes novos de MTE-11: um ready com instanceId errado segue o timeout original e o fallback de imagem; um iframe com ready normal continua ready após enviar mensagens null, com instance/channel errados, com campos error/action/resize inválidos e com type desconhecido — sete categorias no total — sem placeholder de erro nem report automático, e reportando cancel uma única vez quando o usuário fecha. A marcação dentro do ZIP confirma que o ready errado foi realmente enviado; as mensagens inválidas entram pelo WebDriver no sandbox iframe real e são enviadas por postMessage, sem chamar diretamente a função de validação.

`desktop-e2e-20260912-031121-888` com novo build **2/2 aprovados** (19,7 segundos), runner saiu com 0, evidência de código-fonte fresh-stable; log em `/tmp/marketing-instance-e2e-final.log`. A primeira rodada `030940-602` falhou na preparação por usar um formato de parâmetro de switchToFrame incompatível e, após mudar para o uso existente de switchFrame, foi reexecutada, sem contar a primeira rodada como defeito de produto nem como evidência de aprovação. 13 testes unitários de fixture, typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors), architecture e diff check aprovados. Apenas mudanças de teste e fixture, sem alterar o produto. Atualmente há 50 casos independentes com registro de aprovação; esta rodada rodou apenas os dois novos e não se reivindica aprovação dos 50 na mesma rodada; os contadores de cobertura não são mesclados entre rodadas e o Goal de 95% continua inacabado.

### Décimo terceiro lote: recuperação de falha de claim em Popup

Três casos independentes de MTE-12 para "知道了"/Esc/máscara, todos entregando o Popup com botão de claim pelo fixture HTTP existente. Depois de retornar `<b>今日额度已领完</b>` e o texto com quebra de linha, valida-se texto puro, msg ignorada e o Popup original oculto; fechando o aviso, o campaign original é restaurado, o botão fica clicável, o HTTP de claim continua em 1 e events fica vazio; só quando o usuário fecha em seguida o Popup original é reportado cancel uma vez, sem incremento de claim. Não houve mock de Controller nem de callbacks de componente.

`desktop-e2e-20260912-031447-923` **3/3 aprovados** (24,5 segundos), runner saiu com 0, lista de código-fonte fresh-stable; log em `/tmp/marketing-popup-failure-e2e.log`. typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors), architecture e diff check aprovados. Este lote é só de teste e documentação, e não foi encontrado defeito de produto que exigisse modificação. Acumulado: 53 casos independentes com registro de aprovação; esta rodada só acrescentou três, sem reivindicar tudo na mesma rodada nem os 95% globais; tudo continua pending e sem push.

### Décimo quarto lote: timeout de cópia e sucesso tardio

Dois casos novos de MTE-13 cobrindo os dois ramos de timeout com o Popup permanecendo aberto/ já fechado. A Promise da plataforma de clipboard do navegador fica pendente e contada uma vez; durante o pending, clicar em X não fecha e não reporta; aguardando o timeout real de capacidade de 10 segundos, o erro é exibido e o botão é restaurado; quando a Promise antiga é cumprida, não há sucesso exibido, nem confirm complementar, nem Popup ressuscitado. No final, apenas o cancel por fechamento do usuário, uma vez. O finally libera a Promise e restaura os métodos da plataforma do navegador.

`desktop-e2e-20260912-031836-096` **2/2 aprovados** (35,9 segundos), runner saiu com 0; log em `/tmp/marketing-copy-timeout-e2e.log`. typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors), architecture e diff check aprovados. Apenas mudanças de teste e documentação, sem alterar a semântica de timeout ou fechamento do produto. Acumulado: 55 casos independentes com registro de aprovação; esta rodada rodou apenas os dois novos, sem mesclar contagens entre rodadas e sem representar 95% atingidos; continua pending e sem push.

### Décimo quinto lote: resultado tardio na preparação de recursos

Novo caso de corrida de MTE-06 para fechamento real de Popup e ZIP de Banner em voo: o gate HTTP de recursos deixa o ZIP pendente e só o libera depois de fechar o Popup; o próximo GET chegando é a fronteira de fechamento da preparação antiga, confirmando que o Banner antigo não aparece e que só o fechamento do Popup gera cancel; depois de liberar o próximo GET, o iframe do Banner fica ready, confirmando que um novo envio da mesma atividade continua válido. Apenas foi adicionado um gate HTTP isolado e o produto não muda; reset/stop libera a espera, o finally libera recursos e GET, e o conteúdo do ZIP não é modificado. O arquivo principal de fixture continua com 398 linhas.

`desktop-e2e-20260912-032342-498` **1/1 aprovado** (9,5 segundos), runner saiu com 0, lista de código-fonte fresh-stable; log em `/tmp/marketing-resource-stale-e2e.log`. 14 testes unitários de fixture validam o novo pending/reset e o protocolo original; typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors), architecture e diff check aprovados. Acumulado: 56 casos independentes com registro de aprovação; esta rodada só acrescentou um, sem reivindicar tudo na mesma rodada nem os 95% globais; permanece pending e sem push.

### Décimo sexto lote: navegação para provider customizado

MTE-02 cria um provider vazio pelo template Custom real, lê o providerId do nó, navega primeiro para a aparência e depois volta ao provider customizado pela ação de marketing; confirma que o alvo fica selecionado e que o HTTP de confirm, o snapshot da conexão persistente e o modelo atual do workspace não mudam. No finally navega de volta à configuração, clica em excluir e confirma, e o nó desaparece; não grava key real, não chama serviço de modelo e não modifica arquivo de configuração diretamente.

`desktop-e2e-20260912-033816-286` **1/1 aprovado** (11,2 segundos), runner saiu com 0; log em `/tmp/marketing-custom-provider-e2e.log`. A verificação de tipos inicial encontrou que um atributo DOM pode ser nulo; depois de acrescentar a verificação explícita de exceção, typecheck e desktop typecheck:e2e passaram, assim como lint (45 warnings existentes/0 errors), architecture e diff check. Apenas testes e documentação novos, sem nova correção de produto. Acumulado: 57 casos independentes com registro de aprovação; esta rodada rodou só o novo, sem representar tudo na mesma rodada nem 95% atingidos; todos pending e sem push.

### Décimo sétimo lote: reduced-motion de vídeo

Estende o MTC-RICH existente: usando a simulação de mídia do Chromium via Puppeteer do Renderer atual, verifica-se que com reduce video.paused=true/autoplay=false e com no-preference a reprodução é restaurada; o ID de elemento WebDriver é o mesmo antes e depois das duas trocas, e os HTTP events não mudam. O finally limpa a simulação e continua a verificação de reporte da ação original de cópia. Não houve substituição de matchMedia/métodos de reprodução nem alteração de preferência do sistema.

`desktop-e2e-20260912-034307-178` **1/1 aprovado** (12,7 segundos), runner saiu com 0; log em `/tmp/marketing-motion-e2e.log`. typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors), architecture e diff check aprovados. Apenas um caso existente foi estendido, o total de casos independentes continua 57, e não se reivindica cobertura do reduced-motion dinâmico do Hero bundle nem de dispositivo real de celular; o Goal de 95% e a decisão de escopo de Lottie continuam inacabados. Permanece pending e sem push.

## Revalidação de 60 casos da mesma rodada (2026-09-12)

`desktop-e2e-20260912-035844-296`: Electron macOS local, anonymous 2, delivery 57, entitlement 1, **60/60 aprovados na mesma rodada**; cada spec levou 52,5 segundos, 8min 11,1s e 9 segundos. Log em `/tmp/marketing-full-60-coverage-e2e.log`, ledger de resultados `test-results.ndjson`. Cobertura e evidência de código-fonte ligadas, impressão digital de build fresh-stable. A inicialização anterior que havia esquecido o switch de cobertura foi abortada e não conta como aceitação.

O runner original encontrou ENOSPC na geração do relatório HTML de CLI no onComplete, saiu com 1 e não pode ser vista como verde de ponta a ponta. Recuperação após comprimir relatórios antigos: a primeira falhou na checagem de integridade porque o JSON original já estava comprimido, e a segunda ainda falhou por falta de espaço; depois de liberar mais espaço de páginas derivadas antigas, a terceira usou a finalize do collector original com sucesso (`/tmp/marketing-full-60-recovery-3.log`, exit 0). complete de Main/Host/CLI é true em todos, missingRawProcessCount e baselineFailureCount são 0; a contagem de arquivos originais é 127/126/220. Nenhum counter foi mesclado entre rodadas e a falha do runner original fica preservada.

Auditoria após a recuperação `/tmp/marketing-full-60-audit.json`: merge-base de staging fixo até `c1cd829aeb`, linhas de diferença do Renderer **735/900 = 81,67%**, funções 184/222, ramos 634/885. A identidade de código-fonte de Renderer/Host/Main casa e a de CLI continua não verificada; o mapeamento de linhas físicas do Node não pode ser evidência de cobertura unificada de linhas executáveis, e overallCoverage continua nulo. Os 95% não foram atingidos e ainda faltam cenários accepted e o recorte entre domínios, portanto não há promoção nem push.

O tratamento de disco envolveu apenas relatórios gerados por esta tarefa: a maioria dos HTML/JSON antigos foi compactada sem perda com gzip; foram apagadas as páginas derivadas `coverage/ui-renderer-html` das rodadas `025655-416`, `010639-844` e `013813-308` (cerca de 112 MB), mantendo os respectivos coverage-final.json.gz e os dados de base, que podem ser regenerados. Não se apaga código-fonte, pacotes de recurso ZIP nem configuração do usuário.

## Feature Summary / Impact Brief

Segue a [auditoria](marketing-touch-e2e-audit.md) para UI Surface Matrix, comportamentos compartilhados/divergentes, gradação de relação, owner de estado, pontos de commit, invariantes e limitações do codegraph. O modo passa de impact-only para planning / implementation-handoff; o escopo é o negócio de marketing deste branch em relação ao staging, correções de migração de provider necessárias, testes e ferramenta de cobertura, sem estender as ações remotas. A ferramenta de grafo de código está indisponível no momento, e são usados os caminhos de chamada confirmados pela auditoria reconferidos contra o código-fonte atual.

## Clarification Log / Boundary Decisions

| Decisão                     | Status                 | Escopo                                                                                              |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------- |
| Corrigir falhas existentes, completar P0/P1 | accepted             | O usuário exigiu explicitamente que o Goal continue até o fim; inclui defeitos de produto necessários, não apenas mudança de asserções                                          |
| Cobertura                   | accepted             | O usuário ajustou para 90%, excluindo Lottie; Renderer atual em 90,07%, sem se passar por resultado global entre domínios; funções/ramos listados separadamente, sem completar números com testes unitários |
| Capacidade de ação                 | accepted             | Manter close/open_url/claim/navigate/copy_text; não criar tarefa, não trocar modelo, não instalar/pagar automaticamente               |
| Migração da API antiga              | bug-candidate → correção | Usar providerSettingsService.refresh com a estrutura atual de providerId/conexão; não restaurar serviço desativado                   |
| Ciclo de vida de testes             | accepted             | Cenários e limpeza locais do case; promover quando o usuário autorizar, com tudo aprovado, verificando só com Electron local, sem Docker e sem push |
| Terceiros/plataformas              | pruned combinations  | A checagem de segurança de versão oficial usa substitutos determinísticos de callback; compra real/elegibilidade de produção não é executada. Execução em macOS não substitui Windows/Linux/dispositivo real de celular |

## Domain Scope / Concept Map / State Owners

O Controller de marketing é o único dono da exibição, do pending e do snapshot de operações; o Marketing Service é dono da verificação de sequência de processo/credenciais; o servidor é dono dos fatos de entrega e de claim; o antigo providerSettingsService é dono do refresh de provider; o BundleCache é dono dos recursos e do lease; os antigos componentes de configuração/marketplace/compra são donos dos fatos de assunção do alvo. O fixture de teste é dono apenas das respostas de serviço isoladas e do ledger de requisições, sem alterar diretamente o estado do Controller.

## Dimensions / High-Risk Cross-Products

| Dimensão   | Classes de equivalência                                     | Combinações de risco                                |
| ------ | ------------------------------------------ | --------------------------------------- |
| Posição de recurso | Banner / Popup / success_popup             | fechar × reportar; resultado × novo diálogo independente          |
| Ação   | close / copy / navigate / claim / open_url | em voo × clique duplo/troca de conta/resposta tardia           |
| Rede   | normal/vazia/falha/timeout/retorno lento                   | poll × fechamento de ação; report × mudança de credenciais      |
| Mídia   | image / video / bundle                     | ready/error/timeout × fallback/sem fallback |
| Navegação   | settings/marketplace/upgrade               | alvo carregando/ausente/já ativado × sem efeito colateral       |
| UI     | light/dark, zh/en, tela estreita/desktop, teclado          | estilo de fonte/recorte/foco × tamanho do texto           |

```text
case reset -> cenário HTTP isolado -> GET/recurso/RPC reais do App
                                  -> ação do usuário -> UI e asserções de ledger/configuração persistente
case finally -> derrubar cenário/liberar resposta pendente -> fechar modal residual -> voltar ao workspace

claim success -> entitlement snapshot paralelo + providerSettingsService.refresh
                  -> qualquer falha de refresh é apenas registrada, sem reverter o sucesso e sem trocar a conexão do usuário
```

## Candidate Combinations / Accepted Cases

Os itens a seguir são todos cenários accepted dos contratos existentes; o estado de implementação concreta é atualizado nos registros de verificação e não autoriza a alegar que já estão cobertos.

| ID     | Setup                                               | Action                   | Assertions                                                   | Evidência                 |
| ------ | --------------------------------------------------- | ------------------------ | ------------------------------------------------------------ | -------------------- |
| MTE-01 | Qualquer falha anterior/modal residual                             | reset do cenário e execução independente     | Consistente com a execução combinada; sem poluição de entrega/ledger antigo                            | App/HTTP             |
| MTE-02 | provider family/account/custom atual e snapshot de conexão válido  | navigate para o provider especificado   | Alvo selecionado; conexão/modelo/tarefa inalterados; ausência dá falha explícita                 | App/configuração persistida         |
| MTE-03 | claim bem-sucedido; refresh normal/recusado                           | Clicar em reivindicar                 | O provider atual tem refresh com chamada real e ainda bem-sucedido em caso de falha; conexão inalterada             | App/RPC/regressão de serviço     |
| MTE-04 | Popup independente/de resultado                                     | X/Esc/máscara/conteúdo close    | cancel independente uma vez; resultado não é reportado de novo; foco utilizável                       | App/ledger           |
| MTE-05 | anonymous/login e checagem de segurança normal/cancelada/falha              | Cliques repetidos em reivindicar                 | claim único, cancelamento restaura, sem retry automático                             | App/HTTP             |
| MTE-06 | Mesmo ID entregue, GET/recurso lento, ação pending               | Fechar/resultado antigo chega depois de sucesso    | Conteúdo antigo não ressuscita; novo envio pode ser exibido e reportado novamente                           | App/HTTP             |
| MTE-07 | normal/falha/oculto, mudança de identity/locale                | poll e refresh de eventos          | Política de ambiente 30s/600s; serial, recuperação, backoff, retirada por vazio                  | App/fronteiras de timer       |
| MTE-08 | Primeiro processo do serviço, falha, requisições concorrentes                        | GET/POST, troca de conta/idioma     | Parte de seq=0 e incrementa sem repetir; POST não conta; cabeçalhos necessários/anônimos               | App/ledger HTTP anonimizado |
| MTE-09 | report 500/queda de conexão/troca de conta                            | close/sucesso               | A UI não bloqueia, não dá retry e não reporta evento antigo com credencial nova                      | App/HTTP             |
| MTE-10 | ZIP em cache frio/quente, hash diferente, pacote/fonte inválidos               | exibir/retirar/reentregar           | Validação e descompactação reaproveitadas, liberação de lease, recurso ruim não exibido                       | App/Host/evidência de arquivo    |
| MTE-11 | bundle ready/error/não ready/source ou instance forjado | receber mensagem/mudar tema/ocultar/fechar  | Exibição só com handshake confiável; fallback ou oculto; limites de ação                    | App/iframe real      |
| MTE-12 | Tradução do servidor, message vazio/inválido, claim dentro do Popup         | Falhar e fechar o aviso           | Texto puro, sem msg, restaura o Popup original; sem retry/report                    | App/HTTP             |
| MTE-13 | Cópia normal/falha de permissão/timeout/tardia                         | Cliques repetidos, fechamento           | Texto exato, feedback e reporte após sucesso, recuperação em falha, sem criar tarefa             | App/área de transferência             |
| MTE-14 | Definir padrão/seções, homepage/detalhe/ausente do mercado                 | navigate                 | confirm após assunção do alvo, reutilização de alvo existente, sem instalar, sem confirmação errada entre identidades     | App/configuração             |
| MTE-15 | Fixture real da página de upgrade ready/falha/pendente                  | abrir, fechar antes/timeout      | Sem confirm antes do ready; recuperação em falha; entrada original de upgrade inalterada                 | App/webview real     |
| MTE-16 | HTML/Markdown/plaintext + class/style/theme         | exibir e clicar               | Estilos seguros, sem interação aninhada, links tratados por plataforma, tema e tela estreita utilizáveis         | App/DOM/captura de tela         |
| MTE-17 | imagem dark/vídeo, falha de decodificação/reduced-motion                  | exibir/ocultar/restaurar           | Recursos por tema, pausar/restaurar, fallback, Banner 96px                | App/mídia             |
| MTE-18 | Benefício novo/antigo/conexão com estrutura atual                          | Refresh e troca explícita de conexão do usuário   | Apresentação do benefício e linkage de candidatos de Subagent, sem ser sobrescrita pela navegação de marketing               | App/HTTP/configurações        |
| MTE-19 | erro de visualização de provider                                 | Exibir aviso de erro Root e repetir | Sem crash por import de ícone ausente, retry pelo serviço original                       | App/regressão de componente         |
| MTE-20 | Limite de ciclo de vida do App/suporte Web                           | dispose/saída/bundle Web  | Liberação de recursos; fallback Web sem contornar o shared-host; sem_diffusão da semântica de task | Host/verificação representativa multiplataforma  |

## Pruning Decisions / Questions For User

MTE-15 acrescenta ao webview HTML de upgrade os três casos de queda de rede, fechamento enquanto pendente e timeout de navegação de 30 segundos. O fixture HTTP isolado controla a resposta da página e não forja o evento de conclusão do webview; em caso de falha, o Popup de marketing original é restaurado, sem confirm. Depois de liberar a resposta pendente, o resultado antigo não pode complementar o reporte; só um novo clique explícito com página realmente ready reporta um confirm. O finally restaura o serviço ready e stop/reset libera a espera; não envolve compra/pagamento.

A primeira rodada `desktop-e2e-20260912-034815-613` teve três falhas na asserção do aviso de erro: `CloudContentDialog` desmonta a instância quando open=false, e o aviso de falha de upgrade é responsabilidade do toast externo de `MarketingDialogs`, não se pode exigir que a nova instância restaurada mantenha o `role=alert` interno. A asserção de recuperação foi reposicionada para localizar o Popup e checar texto, botão utilizável, ausência do container de upgrade e events vazio; ainda é obrigatório verificar que só o retry explícito gera confirm, sem modificar o comportamento de aviso do produto. O usuário exigiu atingir o objetivo e promover depois que tudo passar, e a verificação de promoção usa apenas o Electron local, sem Docker; as condições de promoção ainda não são atendidas.

Após a correção, `desktop-e2e-20260912-035557-133` no Electron local passou nos três casos (38,7 segundos, runner exit 0), log em `/tmp/marketing-upgrade-fault-e2e-2.log`. Testes unitários de fixture 15/15, typecheck, desktop typecheck:e2e, lint (45 warnings existentes/0 errors) e architecture aprovados. Atualmente 60 casos passaram individualmente em momentos distintos, o que não equivale a aprovação completa da mesma rodada; os 95% gerais ainda não foram provados, sem promoção e sem push.

```text
navigate de marketing -> webview de upgrade real -> HTML fail/hold
  -> queda/fechamento/timeout -> restaura Popup original (events=0)
  -> libera HTML antigo -> usuário clica de novo -> novo webview ready -> confirm=1
```

MTE-17 acrescenta dentro do caso MTC-RICH existente de Banner de vídeo o ida e volta de reduced-motion: depois de a Emulação do Chromium definir prefers-reduced-motion=reduce, o vídeo real pausa com autoplay=false; após no-preference, a reprodução é restaurada, o nó de mídia não é substituído e nenhum evento de marketing é gerado. O finally limpa a simulação de mídia, sem mudar configurações do sistema ou mockar matchMedia; continua usando MP4 codificado pelo Electron exibido após download/preparo pelo serviço.

MTE-02 provider customizado: criando um provider vazio pelo template Custom na página real de configurações e lendo o providerId real do nó de navegação; depois de sair da seção de modelos, o navigate de marketing localiza esse ID, seleciona o alvo e confirma o reporte, mantendo o snapshot da conexão persistente e o modelo atual do workspace inalterados. O finally limpa o provider pelo botão de exclusão/caixa de confirmação, sem escrever configuração diretamente e sem configurar API key real ou enviar requisições de modelo.

MTE-06 invalidação na fase de recursos: um Popup já exibido sem Hero permanece aberto, o download de um novo ZIP de Banner fica pendente no fixture HTTP; o usuário fecha o Popup invalidando o snapshot de preparação antigo e, ao liberar o ZIP, o Banner não é exibido nem há reporte extra. O próximo GET enfileirado chegando serve como fronteira síncrona de conclusão do processamento de recursos da rodada anterior; liberando esse GET, um novo envio do mesmo Banner pelo servidor pode ser exibido. O gate de recursos só controla o timing de resposta do fixture, reset/stop liberam e o conteúdo/hash do pacote não muda.

```text
Popup exibido -> novo GET de Banner -> ZIP pendente
  -> usuário fecha Popup -> geração inválida -> ZIP concluído -> descarta resultado de preparação antigo
  -> próximo GET chega e fica pendente (rodada anterior já fechada) -> Banner inexistente
  -> libera novo GET -> mesmo Banner pronto -> exibição normal
```

MTE-13 acrescenta a capacidade da plataforma de cópia pendente: intercepta-se a Promise de clipboard.writeText do navegador, mantendo o timeout real de capacidade de 10 segundos do App; durante o pending, o fechamento não tem efeito e não reporta cancel, e no timeout o botão é restaurado com o erro exibido. Cumprindo a Promise antiga tanto com o Popup original aberto quanto já fechado, em nenhum caso há confirm complementar, exibição de cópia bem-sucedida ou ressurreição do Popup. A interceptação age só na fronteira de plataforma e não modifica Controller, temporizadores nem resultado de negócio; o cumprimento da Promise antiga não representa escrita real na área de transferência e este caso não reivindica verificação do conteúdo copiado.

```text
copy -> Promise de plataforma pendente -> pending (fechamento rejeitado)
  -> timeout real de 10 segundos -> erro + retry possível
  -> [Popup preservado / usuário fecha Popup] -> Promise antiga resolve -> sem confirmar sucesso
```

MTE-12 acrescenta os três pontos de entrada de fechamento do aviso de falha de claim dentro do Popup ("知道了"/Esc/máscara): o HTTP devolve a message de texto puro do servidor (contendo literal HTML), e durante o aviso de erro o Popup original não é exibido; fechando o aviso, a mesma atividade é restaurada, a requisição de claim continua sendo só uma e sem reporte, e só quando o usuário fecha em seguida o Popup original é reportado cancel uma vez. O fixture reutiliza as interfaces existentes após claim-failure em action-delivery, sem nova entrada de produto nem fallback de temporização.

```text
Popup original -> usuário reivindica -> HTTP falha -> Popup original oculto + aviso de erro
  -> 知道了/Esc/máscara -> Popup original restaurado（claim=1，events=0）
  -> usuário fecha Popup original -> cancel=1(claim continua 1)
```

MTE-11 complemento deste lote: o ZIP real, após o init, retorna um ready com instanceId errado e precisa permanecer não pronto, passando a fallback pelo prazo original de 5 segundos; o iframe já ready, enviando instanceId/channel errados e estruturas de mensagem inválidas, não pode virar estado de erro, fechar o diálogo nem reportar. O teste apenas manipula respostas de recurso independentes e postMessage real do navegador, sem chamar a função de julgamento de mensagem do produto. O componente do App continua sendo o único owner da readiness do iframe, e o estado de negócio do Controller e o protocolo de ações não mudam.

```text
App init(instance A) -> ZIP ready(instance B) -> ignorar -> timeout ready original -> fallback
iframe já ready -> mensagem inválida -> ignorar -> continua ready -> usuário fecha -> cancel uma vez
```

Não expandir o produto cartesiano de todos os temas × idiomas × ações × plataformas; cada efeito colateral/fronteira de falha é coberto isoladamente e os eixos puramente estilísticos são validados por combinações representativas. Os ramos públicos do componente de Lottie e o texto de falha antigo sem entrada de chamada em produção precisam ter seu escopo verificado primeiro, e não se pode injetar funções internas via teste para chegar a 95%. Se for preciso mudar o protocolo, restaurar comportamento antigo ou adicionar entradas de negócio exclusivas de teste, registrar e pedir decisão primeiro. A correção atual e os contratos já definidos acima não precisam de nova confirmação.

## Matrix Backfill / E2E Handoff

O documento de auditoria mantém os resultados originais sem sobrescrever o histórico; este arquivo registra a fase de implementação; a semântica de produto continua sendo definida por marketing-touch-client.md/actions.md. Casos novos ficam em ui-shell/manual-review/pending; o fixture HTTP existente de coding-plan é estendido com cenários locais do case e a checagem de segurança usa substitutos sintéticos, porque o terceiro é não determinístico. ZIP/mídia/webview reais, sem acesso a claim on-line. Cenários de fixture isolado não reutilizam contagens absolutas de ledgers antigos.

A cobertura fixa primeiro o baseline e o mapeamento de linhas executáveis; a fusão de falsos acertos de arquivo inteiro entre domínios fica desabilitada, e código de negócio que não entrou no bundle também precisa ser listado. Passar por código em caminho de falha de execução não conta como aprovação de comportamento. Testar antes de corrigir, executar typecheck/typecheck:e2e/lint/architecture; commitar ao final, sem push; a promoção ainda exige confirmação manual.

## Verification Log

### Décimo lote: evidência de código-fonte de build

Com `ZCODE_E2E_SOURCE_EVIDENCE=1` definido explicitamente, o WDIO calcula o SHA do código-fonte de packages/\*/src antes e depois do novo build do desktop e registra os hashes reais de JS/CSS/HTML/map do App staged em `build-source-evidence.json`. Só é marcado fresh-stable quando o código-fonte é o mesmo nas duas medições e há artefato; mudança, SKIP_BUILD ou App empacotado não ratificam o código-fonte atual. Cobre apenas Renderer/Host/Main do desktop e não prova a CLI construída ou reutilizada depois. Toda IO é assíncrona, sem escrever código-fonte ou credenciais e sem imprimir o corpo do código-fonte.

```text
impressão digital do código-fonte A -> fresh build -> stage App -> impressão digital B + impressão digital dos artefatos staged
A=B e há artefato -> fresh-stable -> auditoria compara o SHA HEAD arquivo a arquivo
	reuso/empacotado/mudança -> unverified -> proibido ratificar relatórios antigos
```

Verificação: E2E de novo build `desktop-e2e-20260912-024849-286` 1/1 aprovado (9,9 segundos); a lista está fresh-stable, com 2451 impressões digitais de código-fonte e 5236 de artefatos staged e sem mudança antes/depois do build. A auditoria `/tmp/marketing-source-audit.json` para o código-fonte auditado no momento dá Renderer/Host/Main como true e CLI como false, e o percentual total continua nulo. 5 testes unitários de coleta, 7 testes de auditoria, typecheck, desktop typecheck:e2e, lint, architecture e diff check aprovados. Esta rodada foi um smoke de coleta de evidência e não uma aceitação de cobertura completa; relatórios antigos não foram preenchidos e a versão do código-fonte da CLI não foi provada.

### Nono lote: diagnóstico de cobertura entre domínios reproduzível

Novo comando de auditoria somente leitura `node scripts/marketing-touch-coverage-audit.mjs <base> <head> <run-dir>`: fixa o diff do Git, lê separadamente o mapeamento Istanbul de Renderer/Host/Main/CLI, suporta `.json.gz` e registra o SHA do código-fonte auditado. Arquivos/domínios ausentes são marcados unknown; o mapeamento físico linha a linha do Node e registros sem função são marcados com aviso de anomalia, e a presença de UI/Services em domínios inesperados também gera aviso. Só emite métricas por domínio, **sem emitir cobertura total entre domínios nem conclusão de atendimento**; o SHA do código-fonte serve apenas para rastreabilidade e ainda não prova que o build do relatório é consistente com o código-fonte.

A ferramenta é um substituto reproduzível de diagnóstico para scripts temporários e não redefine o denominador de 95%. A lista unificada de linhas executáveis e a verificação de impressão digital de build continuam incompletas, e as métricas de linhas físicas do Node ainda não podem servir de métricas de linhas executáveis. Arquivos só de tipo e não mapeados continuam listados explicitamente, e a remoção implícita seguida de percentual alto é proibida.

O décimo lote seguinte completa a falta de código-fonte para execuções do desktop com coleta de evidência ligada; relatórios históricos sem lista e a CLI continuam não verificados. O recorte unificado de linhas executáveis continua inacabado.

```text
base/head fixos -> linhas de diff + impressão digital do código-fonte
execução única Renderer/Host/Main/CLI -> mapeamento/anomalia/unknown por domínio
  -> verificação manual de domínio e mapeamento（sem total entre domínios, sem conclusão automática de 95%）
```

Verificação: 6 testes Node aprovados, cobrindo remoção/adição no diff, escopo de código-fonte, unknown, aviso de linha física do Node, isolamento por domínio e gzip e recusa de relatório corrompido. Executando a auditoria sobre `desktop-e2e-20260912-020726-877`, a saída `/tmp/marketing-cross-domain-audit.json` dá Renderer 684/900, Host com mapeamento original 1003/1072, Main com mapeamento original 1045/1072 porém com 0 funções/0 ramos, e 8 arquivos de Services aparecendo no domínio Main são sinalizados. Os dois últimos não são cobertura unificada de linhas executáveis e não podem ser somados nem se escolher o maior; 4 arquivos não mapeados são mantidos. typecheck, desktop typecheck:e2e, lint e o gate de architecture passaram. Este lote não alterou o App, não acrescentou casos de E2E e não reexecutou o App; a ferramenta de diagnóstico não completa sozinha a aceitação de 95%.

### Oitavo lote: segurança de rich text e links

MTE-16: scripts/atributos de evento/espaços de nomes estranhos vindos por HTTP real no HTML não entram no host; protocolo ilegal, com credenciais e URL não parseável caem para texto, e link HTTPS válido é aberto pela plataforma do App e gera confirm. Conteúdo de nível de bloco e links em títulos e botões são convertidos em conteúdo inline não interativo. O renderizador Markdown mostra títulos/listas mas mantém HTML embutido como texto; aninhamento acima de 32 níveis volta ao texto original. Apenas Electron shell.openExternal é mockado para impedir a abertura real de um navegador externo, sem mockar o parser de rich text nem a action de marketing.

```text
HTTP text -> parse inert HTML/Markdown -> nós React permitidos
link válido click -> App action -> shell.openExternal -> confirm
link ilegal/script embutido -> texto ou remoção -> sem abertura externa, sem reporte
```

Verificação: `desktop-e2e-20260912-023559-971` **3/3 aprovados** (19,6 segundos, `/tmp/marketing-richtext-e2e.log`, saída 0). O link válido teve shell.openExternal chamado uma vez pelo Electron, com a URL exata correta e confirm uma vez; nenhum site externo foi realmente acessado. typecheck, desktop typecheck:e2e, lint (45 warnings existentes, 0 errors), architecture e diff check aprovados. Este lote é só de teste e documentação, mantendo pending; cobertura entre builds não foi mesclada e a aprovação local desta rodada não é interpretada como 95% global.

### Sétimo lote: GET tardio após fechamento

MTE-06: com Banner/Popup já exibido, o fixture HTTP congela a resposta de GET que contém a entrega antiga. Depois que o usuário fecha e reporta, o refresh é disparado consecutivamente e a resposta antiga é liberada; quando o próximo GET já chegou e continua pendente, afirma-se que o conteúdo não ressuscitou (o próximo GET do poller serial é a barreira de conclusão do resultado anterior). Por último a espera é liberada, o servidor reentrega o mesmo ID e a exibição é permitida de novo, sem nova deduplicação de histórico do cliente.

```text
snapshot de GET antigo pendente -> usuário fecha -> cancel -> múltiplos online coalescem o refresh seguinte
libera GET antigo -> App descarta a geração antiga -> próximo GET chega e fica pendente
  -> afirma que continua fechado -> libera a pendência -> servidor reentrega o mesmo ID -> exibe de novo
```

Verificação: `desktop-e2e-20260912-023147-423` **2/2 aprovados** (14,4 segundos, `/tmp/marketing-stale-e2e.log`, saída 0). Testes unitários de fixture 13/13, com um novo provando que a resposta pendente preserva a entrega anterior ao fechamento e que depois a nova consulta fica vazia; typecheck, desktop typecheck:e2e, lint (45 warnings existentes, 0 errors), architecture e diff check aprovados. Apenas mudança de infraestrutura/casos; resultado tardio em preparação de recursos, ação de sucesso em voo e troca de identidade continuam pendentes, e estes dois casos não são batizados como cobertura completa de corrida.

### Sexto lote: falha de decodificação no navegador

MTE-17: fixture com cabeçalho PNG/MP4 válido e SHA correto mas corpo corrompido precisa passar pela validação de tipo de download e então entrar numa falha real de decodificação de Image/Video no navegador. Para imagem o Hero indisponível é omitido; para vídeo com fallback disponível a imagem é usada, e quando o fallback também está corrompido o Hero é omitido (o protocolo exige video.fallback, não se constroem dados ilegais sem default). O texto do diálogo permanece legível e sem report automático. Com a contagem de cobertura de uma execução E2E real, verifica-se que as statements de rejeição de `marketing_image_decode` / `marketing_video_decode` executaram, ao contrário do teste anterior em que `marketing_asset_type` foi rejeitado na fase de download; os logs de coleta desta rodada não contêm essas duas causas e não se reivindica prova em log.

```text
cabeçalho válido + SHA correto -> readMedia do Host bem-sucedido -> erro de decoder do navegador
  -> fallback de vídeo / omissão do Hero -> texto preservado, sem report automático
```

Verificação: `desktop-e2e-20260912-022734-343` **3/3 aprovados** (21,3 segundos, `/tmp/marketing-decode-e2e-final.log`, saída 0). No relatório de Renderer dessa rodada, as linhas de rejeição de decode Image/Video de `marketingResources.ts` têm contagem 2, provando que o navegador realmente percorreu o ramo de falha de decodificação. Testes unitários de fixture 12/12; typecheck, desktop typecheck:e2e, lint (45 warnings existentes, 0 errors), architecture e diff check aprovados. A lista de recursos foi dividida em um helper independente e o fixture HTTP mantém a restrição de linhas. O primeiro teste sem video.fallback foi recusado pelo schema e não conta como evidência de aprovação desse cenário; após mudar para um fallback corrompido passou. Não se reexecutou o total de 43 casos, não se atualizou a cobertura global e a meta de 95% continua não atingida.

### Quinto lote: falha de handshake em iframe real

MTE-11: novo ZIP de teste dedicado, que após receber o init real retorna error conforme os args da entrega ou fica em silêncio. Cobre error/5 segundos sem ready × com/sem fallback: com fallback mostra a imagem validada; sem fallback mostra o placeholder de erro do hero já existente; o diálogo ainda pode ser fechado e gera cancel uma vez. Além disso, no iframe normal já ready, envia-se um error forjado a partir da janela pai e verifica-se que um source incompatível não consegue corromper o recurso já pronto. Todas as mensagens passam pelo postMessage do navegador, sem chamar diretamente a função de validação de confiança.

```text
HTTP ZIP -> validação/descompactação do Host -> init do iframe -> error / sem resposta
  -> imagem de fallback / placeholder de erro -> usuário fecha -> cancel uma vez
janela pai forja error -> source incompatível -> iframe já ready permanece inalterado
```

Verificação: `desktop-e2e-20260912-021641-668` 5/5 aprovados; após separar os ZIPs de falha, `desktop-e2e-20260912-021946-174` passou 5/5 novamente (48,6 segundos, log `/tmp/marketing-handshake-e2e-final.log`, saída 0). Com a construção final do ZIP passando a usar uma função auxiliar compartilhada, os 12 testes unitários de fixture passaram de novo e validaram o SHA real recurso a recurso; typecheck, desktop typecheck:e2e, lint (45 warnings existentes, 0 errors), architecture e diff check aprovados. O código-fonte não mudou e os contadores de cobertura destas duas rodadas não são mesclados entre builds; esta rodada não reexecutou os 40 casos e não reivindica 95% globais. Instância errada, ações de iframe, decodificação de mídia e os cenários MTE restantes continuam pendentes.

### Quarto lote: cliques repetidos durante a espera do claim

No cenário existente de resposta de claim controlada do MTC-03, acrescentam-se as asserções de MTE-05: com o claim HTTP já iniciado e a resposta retida pelo fixture, o usuário clica três vezes seguidas na área de reivindicação e ainda há apenas um claim e nenhum confirm antecipado. Depois de liberada a resposta, mantêm-se as asserções originais de Popup de sucesso e de um único reporte. Só o DOM público é acionado, sem chamar o controller diretamente nem liberar o disabled.

```text
primeiro clique -> claim pending -> três cliques repetidos -> claim ainda 1, confirm 0
fixture release -> Popup de sucesso -> confirm 1
```

O caso isolado `desktop-e2e-20260912-020600-618` passou; em seguida os três specs na mesma rodada `desktop-e2e-20260912-020726-877` deram **35/35 aprovados** (delivery 32, entitlement 1, anonymous 2). Log em `/tmp/marketing-full-final-e2e.log`, processo com saída 0 e relatório de cobertura gerado. typecheck, desktop typecheck:e2e, lint, architecture e diff check passaram. Este lote ainda modifica apenas casos e este documento.

Na mesma rodada, com merge-base fixo `87d6a7b2fc32d088452334c4309f33b0f8b039b1` sobre as linhas de diferença da árvore de trabalho atual, a cobertura de linhas mapeadas do Renderer é **684/900 = 76,00%**. Usa-se apenas o relatório de Renderer dessa rodada, sem mesclar statement ID entre builds e sem OR com Main/Host/CLI; arquivos não mapeados, ramos inacessíveis de Lottie e o problema de recorte V8 entre domínios continuam registrados e não se pode reivindicar 95% globais.

### Terceiro lote: falha da checagem de segurança prévia do claim e resultado vazio

Este subscenário de MTE-05 aplica-se apenas à checagem de segurança da versão oficial: quando a checagem falha ou devolve resultado vazio, o claim não é submetido e o confirm não é reportado, e o Banner volta a ser clicável; só quando o usuário clica de novo e a checagem tem sucesso é que uma reivindicação é submetida e uma confirmação reportada.
Os detalhes do caso e o registro de execução são mantidos junto da especificação de checagem de segurança do Start Plan da versão oficial.

### Segundo lote: requisição anônima e interceptação de login no claim

Subcenário já estabelecido de MTE-05/08: confirmar logout pelo menu do avatar real e conferir que o JWT foi removido do HOME de teste. Apenas Electron `relaunch/quit` é mockado para não gerar janelas fora do runner e, em seguida, o WebDriver reconstrói o App real; OAuth/Marketing Service e o estado dos componentes de entrega não são mockados. Cada caso reseta o cenário HTTP e reinicia de forma independente, sempre partindo do estado anônimo.

```text
confirmação de logout do App -> limpeza real das credenciais de teste pelo OAuth -> liberação do Host original
  -> novo App pelo WebDriver -> GET anônimo -> fechamento de Popup/Banner -> POST anônimo de cancel
  -> clique em reivindicar -> UI de login do App (sem claim, sem confirm, sem rodar a checagem de segurança)
```

Ambos os casos afirmam a ausência de Authorization no ledger HTTP real; o fechamento não é pulado por causa do estado anônimo. O claim apenas abre a UI de login, sem simular a conclusão de um login de terceiro. A semântica original de reinício por login não muda e o fim do teste só limpa o HOME de E2E isolado.

A preparação do teste entra primeiro na workspace anônima com entrega vazia, depois reseta o cenário e dispara um evento online para buscar, evitando que o Popup de marketing cubra a entrada pública de skip da WelcomeScreen. O mock de reinício por logout precisa fazer `update()` para sincronizar o registro de chamadas entre processos antes da asserção; apenas fazer polling do registro local daria timeout.

Verificação: novo build E2E Electron real `desktop-e2e-20260912-015734-173` **2/2 aprovados** (51,7 segundos; log em `/tmp/marketing-anonymous-e2e-3.log`). As duas rodadas anteriores falharam na preparação, respectivamente na sincronização do registro de mock e na WelcomeScreen coberta pela entrega antecipada, e não contam como evidência de aprovação. O teste permanece pending, sem extensão de protocolo, sem promoção e sem push. Somando o primeiro lote de 31 casos são 33 casos com registro de aprovação, mas esta rodada rodou só os dois casos anônimos e não reivindica aprovação dos 33 na mesma rodada; a cobertura não foi recalculada e o Goal de 95% continua inatingido.

### Registro de processo do primeiro lote

- Início da implementação: workspace limpo e verificação de atualidade do baseline aprovada; antes das mudanças de código, architecture com 0 violações.
- Primeira rodada de novo build: os 16 casos existentes de delivery passaram todos; o caso de benefício isolado, depois de corrigida a dependência de cenário entre specs, expôs uma antiga asserção do grupo `family:bigmodel`. O `docs/subagents-built-in-model-overrides.md` atual diz explicitamente que os candidatos vêm só da Environment Selection View e não reintroduz a family selected-key; o caso passou a usar o registry provider ID. Na prática, depois de voltar para Individual a Selection View deixa de oferecer o candidato Start original e o gatilho mostra Select model, e essa asserção foi mantida; não se pode inferir pela só fonte do agrupamento da UI que o Start ainda está disponível.
- Regressão de fechamento estendida: os dois casos de X e o Esc do Popup comum passaram; o Esc do Popup de resultado falhou e o foco real está sendo coletado. O caso de máscara clicou no conteúdo por engano ao usar deslocamento relativo centralizado do WDIO e passou a usar coordenadas absolutas do viewport, aguardando reexecução.
- Lottie não tem entrada atual no protocolo de marketing e foi perguntado ao usuário se o escopo do protocolo deve ser ampliado; o denominador não coberto não é removido e nenhuma função interna é chamada diretamente para se passar por E2E.
- Os arquivos brutos de cobertura Node de várias `reloadSession` só eram normalizados no fim do worker, e um único arquivo com vários casos acumulava source maps duplicados. Isso efetivamente aconteceu nesta rodada com ENOSPC; a chamada de normalização incremental existente foi completada no registro de resultado de cada caso, sem perder counters e sem mudar o recorte de cobertura, e a falha fica como erro de coleta sem sobrescrever o resultado dos testes.
- Evidência de execução de MTE-10/20: 8 diretórios de descompactação do mesmo hash ficaram de Hosts já encerrados na mesma rodada. A causa é que `hasDisposeAllAndWait` exigia incorretamente a existência simultânea de `disposeAll` e perdia o CloudContentService, que libera só de forma assíncrona; a verificação estrutural foi corrigida cobrindo os dois fechamentos de espera/síncrono best-effort, e o E2E completo valida a limpeza de cache com vários ciclos de vida de janela.

### Implementação do primeiro lote e fronteiras restantes

| Escopo       | Implementado neste lote                                                                                                                             | Ainda não concluído                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Casos existentes   | Reinício/HTTP reset por caso; conexão de providerId, ID de conta atual e agrupamento da Selection View; asserção de snapshot de conexão real não vazia                                         | E2E independente de navegação de provider customizado                                           |
| Fechamento e reporte | Novos 6 casos de Popup comum/de resultado de claim × X/Esc/máscara; correção do foco padrão do iframe que engolia o Esc                                                            | Limite de teclado após entrar ativamente no iframe não estende o protocolo                                   |
| Requisição/falha  | Novos 3 casos de seq inicial 0/incremento contínuo/POST sem contagem, cabeçalhos necessários, report 500 sem bloqueio, recuperação de query 503                                             | Anônimo/troca de credenciais, falha/cancelamento da checagem de segurança, corrida de resposta lenta, backoff completo/recuperação de oculto            |
| Mídia/cache  | Novos 5 casos de recurso por tema, imagem dark/default ruim, ZIP ruim com/sem fallback; casos existentes de Bundle recebem descompactação sem reescrita e lease 404; correção da limpeza assíncrona omitida do Host | Fronteiras de decodificação/timeout/tamanho/redirect, handshake forjado, vídeo com reduced-motion, fallback Web |
| Correções de produto   | Ícone de estado de erro Root, refresh do ProviderSettingsService após o claim, correspondência de providerId customizado, foco inicial do Popup, coleta de serviço só-assíncrono                   | P0/P1 mais amplos seguem pela matriz MTE e não podem ser declarados todos concluídos                           |
| Infraestrutura de coleta   | Reutilização da normalização de cobertura Node por caso, evitando acumular source map e encher o disco entre reinícios                                                                           | O recorte unificado de linhas executáveis entre domínios Node V8/source-map ainda precisa ser unificado, sem OR para virar percentual de todos os ramos  |

14 `it` independentes novos, mais os 17 existentes, somam 31, todos mantidos em `manual-review/pending`, sem promoção e sem push.

Regressão unitária: 9 arquivos e 50 casos aprovados (`/tmp/marketing-checkpoint-unit.log`); inclui infraestrutura de injeção de falha, Root/diálogo, refresh após claim, normalização de cobertura, liberação assíncrona de recursos e os testes originais de CUA/coleta de rede. Esses não contam para a cobertura E2E.

A execução final deste lote com novo build `desktop-e2e-20260912-013813-308`: **31/31 E2E aprovados**, 2 specs, execução WDIO de 4min 27s; log em `/tmp/marketing-phase6-e2e.log` e caminho do relatório no repositório `packages/desktop/.e2e-artifacts/desktop-e2e-20260912-013813-308/summary.md`. Depois da correção da limpeza na saída, o caso de Bundle passou com vários ciclos de vida de Host, snapshot de arquivo frio/quente e lease 404. Typecheck de todo o repositório aprovado, lint com 45 warnings / 0 errors, architecture com 0 violations e verificação de whitespace do diff aprovada.

No final deste lote, as linhas de diferença mapeadas do Renderer são **679/900 (75,44%)**, funções 170/222 (76,58%) e ramos 568/885 (64,18%). Esta é uma observação de cobertura de E2E todo aprovado, mas ainda não é prova de atendimento em todos os domínios de execução/ramos; o Goal permanece inacabado e o próximo lote e a decisão de escopo seguem pela tabela acima.

Observação de cobertura: `desktop-e2e-20260912-012936-023` é a execução histórica de 30/31 aprovados, com falha na asserção do diretório de cache. Com o mesmo recorte de **linhas de diferença mapeadas do Renderer** da auditoria, são linhas 678/900 (75,33%), funções 169/222 (76,13%) e ramos 567/885 (64,07%). Caminhos de falha executados durante a execução também contam, então o número não é prova de aprovação; textos de falha antigos não mapeados e o problema do recorte de Node continuam precisando de listagem separada.

As duas funções de Lottie em `CloudDialogMediaHero` ocupam 48 linhas executáveis mapeadas e `cloudLottieRuntime` ocupa 36. O protocolo de marketing atual não tem entrada de entrega Lottie, e essas 84 linhas sozinhas fazem o teto teórico do denominador de 900 linhas do Renderer acima não passar de 90,67%. Esse não é o teto da cobertura global entre domínios de execução: o denominador global unificado ainda não foi estabelecido e não se pode afirmar com isso que os 95% globais são impossíveis. Se o Lottie estenderá o protocolo ou terá entrada real continua aguardando decisão do usuário; não se pode remover código, reduzir o denominador ou ampliar o protocolo por conta própria.

Apenas medido em Electron macOS; asserções de UI em largura estreita e claro/escuro não equivalem a Web em celular nem a Windows/Linux em dispositivo real. A liberação do serviço compartilhado já tem regressão em teste unitário do Helper no Windows, mas não há evidência em dispositivo Windows. As 4 arestas pendentes existentes do grafo de relações são iguais às do HEAD e nada foi acrescentado neste lote; a limitação da indisponibilidade da ferramenta de grafo de código permanece.