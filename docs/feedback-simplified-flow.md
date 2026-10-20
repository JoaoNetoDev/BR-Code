# Fluxo Simplificado de Envio de Feedback

## Contexto

O fluxo antigo de envio de feedback exigia que o usuário preenchesse campos como título, tipo, módulo e grau de impacto. Esse fluxo se parecia mais com um formulário interno de chamado; na era da IA, o usuário deveria apenas descrever o problema, e o cliente preencheria automaticamente o contexto de diagnóstico.

## Objetivos

- O popup de envio de feedback é refeito como um único fluxo simplificado, sem reutilizar a solução antiga de popup com múltiplos campos.
- O usuário só precisa preencher a descrição do problema, capturas de tela opcionais e contato opcional, e então enviar.
- O upload de logs fica habilitado por padrão, e o usuário pode desmarcá-lo antes de enviar.
- O cliente continua coletando automaticamente contexto de dispositivo, modelo, framework etc. e o envia ao backend para classificação por IA/engenharia.
- "Meus feedbacks" é refeito como uma lista somente de leitura, sem carregar detalhes, linha do tempo de processamento ou entrada de feedback complementar.

## Novo Formulário de Envio

O formulário contém quatro áreas visíveis ao usuário:

Regras de layout:

- O shell do popup referencia o painel de compra do Coding Plan: `rounded-2xl`, `p-0`, com divisões header/body/footer, sem usar bordas grossas para separar.
- A largura máxima do popup no desktop é `34rem`, evitando que o formulário de feedback pareça uma página de configuração widescreen.
- A altura alvo do popup no desktop é `38rem`, encolhendo automaticamente via `calc(100vh - 2rem)` em janelas mais baixas; o Web no celular continua usando altura quase tela cheia, garantindo espaço vertical suficiente para descrição, capturas de tela, contato e área de logs.
- O Header exibe apenas o título da página atual e o botão de fechar; o título deve passar por i18n, em chinês "提交反馈 / 我的反馈" e em inglês `Submit feedback / My feedback`.
- A área de conteúdo do popup mantém apenas um container de rolagem, sem envolver cada campo em um card.
- A área de rolagem do conteúdo do popup mostra máscara de fade superior/inferior conforme a posição de rolagem: fade no topo quando há conteúdo oculto acima, fade na base quando há conteúdo oculto abaixo, e nada quando não há conteúdo oculto.
- Descrição do problema, capturas de tela e contato usam agrupamento sem moldura, estabelecendo hierarquia por título, espaçamento e as próprias bordas dos controles.
- Apenas itens de anexo repetitivos como a seção de configuração de Logs, a área de upload de capturas e as miniaturas usam borda leve ou superfície clara.
- A caixa de texto da descrição do problema, o container de upload de capturas, a caixa de contato e a seção de Logs usam uniformemente `rounded-xl`, mantendo o raio consistente entre os controles de formulário dentro do popup.
- O container de upload de capturas usa `p-3` e `gap-3`, garantindo consistência entre a grade de miniaturas, a linha de ações e o respiro dos quatro lados.
- O Footer referencia o painel de compra do Coding Plan, funcionando como área de ações com respiro natural; a página de envio exibe `Cancel` / `Submit` à direita, e a página de lista exibe `New feedback`.
- A entrada "我的反馈 / My feedback" à esquerda do Footer da página de envio fica na mesma linha de `Cancel` / `Submit`, fixada como ação à esquerda, usando estilo de botão outline e exibindo ícone lucide mais texto.
- O botão principal de envio do Footer da página de envio ajusta a largura ao conteúdo do texto, sem definir uma largura mínima fixa extra, evitando que botões com texto curto pareçam pesados demais.
- É proibido formar a hierarquia visual de "card dentro do popup, card dentro do card".

