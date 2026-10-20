# 10 — Assistente de três telas: esqueleto, tela unificada de seleção e linha de progresso recolhida

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:**

- [04 — Correções P0 do assistente e extração do controlador de fluxo](./04-wizard-p0-fixes-and-flow-controller.md)
- [06 — Protótipo de interação e revisão](./06-interaction-prototype-review.md)

**Comportamentos a entregar:**

Conforme o protótipo aprovado na revisão, mudar o assistente de conexão para três telas: seleção → conectando → escolha de diretório.

- **Estrutura geral**: remover a barra de etapas do lado esquerdo e substituí-la por uma dica de progresso leve no topo; a altura do assistente se adapta ao conteúdo.
- **Primeira tela: lista unificada e pesquisável**, contendo:
  - os dispositivos salvos, com o diretório recente de cada um;
  - os Hosts do `~/.ssh/config`;
  - as distribuições WSL detectadas, exibidas apenas no Windows;
  - os contêineres Docker em execução, exibidos apenas quando o Docker está disponível.

  No fim da lista ficam "Nova conexão SSH" e as entradas manuais de WSL e Docker. Clicar em qualquer item já inicia a conexão. O diretório recente de um dispositivo offline também pode ser clicado, e o efeito é "conectar e abrir".

- **Recolher**: com o assistente recolhido, o topo da área de projetos da barra lateral exibe uma linha de progresso; clicar nela restaura o assistente; o resultado de uma conexão com falha é preservado até o usuário visualizá-lo.
- **Fechar**: fechar o assistente cancela a conexão e limpa o rascunho; o histórico de entradas é preservado.

Corresponde às partes de estrutura geral, primeira tela, formulário, recolhimento e fechamento da seção "Assistente de conexão (três telas)" da especificação pai.

Escopo:

- **Formulário**:
  - Validação por campo: a porta precisa ser numérica, e host e usuário removem automaticamente os espaços no início e no fim.
  - É possível submeter com Enter, e ao trocar de tela o foco acompanha para a nova tela.
- **Defeitos corrigidos junto**:
  - A dica de alias só aparece quando um alias realmente foi escolhido, e não se repete.
  - A seleção no dropdown do Docker e a entrada manual são mutuamente exclusivas, e cada uma tem seu rótulo; "Docker indisponível" e "Nenhum contêiner em execução" são dois avisos distintos.
  - No macOS o WSL não é exibido.
  - A versão oficial não exibe a dica do modo de desenvolvimento.
  - Usuários de primeiro uso são marcados como "Etapa 1 concluída", e com conexões conhecidas a etapa 2 pisca antes.
- **Owner do estado**: o estado de "conectando" tem um único owner, que é a sessão do assistente; a linha de progresso da barra lateral apenas lê esse estado, sem guardar uma cópia própria.

