# Casos de Browser do Lote de Settings de Provider

## Divisão dos Templates MiMo (2026-10-14)

MIMO-03 (accepted, pending): 390px chinês claro / 1200px inglês escuro, o seletor real de templates mostra separadamente Xiaomi MiMo API e Xiaomi MiMo Token Plan, com tooltip e ícones consistentes; ao clicar em cada um, apenas a ação de criação do templateId correspondente é enviada, e os detalhes de Base URL mostram respectivamente o endereço de pagamento por uso e o endereço do China Token Plan; sem overflow horizontal, erros de página ou escritas adicionais. A especificação e a verificação oficial estão em [Templates MiMo](../provider-mimo-templates.md). Reaproveita o fixture de browser existente, sem afirmar que Electron nativo, celular via shared-host ou requisições reais pagas foram verificadas.

Execução: `node --test --test-name-pattern='mimo templates' packages/ui/test/browser/manual-review/pending/provider-settings-batch.test.mjs`.

Os dois casos desta rodada passaram, e as capturas foram revisadas: os dois templates, o ícone, os dois endereços, o chinês claro e o inglês escuro estão normais. As 18 verificações direcionadas de configuração e as 17 verificações affected finais passaram; a identidade pending foi mantida.

## Todo148 Correção do Ícone do App no Dock (2026-09-15)

Complemento de nomes do Todo150: o caso existente `zai app icon` de duplo tamanho/idioma afirma ao mesmo tempo que as duas tarjetas de template e seus tooltips mostram `Z.ai Coding Plan` e `Z.ai API`, respectivamente, com ícone e protocolo inalterados.

Regressão de nome da OpenRouter: a tarjeta de template de adição, em 390zh/claro e 1200en/escuro, exibe `OpenRouter`, sem o sufixo Anthropic; o texto de hover mantém o mesmo nome. O teste unitário de configuração verifica simultaneamente que os nomes de produção/teste, o protocolo e a URL não mudaram.

Dois novos casos `zai app icon`: 390zh/claro e 1200en/escuro. No seletor real de templates, os dois templates da Z.AI, a navegação após a seleção e os detalhes usam o mesmo PNG de app de 128px; a imagem decodifica de fato, permanece quadrada e não sofre inversão de cor; é apenas exibição e não grava nada, e clicar no template dispara somente a ação de criação já existente, sem gravação extra ou exceção de página. As capturas ficam para revisão visual, continuando como browser pending e não substituindo a validação conjunta de shared-host no celular nem a aceitação completa de Electron.

## Alinhamento de Casos Existentes de Página Inteira (2026-09-12)

Na primeira execução de `settings-ui-polish` com Pro, MP-UI-04 ainda procurava uma lixeira independente e MP-UI-06 ainda tratava o título do grupo como label; os dois pontos conflitam com as decisões de implementação já tomadas em Todo115/125. O teste passa a clicar de fato na exclusão dentro do menu de mais opções e a localizar o título do grupo pela entrada de ajuda, mantendo as asserções de persistência da exclusão, de estilo e de salvamento da edição. A verificação de rolagem de MP-UI-01 foi movida para depois da etapa de criação, continuando a ser executada e afirmada, para evitar que uma falha de rolagem isolada mascare a evidência de criação de template; a verificação não é removida, o layout do produto não é ajustado e os critérios de criação não são afrouxados.

O caso de rolagem completo de Settings é o mesmo da baseline desta rodada; atualmente o Pro relata que o contêiner externo não rolou após a roda do mouse, com atribuição indefinida. A falha continua registrada e não conta como tudo verde nesta rodada; a nova execução diagnóstica registra apenas geometria / elemento atingido / quantidade de rolagem, sem ler dados de conta.

Investigação posterior: MP-UI-01 executado isoladamente, com a asserção completa de rolagem, passa; quando combinado em lote, o UP-01 anterior abre o menu do avatar e não o fecha, e o click de DOM seguinte ultrapassa o menu modal e continua operando, enquanto a roda real atinge o HTML raiz e não entra no main. Correção do encerramento do teste: UP-01 fecha o menu normalmente e espera a liberação da barreira de ponteiro, sem alterar a rolagem do produto e sem remover asserções que falham. Este item é um problema de isolamento de teste já existente.

A segunda rodada de MP-UI-04/06 passou, e MP-UI-01 expôs a expectativa de catálogo antiga: na segunda rodada do Todo113 os templates oficiais do DeepSeek são os dois membros `deepseek-flash`/`deepseek-v4-pro`, e a regra antiga `deepseek-v4-flash` continua mantida, mas já não é listada como membro oficial de default. Atualizar essa asserção exata conforme o catálogo final, sem remover as regras de modelo nem restaurar default duplicados.