1. Descrição do problema / Issue description
   - Um campo de entrada multilinha obrigatório.
   - Antes do título exibe a marca vermelha `*` de campo obrigatório, reutilizando o mesmo componente de marca do popup de requisitos de produto; o asterisco é ocultado para leitores de tela, e o campo de entrada fornece o nome acessível no idioma atual e a semântica required.
   - Quando a descrição está vazia ou contém apenas caracteres em branco, o envio é proibido; com um conteúdo válido preenchido, o envio é permitido, e ao limpar o campo ele é proibido novamente. O campo de contato continua opcional.
   - À direita do título exibe `当前字数/4000`.
   - O campo limita no máximo 4000 caracteres.
   - O campo exibe no máximo 5 linhas de texto, rolando internamente após isso.
   - Não exige mais que o usuário preencha um título.
   - O título é gerado automaticamente pelo cliente a partir da primeira linha da descrição.
   - Ao entrar por "反馈问题" (Reportar problema) a partir da faixa de erro do chat, a caixa de descrição é pré-preenchida com um template de diagnóstico de erro.
     O template não insere mais uma abertura genérica como "我在使用过程中遇到了报错，请帮忙排查。";
     a primeira linha combina diretamente o rótulo de resumo do erro e a mensagem de erro, por exemplo: `报错摘要：Provider authentication failed.`.
     TraceID, detalhes do erro, "我当时正在做什么" (o que eu estava fazendo) e "期望结果" (resultado esperado) continuam como parágrafos independentes posteriores, para facilitar o usuário complementar o cenário.
   - Quando a assinatura da sessão falha e entra no estado de erro de página inteira "重新连接" (Reconectar), a mensagem de erro exibe simultaneamente os dois botões compactos "反馈问题" e
     "重新连接". "反馈问题" reutiliza o fluxo de envio da faixa de erro do chat, com a primeira linha da caixa de descrição pré-preenchida com
     o resumo atual do erro de assinatura, acompanhada do session ID e de um resumo de diagnóstico anonimizado (logs habilitados por padrão, capturas de tela adicionadas pelo próprio usuário); o usuário não precisa antes copiar o erro ou reabrir o centro de feedbacks pelo menu de ajuda global.

2. Capturas de tela / Screenshots
   - À direita do título exibe `当前图片数/6`, por exemplo `3/6`.
   - Suporta colar imagens da área de transferência; quando o foco não está dentro de um `textarea` ou `input`, todo o popup de feedback pode receber colagem de imagens.
   - Quando o foco está na caixa de descrição do problema ou na de contato, não sequestra o evento de colagem, preservando o comportamento nativo de colagem de texto.
   - Suporta arrastar imagens para a área de upload.
   - Suporta selecionar imagens pelo seletor de arquivos.
   - As imagens selecionadas são exibidas dentro do mesmo container de upload de capturas, com as miniaturas acima das dicas de ação.
   - Suporta múltiplas imagens, pré-visualização de miniaturas, remoção e pré-visualização ao clicar.
   - Mantém o limite de no máximo 6 imagens, evitando que os anexos de um feedback fujam do controle.

3. Contato / Contact
   - Opcional.
   - Continua suportando e-mail, WeChat ou outras redes sociais.
   - Altura da caixa de texto fixa em `h-10`, com padding horizontal fixo `px-3`.
   - Continua reutilizando a memória local de contato.

4. Logs / Logs
   - Habilitado por padrão; o usuário pode desmarcar, e o envio respeita a escolha atual. Novo feedback volta a ter o padrão habilitado; envio em segundo plano preserva a escolha original.
   - Exibe "上传诊断日志" (Enviar logs de diagnóstico).
   - Exibe o escopo dos logs de diagnóstico do dia, a projeção segura da configuração da CLI e o aviso de possível informação de negócio residual; os logs de problema também incluem a projeção não sensível de `~/.zcode/cli/config.json` e as trilhas de chamadas de modelo do dia em `~/.zcode/cli/rollout/`.
   - O usuário pode desativar o upload de logs, mas não são restaurados os outros campos avançados do formulário antigo.

5. Botão de envio
   - Desabilitado quando a descrição está vazia.
   - Durante o envio exibe a criação do chamado e o upload das capturas; com os logs habilitados continua exibindo a exportação e o progresso do upload dos logs.

## Mapeamento dos Campos de Envio

- `title`: extraído da primeira linha da descrição do problema, com no máximo 80 caracteres; quando a primeira linha está vazia, é extraído por normalização do corpo.
- `description`: preserva a descrição original do problema do usuário, anexando o bloco de contexto coletado automaticamente pelo cliente.
- `type`: padrão `bug`. Posteriorsmente reclassificado pela IA do backend com base no texto original, nas capturas e nos logs.
- `severity`: padrão `P2-中`.
- `module`: padrão `其它`. Posteriorsmente reclassificado pela IA/regras do backend.
- `framework`: fixo `zcode-agent`.
- `source`: mantém `desktop-app`.
- `contact`: enviado quando o usuário preenche; valor vazio não é enviado.
- `locale`: idioma atual da interface.
- `device`: continua incluindo versão, sistema, configuração de modelo, informações necessárias do modelo etc. como contexto automático, sem enviar a lista de configurações de modelo.

## Semântica dos Logs