**Conclusão da revisão do protótipo** ([Conclusão da revisão em 06](./06-interaction-prototype-review.md#comments)): a interface é implementada conforme o protótipo aprovado na revisão, e os pontos abaixo seguem o 06.

- A linha de progresso da barra lateral com o assistente recolhido passa a ser um cartão pequeno de duas linhas: a primeira linha é "Conectando <nome do dispositivo>…" e a porcentagem, e a segunda é a etapa atual, com uma barra de progresso logo abaixo; após uma falha, ela permanece como um cartão em cor de perigo, indicando o motivo e permitindo clicar para visualizar. Isso diverge da formulação de linha única da especificação pai; esta issue prevalece.
- Os agrupamentos, o layout e o rodapé da tela de seleção e do formulário de nova conexão SSH seguem o protótipo.

Critérios de aceite:

- [x] **Quantidade de operações da primeira conexão SSH**: a partir de um Host do config, passando pela digitação da senha, pela confirmação de instalação e pela escolha do diretório, o total é de cerca de 4～5 cliques e 1 digitação. O E2E registra a quantidade real de cliques.
- [x] **Lista da primeira tela**: as origens da lista, a busca e o "clique para conectar" funcionam conforme a especificação, com cobertura de teste do assistente; o diretório recente de um dispositivo offline conecta e abre o diretório ao ser clicado, com cobertura de E2E.
- [x] **Formulário e correções de defeitos**: a validação do formulário, o envio com Enter, a mudança de foco e as correções de Docker, WSL, macOS e dicas de desenvolvimento têm cobertura de teste.
- [x] **Recolhimento e fechamento**: com o assistente recolhido, a barra lateral exibe a linha de progresso e o resultado de falha é preservado; após o fechamento, o rascunho é limpo. Há cobertura de teste e de E2E.
- [x] **Owner único**: a linha de progresso da barra lateral apenas lê o estado da sessão do assistente, sem uma segunda cópia.
- [x] **Conferência visual**: a interface é idêntica às capturas do protótipo; também são tiradas capturas nos temas claro, escuro e com janela de 900px.
- [x] **Atualização das especificações**: atualizar a especificação de UX e a de navegação, e sincronizar o catálogo de casos de E2E.
- [x] **Verificações antes do commit**: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E de SSH afetados passam; só então o commit local é feito.


## Comments

### Implementação e aceite (2026-09-29)

- O progresso no topo das três telas, a lista unificada com busca, o layout do formulário SSH e as entradas manuais de Docker/WSL foram implementados; o diretório recente de um dispositivo offline conecta pela rota original e é aberto. As telas de configuração, conexão e diretório podem ser recolhidas e restauradas; o pedido de diretório é desfeito ao desmontar, e o fechamento e a troca de destino limpam o rascunho. A barra lateral registra apenas o contêiner DOM, e o cartão é renderizado diretamente pela única sessão do assistente.
- A regressão de DOM do assistente passou em 54 casos; cobre a preferência externa de WSL, a retenção do alias após falha de leitura do config, a resposta tardia de diretório, a limpeza ao fechar, o encerramento bem-sucedido em segundo plano e a intenção de conexão existente. A regressão de edição de conexão e do helper de SSH foi verificada junto.
- Os E2E reais de SSH RDUX-10-01～04 passaram: `desktop-e2e-20260928160405047-p51001-d93013e144937095`. Da primeira instalação via config Host até a abertura do diretório, foram medidos **5 cliques de botão e 1 digitação de senha**; o diretório recente de um dispositivo offline, a retenção da falha após recolher, a visualização e a limpeza do rascunho ao fechar têm as devidas asserções. Foram geradas 16 capturas de tela no total, em temas claro/escuro × 1440/900px (tela de seleção, dispositivos salvos, nova conexão SSH e cartão de falha), conferidas contra o protótipo do 06; as capturas ficam no diretório local de artefatos desse run.
- SSH CONN-01/02 e CONN-03 passaram: os dois specs correspondentes de `desktop-e2e-20260928160027687-p49292-629542e903aac76c`; CONN-06/07 passaram: o `desktop-e2e-20260928160405047-p51001-d93013e144937095` acima. Os novos casos continuam como Pending, sem promoção manual nem admissão no CI.
- A revisão pelos eixos Standards / Spec não deixou apontamentos em aberto.
- A auditoria global adicional de case coverage ainda reporta as referências e estatísticas pré-existentes D19/I74/I75 e o drift de documentos gerados; a conferência com o catalog/matrix usando o ponto de partida da implementação `bcc1ae5fc885d451975d59925cbb3f6e75195801` obtém os mesmos erros. A nova checagem de contrato de fixture passou, e não se estende a modificação desses problemas de documentos já existentes.

- Verificação final: `pnpm typecheck`, `pnpm lint` (64 avisos preexistentes, 0 erro), `pnpm architecture:check --changed`, `typecheck:e2e` do desktop e a checagem dos novos fixtures passaram. A coleta completa final de testes unitários reuniu 2.035 arquivos e 18.726 testes, com **18.712 aprovados e 14 skips preexistentes**; em uma execução concorrente anterior, as duas categorias de checagens de carregamento nativo/subprocesso sofreram timeout, mas a reverificação seriada independente passou 4/4, e a execução completa final também passou. O `/remote` do celular não teve a interação alterada, e os testes unitários existentes relacionados acompanharam a regressão completa, sem nova execução do E2E de relay do celular.