O lote combinado final `provider-20260912-pro-settings-polish4` passou: 8 itens realmente executados, UP-00 com retorno antecipado por não ser Windows, 1 item pulado por SSH. Os 9 passing do WDIO incluem esse no-op do Windows, portanto não se pode afirmar que o Windows foi testado. Criação/retorno completos, exclusão, reordenação, salvamento de edição e asserções de viewport/rolagem foram todos executados; as capturas 390px em português/inglês, claro/escuro, foram vistas. Evidência detalhada na seção de 2026-09-12 de `ui-polish-e2e-coverage-matrix.md`.

## Complemento de Refresh de Mesa do Todo127

BR117-N02 (accepted, pending): um aplicativo Electron completo e isolado obtém dois URLs de Built-in versionados através de um proxy HTTPS de teste. A versão inicial fornece a capacidade de 500K do modelo de teste e o marcador de mapeamento de requisição 0.17; somente após trocar o plano de controle de teste para o novo URL, clicar em refresh na página de Settings faz a interface passar a 700K, e subsequentemente o teste wire de conexão real usa o novo marcador 0.37. O arquivo Personal e o cache de escolhas recentes pré-carregado não mudam. Reutiliza o caminho oficial de download, atualização de Account/Registry e criação de Model, sem escrever diretamente em Active nem usar stub da Settings View. O proxy substitui apenas as respostas de rede externas e não afrouxa a validação HTTPS; não acessa contas reais, não publica automaticamente e não adiciona comportamento de negócio além das requisições de modelo. O congelamento de execuções antigas é provado pelos testes de Core/SDK já existentes, e este caso não se passa por aceitação de Model em execução.

```text
Refresh da página de Settings -> download oficial do Host -> URL do plano de controle de teste -> CDN HTTPS de teste
  -> substituição atômica do Active -> Account/Registry -> UI 700K
  -> teste de conexão do novo Model -> wire real 0.37
```

Este item não substitui a validação conjunta de shared-host no celular / Environment via SSH. O caso fica em settings/manual-review/pending, mantendo pendente de promoção manual.

## Complemento de Abertura Nativa do Todo116 (2026-09-12)

K116-N01 (accepted, pending): em um perfil Electron isolado, gravar dois Providers manuais criados a partir de templates pré-configurados, sendo um com API Key comum e um com Coding Plan API Key, e usar Key não vazia e Key vazia. O `apiKeyManagementUrl` de cada Provider aponta para um caminho único em uma porta aleatória local do processo de teste. A página real de Settings deve ter apenas uma entrada de obtenção; antes do clique, o servidor não recebe requisição nesse caminho, e após o clique o navegador padrão do sistema solicita exatamente o caminho configurado, com os bytes do arquivo de configuração inalterados. Não habilita requisições de modelo, não acessa contas reais nem lê outras páginas do navegador padrão. Providers puramente personalizados, sem templateId, não exibem essa entrada, conforme decisão já existente.

```text
Personal Config isolado com URL única -> Settings View -> botão único
    -> IPlatformService -> preload / IPC -> shell.openExternal
    -> navegador padrão do sistema -> canary GET local único
```

Caso: `packages/desktop/test/e2e/settings/manual-review/pending/provider-key-native-open.test.ts`. Requer um desktop interativo com navegador padrão e não entra no gate de Docker sem desktop; o chegada da requisição prova apenas a cadeia de abertura nativa, e não o estado de login no console oficial nem o shared-host do celular. O valor exato das URLs oficiais de template e as combinações de duplo tamanho com/sem Key reutilizam os testes existentes, sem arranjos adicionais. O teste abre duas páginas locais de aceitação, sem conteúdo de conta.

Todo131/125: a edição real com Hook e diálogo ganha 6 casos (3 por tamanho): restauração atômica e preservação em caso de falha; ao editar/modo/provedor/fechar/restaurar de novo/início de salvamento/mudança de ID, tanto o sucesso antigo quanto a falha antiga são invalidados; 9 pontos de hover/focus/tap de ajuda, Escape, rich text final, limite de viewport e não modificar o rascunho. Os dois casos antigos do 130 recebem a restauração com ID vazio sem requisição/sem gravação. Os 6 novos casos passaram de forma direcionada, e o resultado combinado está no livro de Goals; as capturas de layout estão no mesmo diretório temporário. Três casos de Electron de Settings foram atualizados, mas este grupo ainda não foi executado de fato no Electron; a exibição de fontes chinesas continua limitada pelo conjunto de fontes do Linux.

