# 19: Adicionar projeto remoto existente

Status: done

**Parent:** [#15 — Separação entre criação de projeto e gestão de conexão remota](15-project-device-selection-and-connection-management.md)

**O que construir:** depois de selecionar um dispositivo remoto no novo formulário de projeto, o usuário pode navegar e adicionar projetos existentes daquele dispositivo por meio de «Adicionar projeto existente deste dispositivo…», continuando a acessar suas tarefas no computador local. Esse caminho é explicitamente separado da criação de novo projeto e, ao voltar, preserva o rascunho de projeto novo ainda não enviado.

**Bloqueado por:** [#18 — Criação direta de projeto e seleção de dispositivo existente](18-direct-project-creation-and-device-selection.md). Esta issue precisa do formulário, do dispositivo selecionado e do caminho completo de conexão explícita dentro do projeto.

**Cobertura da spec:** Q9; RDUX15-15, RDUX15-16, cobrindo também as ramificações de conexão offline, espera e invalidação de RDUX15-07／18／20. RDUX15-23／24／25 cobrem a interação dessa listagem e os limites de plataforma.

## Acceptance criteria

- [x] Depois que o formulário de projeto seleciona um dispositivo remoto, a área de pasta de origem oferece a entrada secundária «Adicionar projeto existente deste dispositivo…»; não é exigido preencher antes o nome ou o diretório do novo projeto.
- [x] Ao clicar, entra-se na listagem de projetos existentes daquele dispositivo dentro do mesmo diálogo. Dispositivos offline são conectados dentro do fluxo de projeto atual, preservando a intenção de escolher um projeto existente; depois de complemented as credenciais, instalar ou ter sucesso na retentativa, o fluxo continua na listagem original, sem entrar na criação de novo projeto nem na página de configurações de adição.
- [x] Depois que o usuário seleciona um projeto da listagem, apenas o registro local (entrada local) desse projeto é registrado, e ele pode continuar acessando suas tarefas originais; não se chama a criação de novo projeto para simular a adição de um projeto existente.
- [x] Projetos diferentes no mesmo dispositivo e no mesmo diretório mantêm identidades de projeto distintas e podem ser selecionados separadamente; adicionar o mesmo projeto repetidamente não gera entradas locais duplicadas. A semântica existente de criar um projeto no mesmo diretório não é alterada para reutilização automática.
- [x] Ao voltar da listagem, nome, dispositivo e diretório selecionado são restaurados no rascunho de criação original; o carregamento, a falha, o cancelamento e a retentativa da listagem não sobrescrevem nem enviam esse rascunho.
- [x] Quando um servidor antigo só suporta a leitura de projetos existentes, ainda é possível navegar e adicionar; a capacidade somente-leitura não é reportada erroneamente como ausência de projetos, e operações novas não suportadas não são permitidas.
- [x] Se, antes de a requisição da listagem retornar, o dispositivo for trocado, o fluxo for cancelado ou a intenção original for invalidada, os resultados antigos não podem substituir a listagem do novo dispositivo, adicionar projetos nem disparar navegação; o cancelamento libera apenas os recursos desta execução, sem afetar a conexão compartilhada.
- [x] A abertura／reconexão explícita de um projeto existente continua preservando a identidade e o diretório originais do projeto, sem ser tratada como outro rascunho de projeto novo; o histórico de projetos e a atribuição de tarefas não migram nem são removidos.
- [x] A seleção por teclado, o retorno de foco, os estados vazio／de erro, nomes longos e caminhos da listagem funcionam em chinês e inglês, nos temas claro e escuro atuais e em janelas estreitas; Web／celular seguem as capacidades de Host já existentes.
- [x] Testes são escritos antes da implementação, cobrindo as asserções de identidade ponta a ponta e a verificação de cancelamento abaixo; a entrada substituída e asligações inúteis só são removidas depois de a migração da entrada existente estar concluída e se confirmar que não há usuários remanescentes.

## Verification

- Em um servidor remoto real, preparar um projeto com tarefas existentes; depois de adicioná-lo pelo novo formulário, ler as tarefas originais e asseverar o ID do projeto, a atribuição de tarefas e a quantidade de entradas locais; a adição repetida também deve ser asseverada, e não apenas verificado que o nome do projeto aparece.
- Preparar projetos diferentes no mesmo diretório e a capacidade somente-leitura de servidores antigos, verificando seleção, deduplicação e o bloqueio por capacidade; reaproveitar o contrato existente do serviço de projetos e a organização de E2E.
- Atrasar a listagem de projetos existentes ou o resultado da conexão, cancelar ou trocar o alvo e liberar, verificando que os resultados antigos não têm efeito colateral; ao voltar ao rascunho, conferir todos os valores originais.
- A implementação deve passar pela checagem de tipos, lint, portão de arquitetura, testes unitários afetados, E2E do Desktop correspondente, além das regressões de UI compartilhada／celular e da verificação visual aplicáveis; registrar os limites de evidência da verificação em servidor real e da compatibilidade somente-leitura.

## Scope and handoff

- Não há lógica nova de deduplicação de projetos por caminho, de migração de projeto remoto ou de reatribuição de tarefas. Apenas ajustam-se a entrada e a passagem de turno, reaproveitando a capacidade existente de consulta de projetos remotos e de registro de entrada local.
- A continuação em segundo plano desse fluxo e a retomada explícita são conectadas por [#22](22-background-connection-and-explicit-resume.md); nesta issue, o retorno de primeiro plano, o cancelamento e a proteção contra resultados atrasados precisam estar completamente funcionais primeiro.


## Comments

2026-10-12: concluída conforme Q9 a entrada de projeto existente e a fronteira de cancelamento de primeiro plano. O ProjectEditor mantém uma única cópia do rascunho de criação; o RemoteProjectList apenas lê o dispositivo selecionado e registra a entrada com o `projectId` original após a seleção explícita; o caminho de criação da entrada de conexão antiga continua preservado por um wrapper de compatibilidade. Servidores antigos somente-leitura são verificados no contrato de UI e de serviço de projetos: legíveis, selecionáveis, registráveis, com criação restrita.

Verificação: `pnpm typecheck` da raiz, `pnpm lint` (208 warnings existentes, 0 error), portão de arquitetura, checagem de tipos e de fixtures de E2E aprovados. A seleção `--files` desta issue atingiu 661 arquivos de teste; o grupo principal do Vitest, com 657 arquivos／6367 testes, e a auditoria de Node passaram; 4 contratos de servidor antigo／armazenamento de projetos／entradas, totalizando 24 itens, passaram. Após integrar o #20, a regressão principal de criação／retorno das configurações／cancelamento e credenciais iniciais, com 5 arquivos e 93 itens, passou.

E2E do Desktop com SSH real 1/1 aprovado: o ID／atribuição do projeto e das tarefas originais, dois projetos no mesmo diretório, a adição repetida sem alteração do ID／quantidade de entradas, o retorno ao rascunho, o cancelamento de listagem atrasada e a conexão explícita offline continuando na listagem original, todos com asserções. Evidência: `packages/desktop/.e2e-artifacts/desktop-e2e-20261012110913073-p90850-7427869e2d36d636/`. Foram verificadas 8 combinações de capturas de tela em chinês/inglês × Zai Light/Dark × 1440/480px. A regressão geométrica mediu primeiro que a altura de linha padrão do grid, 48px, não comportava o texto de 65px (scrollTop=0); após mudar para a altura de linha de conteúdo, as asserções de limite por linha e todas as capturas passaram; as evidências de falha foram preservadas em `desktop-e2e-20261012110708521-p87877-215c3ab6cbef90b0`.

Limites de evidência: o SSH real usa o runtime atual; o binário de versão antiga não foi executado separadamente, e os ramos de compatibilidade foram verificados pelo fixture de serviço legado existente e por testes de UI observáveis. WSL e celular físico mantêm TODO conforme solicitado pelo usuário, sem serem marcados como aprovados. O novo E2E continua como manual-review/pending, sem promoção nem inclusão no CI.
