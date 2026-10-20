# 08 — Experiência de desconexão e reconexão no lugar

Status: done

**Spec pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:**

- [03 — Modelo de apresentação da conexão remota, 5 estados e glossário](./03-presentation-model-states-and-glossary.md): o estado do banner e da linha do projeto é lido a partir do modelo de apresentação.
- [04 — Correções P0 do assistente e extração do controlador de fluxo](./04-wizard-p0-fixes-and-flow-controller.md): o assistente precisa cair direto no ponto de espera correspondente.

**Comportamentos a entregar:**

- **Área da sessão durante a desconexão**:
  - No topo da sessão aparece um banner, com o estado e o motivo, oferecendo as ações "Reconectar" e "Detalhes". Se ainda houver tarefas em execução no remoto, o banner informa que essas tarefas continuam rodando.
  - A página da sessão deixa de ficar completamente em branco.
  - O campo de entrada preserva o rascunho, mas não permite o envio por enquanto, e explica o motivo. Nada é enfileirado durante o período offline, e nada é enviado automaticamente após a reconexão.
- **Visões de tarefa durante a desconexão**:
  - O projeto offline mantém uma linha de placeholder nas visões de linha do tempo, agrupamento, fixados e arquivados.
  - A busca ⌘K exibe um texto legível.
- **Reconexão**:
  - Com as credenciais completas, clicar em reconectar conclui diretamente na linha do projeto, sem abrir o assistente.
  - Quando a reconexão falha, a linha do projeto exibe o motivo da falha; ao clicar, abre-se a tela "Conectando" do assistente, com o log expandido.
  - Quando for necessária a ação do usuário (por exemplo, quando faltarem informações), o assistente para direto no ponto de espera correspondente.
- **Regra unificada dos pontos de entrada**:
  - Os quatro pontos de entrada seguem a mesma regra de intenção: o botão de reconectar da barra lateral, o clique na linha de um projeto offline, o "Conectar" do cartão de detalhes e o "Conectar" da página de configurações.
  - Se o ponto de entrada não tiver um diretório, depois de conectar o usuário entra na seleção de diretório e pode escolher "Selecionar depois".

Isso corresponde à seção "Área da sessão" da spec pai e à parte de reconexão no lugar e de intenção dos pontos de entrada da seção "Reconexão e recuperação".

Escopo:

- **Placeholder na área de conteúdo**: a área de conteúdo exibe pelo menos o placeholder "O dispositivo não está conectado; conecte-se para continuar esta sessão". O conteúdo de sessão já carregado só é mantido em modo somente leitura enquanto o owner existente ainda o tiver; não crie um novo owner de cache para isso.
- **Falha de envio em condição de corrida**: exibir a mensagem de erro categorizada e oferecer "Reconectar". A categoria do retorno não pode ser escrita como "erro na chamada do modelo".
- **"Selecionar depois"**: adicionar essa opção ao passo existente de seleção de diretório; preservá-la quando a [11](./11-connecting-and-directory-screens.md) refizer a tela de seleção de diretório.