Todo130: novos casos de manual editable fields and pending cancellation, usando o `useProviderModelDraft` real e o diálogo para verificar que um ID vazio pode ser alternado sem disparar requisição, que após trocar para manual em voo o sucesso/falha antigos não podem sobrescrever o rascunho, e que nada é salvo. Passou em 390zh/claro e 1200en/escuro; as rotas de rede de recomendação e salvamento são isoladas por rotas de teste, o que não equivale a Electron ou máquina real com controle remoto. O schema manual e o round-trip com o arquivo real são validados separadamente pelos testes de Provider/Node.

Todo122: novos casos de subagent selection error copy, exibindo no ToolLayout real a message de erro público injetado por teste, verificando em 390zh/claro e 1200en/escuro o detalhe e a cópia da razão completa e da identidade da seleção. Os dois casos passaram; o parsing real, a projeção e o runner de foreground/background do Core têm outros 84 testes, e o fixture não se passa pela cadeia real entre processos.

Todo126: dois novos casos de coding plan vision badge: nas mesmas duplas de tamanho/tema, percorrendo Keys de planos pessoal, de equipe e manual, com o ModelConfigSelect real e o Card de Settings verificando que GLM-5.3 não tem marca de visão e Flash a mantém; o bridge no servidor e a capacidade de imagem permanecem como estavam. Os dois passaram em execução direcionada.

2026-09-11 Todo115/132: dois novos casos de header name and option feedback (390zh/claro e 1200en/escuro). Com o Header/Card reais, o foco do menu, a pausa que não salva, o Esc que não salva, o Enter que submete uma vez, o layout com nome longo, o Tooltip que não cobre o estado do interruptor e a zona de expansão que não interfere no menu; com os componentes reais Modality/Boolean, verifica-se que clicar na mesma posição muda o fundo, mantendo texto/ícone/borda/dimensões. Os seis passaram em execução conjunta, com a rota de salvamento isolada; não substitui a cadeia completa de Electron/Host no celular. Nesta rodada o Linux não tinha glifos chineses: o texto e as interações em chinês são afirmáveis, mas isso não conta como aprovação visual de glifos chineses.

2026-09-11 Complemento do Todo117: em 390/zh/claro e 1200/en/escuro, o card de Provider de conta real não mostra o interruptor geral, o interruptor de modelo continua presente e a montagem não escreve `enabled`; o caso manual existente de Coding Plan Key continua verificando ligamento e desligamento. A seleção de plano e os efeitos colaterais do salvamento são cobertos separadamente por testes de callback do ModelProviderSection real, e o fixture de card de browser não se passa por integração completa com o Host.

No mesmo dia Todo119/124: após desabilitar, o botão de teste do modelo fica disabled, e religá-lo restaura; o aviso de sucesso usa o Fixture Provider e não o ID interno do fixture, e o fundo/texto/borda verdes semânticos coexistem com o botão de fechar. Os quatro casos de browser passaram em execução conjunta. O retorno de nome, os casos de sucesso/falha/erro e os avisos de qualificação localizados são complementados por testes de evento de componentes React reais; o erro de rede assinado é repassado sem alteração, coberto por testes de serviço.

Relacionados: [Todo107](../working-memory/provider-refactor/steps/todo-107-provider-settings-feedback-enablement-and-template-links.md), [Todo111](../working-memory/provider-refactor/steps/todo-111-zhipu-coding-plan-api-key-and-standard-api-templates.md).

Arquivo de casos: `packages/ui/test/browser/manual-review/pending/provider-settings-batch.test.mjs`, com fixtures que usam TemplatePicker, ProviderCard, Navigation e componentes de feedback reais, e gravação de serviço isolada por rotas de teste; não grava dados reais de usuário.

| Caso                           | Tamanho/tema/idioma       | Verificação                                                                                                                                                                                |
| ------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| provider batch 390/zh-CN/light | largura de celular, claro, chinês | agrupamento e ordem dos quatro templates Zhipu, sem overflow horizontal na página; com Key e sem Key há apenas uma entrada de obtenção de API Key, e o clique entrega a URL principal do template; ligamento/desligamento grava o campo externo e preserva a Key; o arraste horizontal em x não muda; a falha de exclusão permite repetir a operação original; o aviso de conexão bem-sucedida pode ser fechado |
| provider batch 1200/en-US/dark | largura desktop, escuro, inglês | o mesmo conjunto de comportamentos, validando componentes compartilhados e localização, sem criar um segundo julgamento de Web Provider                                                                                                                    |

Em 2026-09-10 os dois casos originais passaram; em 2026-09-11, conforme o Todo116, a asserção de dupla entrada passou a ser a asserção de entrada única e de Key vazia acima, e o novo resultado do Todo116 prevalece. As capturas estão no diretório temporário de saída de teste `zcode-provider-settings-batch`. A classificação pending foi mantida, sem promover arbitrariamente para a regressão oficial de Electron.