Os logs são material opcional de diagnóstico, habilitados por padrão e consistentes em todas as entradas. Mantendo a marcação e enviando, são enviados apenas logs de diagnóstico da allowlist; veja [Limites do upload de logs](feedback-log-export-alignment.md). Abrir o formulário não tira captura de tela automaticamente; o usuário adiciona e pré-visualiza imagens por colagem, arrastar ou seletor de arquivos.

Se o usuário mantiver os logs habilitados mas o upload falhar, nesta fase continua valendo a semântica de falha da atual máquina de estados de envio em segundo plano: o envio do feedback aparece como falho e o chamado recebe um aviso do sistema explicando que o upload automático do log completo falhou. Mais adiante, se for necessário mudar para "chamado criado com sucesso e log com retry", será preciso novo desenho de retomada e reenvio da tarefa de envio.

O aviso de envio em segundo plano é tratado como uma camada leve de toast, sem usar o grande raio do popup; o shell é fixo `rounded-xl`. O conteúdo é organizado em três colunas "ícone de status / duas linhas de texto / botão de ação à direita": a primeira linha de título exibe "正在提交反馈" (Enviando feedback) e a segunda exibe a descrição concreta do progresso e o percentual. O ícone de status exibe diretamente a cor semântica, sem borda extra ou base de superfície clara; os botões de expandir e fechar à direita mantêm espaçamento compacto, evitando que a área de ações roube a hierarquia do texto.

## Meus feedbacks

"Meus feedbacks" exibe apenas a lista de feedbacks, como uma entrada leve para o usuário confirmar o resultado do envio e copiar o número:

- A lista usa um container de sensação de tabela de camada única, sem agrupar por data para criar hierarquia extra.
- Cada feedback exibe status, título, hora de envio e ID do feedback.
- O ID do feedback é exibido em fonte monoespaçada e oferece um botão de cópia.
- Não é mais possível clicar para entrar em detalhes, nem são exibidas linha do tempo de processamento, respostas de detalhes ou formulário de feedback complementar.
- Todos os títulos, cabeçalhos de tabela, botões, prefixos de ID e textos explicativos visíveis devem passar por i18n; é proibido codificar inglês em hardcode dentro dos componentes.

## Impacto em Múltiplas Plataformas

- O desktop continua criando o chamado, enviando capturas e logs pelo `feedbackService` do host process existente.
- A página inicial do Web de controle remoto hoje é um fallback unsupported para o `feedbackService`; esta mudança não adiciona novo estado de negócio de controle remoto e não toca em task realtime, snapshot, queue nem semântica replayable/continuous.
- A entrada de erro de assinatura da sessão pertence à UI compartilhada: tanto o desktop quanto o Web no celular mantêm os botões e o pré-preenchimento do resumo do erro; a capacidade de captura de tela degrada conforme a disponibilidade do host atual, sem criar um novo Agent runtime, assinatura ou cadeia de recuperação para o celular.
- A UI usa tokens semânticos, layout compacto de popup e textos i18n, precisando ser compatível com desktop widescreen e Web em tela estreita no celular.

## Verificação

| Case ID    | Cenário                                                    | Asserção                                                                                     | Ponto de E2E                                                                                                                       |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| FB-DESC-01 | Envio de problema em chinês e inglês, janelas largas e estreitas, temas claro e escuro | A marca de obrigatório é visível e o campo de entrada tem semântica required; valor vazio proíbe o envio | `packages/desktop/test/e2e/feedback/manual-review/pending/feedback-upload-privacy.test.ts` FB-PRIV-01/08 / FB-DESC-01 |
| FB-DESC-02 | Formulário real e serviço de feedback em memória             | Valor vazio, apenas caracteres em branco e o estado após limpar proíbem o envio, sem criar chamado, arquivar nem enviar; uma descrição válida pode criar o chamado | o mesmo, FB-DESC-02 com fixture Chromium isolado                                                                                   |

- A página de envio de feedback não renderiza mais os campos de tipo, módulo, grau de impacto e exibição de modelo.
- Colar/selecionar múltiplas imagens, pré-visualizar e remover continuam disponíveis.
- O toggle de logs fica habilitado por padrão, e `includeLogs` é `false` quando desmarcado.
- A página de erro de assinatura da sessão exibe simultaneamente "反馈问题" e "重新连接"; ao clicar no feedback, o rascunho contém o erro atual, o session ID e o resumo de diagnóstico anonimizado, com os logs habilitados por padrão e sem captura automática da janela.
- Executar `pnpm typecheck`.
- Executar `pnpm lint`.