**Conclusões da revisão de protótipo** ([conclusões da 06](./06-interaction-prototype-review.md#comments)): a interface é implementada conforme o protótipo aprovado na revisão; nos pontos abaixo, prevalece o 06.

- O banner da sessão usa, em todo o seu bloco, um fundo com cor semântica; o título do estado neutro usa a cor principal de texto, e à direita ficam "Detalhes" e a ação principal.
- Na falha de conexão ou durante a reconexão, o conteúdo já carregado é mantido em versão esmaecida e somente leitura (sem novo owner de cache); na desconexão voluntária e sem conteúdo já carregado, exibe-se o placeholder "O dispositivo não está conectado; conecte-se para continuar esta sessão".
- O campo de entrada preserva o rascunho, e o motivo de não ser possível enviar é escrito ao lado do botão de envio.

Critérios de aceite:

- [x] Após uma desconexão voluntária, a página da sessão exibe o banner e o placeholder, e deixa de ficar em branco. Ao cobrir o fluxo com E2E, reproduzir o caminho que gerava a página em branco.
- [x] O campo de entrada preserva o rascunho, o envio fica indisponível e o texto do placeholder explica o motivo; nada é enfileirado nem enviado automaticamente após a reconexão. Precisa de testes da área da sessão.
- [x] Quando uma condição de corrida faz o envio falhar, a mensagem de erro categorizada e "Reconectar" são exibidos, com a categoria do retorno correta.
- [x] Em cada visão de tarefa, o projeto offline mantém uma linha de placeholder, e a conexão pode ser iniciada dali.
- [x] `ZCODE_REMOTE_WORKSPACE_DISCONNECTED` não aparece mais na busca ⌘K.
- [x] Reconexão no lugar com credenciais completas: não abre o assistente, a linha do projeto mostra "Conectando" e, no sucesso, não incomoda o usuário. Coberto por E2E.
- [x] Quando a reconexão falha ou é necessária a ação do usuário, o assistente para na tela e no ponto de espera corretos. Precisa de testes do assistente.
- [x] A regra de intenção dos quatro pontos de entrada é consistente; depois de conectar pela página de configurações, o usuário entra na seleção de diretório e pode escolher "Selecionar depois". Coberto por E2E.
- [x] Atualizar os trechos correspondentes da spec de UX e da spec de navegação, e sincronizar o catálogo de casos E2E.
- [x] Após a aprovação de todas as verificações abaixo, fazer o commit local: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, testes unitários afetados e E2E de SSH afetados.

## Registro de implementação e verificação (2026-09-28)

- O banner de sessão desconectada, o conteúdo somente leitura e o rascunho, o bloqueio de envio, o placeholder nas visões de tarefa, o retorno categorizado e o ponto de entrada unificado de reconexão foram implementados. Falhas comuns e logs permanecem com o owner existente; quando é necessária interação, é entregue a um único assistente, preservando a intenção do diretório original.
- O teste real no celular cobriu o caminho de deslogar os services inválidos depois que o Source se desconecta, mantendo o Root atual e reconstruindo a bridge replayable. A reconexão explícita bem-sucedida espera o fim da recuperação antiga e então reverifica o workspace, evitando perder o despertar da recuperação ou recuperar em outro projeto; os testes de regressão de concorrência correspondentes falharam antes e passaram depois.
- A revisão de spec e de especificação não deixou pendências. `pnpm typecheck`, `pnpm lint` (0 erros, 64 avisos já existentes), `pnpm architecture:check --changed` (0 violações), a checagem de tipos E2E e de fixtures passaram; os testes unitários direcionados passaram. A suíte completa de testes unitários foi executada com o `ZCODE_TEST_POOL=forks pnpm test:unit` fornecido pelo repositório: 2.033 arquivos / 18.694 itens passaram, 2 arquivos / 14 itens foram pulados conforme a configuração; as duas asserções antigas do único arquivo que falhou ainda exigiam que a barra lateral abrisse o assistente diretamente. Depois de atualizar o contrato unificado de entrada de reconexão do projeto já confirmado nesta ticket, todos os testes unitários modificados e o arquivo que falhou foram retestados em série: 20 arquivos / 294 itens passaram. Por fim, apenas as asserções de teste e a checagem de erro de inicialização foram modificadas, sem alteração do código de produção; a suíte completa não foi repetida, e o código de saída da primeira execução completa não foi registrado como sucesso. A estouro de memória do pool de threads padrão também não é evidência de aprovação.
- E2E local do Electron RPN PASS: `desktop-e2e-20260927163345863-p2314-13cd15bfd21db756`, cobrindo os placeholders offline de agrupamento, linha do tempo, fixados e arquivados, o detalhe do dispositivo e o ponto de entrada de espera por credenciais.
- E2E de SSH real PASS: `r3-server-rdux08-visual-20260928-04`, cobrindo o caminho que antes gerava a página em branco, a preservação do rascunho sem envio, a reconexão no lugar com credenciais completas e o "Selecionar depois" após conectar pela página de configurações; a checagem visual das capturas de tela do desktop em 1400/480px nos temas claro e escuro passou.
- E2E real de relay + SSH no celular PASS: `r3-server-rdux08-mobile-20260928-11`. Cobrindo o desktop continuando a rodar quando a rede do celular cai, a recuperação via replay no celular, o FIFO nas duas pontas sem perdas nem duplicatas, sem Host/SSH/Agent adicionais, além do banner no celular depois que o SSH Source se desconecta, o rascunho com envio bloqueado, a reconexão no lugar no celular e o tema claro/escuro a 390px.
- Os parâmetros de SSH foram criados pelo [harness](../../../harness/remote/README.md) do repositório, que sobe um container isolado e gera e injeta credenciais temporárias. A primeira execução contornou essa entrada e ficou sem as variáveis de ambiente, o que não significa que o usuário precise completar a configuração. A conta de teste foi isolada das janelas de marketing online por meio do mock de conta já existente, e a inicialização de preferências do primeiro onboarding foi concluída pela UI normal. O ambiente de teste foi macOS Desktop → container Docker Linux isolado local; o celular usou o viewport Chrome mobile e um relay de teste real; não foram cobertos celular físico nem WAN entre máquinas.
- Os E2E candidatos permanecem como pending; não houve promoção manual nem admissão no Docker CI. As verificações necessárias, o reteste de regressão da falha e a autoverificação do diff foram concluídos, com commit local conforme o acordo de implementação, sem push.