Execução: `CHROME_EXECUTABLE_PATH=<Chromium> node --test packages/ui/test/browser/manual-review/pending/provider-settings-batch.test.mjs`. No Linux são necessários Chromium, dependências de execução e um conjunto de fontes chinesas. Nesta execução foram usados a biblioteca compartilhada isolada já presente no ambiente e uma biblioteca temporária de fontes oficiais Noto CJK.

O `settings-ui-polish` de Electron já existente foi atualizado conforme os dois membros finais do DeepSeek, o menu e os títulos de ajuda, e passou na execução real com Pro; `provider-settings-write-recovery` também passou no lote combinado com Pro. O primeiro ainda pula o ramo SSH; nenhum dos dois equivale à validação conjunta de shared-host no celular. A abertura do console nativo é provada à parte por K116-N01, sem usar isso para afirmar aprovação do login oficial.

2026-09-12 O Todo137 confirmou nova cobertura: os casos de browser existentes de vision badge ganharam Z.ai/BigModel Start Plan. Nos dois tamanhos/idiomas/temas, tanto a lista de Settings quanto o menu de modelo escondem a marca de visão do GLM-5.3, enquanto Flash continua exibindo; verifica-se apenas o componente de exibição compartilhado, e a capacidade real de imagem segue validada por teste unitário. Primeiro vermelho, depois verde; os 2 casos de browser passaram; a classificação pending foi mantida.

2026-09-12 O Todo138 foi validado: a lista de níveis do novo modelo fica vazia para ID vazio; o ID digitado recebe os níveis recomendados e limpar restaura a lista vazia; níveis explicitamente editados são mantidos após o parse da resposta. Reutiliza a nova entrada do ProviderCard real, cobrindo 390/zh/claro e 1200/en/escuro, com rotas de serviço isoladas.

O Todo138 adicionou dois casos primeiro vermelho, depois verde; dos 22 itens do arquivo inteiro, 21 passaram na primeira execução, e o provider batch de celular foi afetado por hot reload do arquivo — depois de fixar o arquivo, os dois casos provider batch passaram em reexecução independente. A identidade pending foi mantida, sem promoção para a regressão completa de Electron/controle remoto.

## Aceitação Complementar do Todo141 (2026-09-12)

Sobre os casos de browser existentes do editor real, acrescentar: 390px/zh/claro e 1200px/en/escuro, ordem dos campos básicos, interruptor inteligente na área de título, reverter/cancelar/salvar no rodapé, checkbox de bloqueio de texto, ausência de cartões e ausência de overflow horizontal; expandir e recolher preserva o rascunho local, nível de raciocínio / erro de mapeamento repetido ao expandir foca novamente, erro de saída máxima básica não expande; reverter não grava, o interruptor de título fica inoperante durante o salvamento, e reabrir vem colapsado por default. Continua cobrindo a configuração manual existente, as sobrescritas pessoais e os resultados assíncronos expirados, sem alterar a implementação do IME e sem tomar o fixture de browser como aceitação conjunta de RPC real em desktop/celular.

O lote completo desta rodada passou **26/26**, incluindo os quatro casos do Todo141 (dos quais a validação de nível de raciocínio cobre reduced motion). As capturas foram complementadas com a biblioteca de fontes Noto CJK e vistas; o espaçamento medido dos campos é 16px; foram preservados os traces de interação `/tmp/zcode-provider-settings-batch/todo141-{390,1200}.zip` e as capturas de básico/avançado. Entradas duplas, animação normal/reduzida, erros repetidos, preservação de edição local, reabertura e salvamento conjunto passaram. O seletor e os textos do E2E nativo foram alinhados; nesta rodada passou apenas a checagem de tipos, sem reexecutar o Mac Electron/controle remoto real do celular; a classificação pending não muda.

## Regressão de Cor do Checkbox do Todo143

Nos dois casos existentes de `header name and option feedback`, adicionar a comparação de estilo real do Checkbox do sistema: 390px/zh/claro e 1200px/en/escuro, cores de estado selecionado e não selecionado para o corpo da caixa nos tipos de entrada, capacidades comuns e capacidades de sobrescrita pessoal, cor do check invertido e dimensões de 16px/12px; alternância única por teclado, mantendo a borda externa e o bloqueio de texto. Na implementação antiga os dois casos ficaram vermelhos; após a correção, passaram 6/6 em lote combinado com os quatro casos do Todo141. As capturas do estado selecionado foram vistas; no Linux atual faltam parte dos glifos chineses, e não se afirma aprovação visual de fontes. Apenas os casos de browser pending foram modificados, sem promoção e sem se passar por validação real nativa/shared-host no celular.