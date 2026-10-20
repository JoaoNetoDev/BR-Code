# 11 — Redesenho das telas de "Conectando" e de Seleção de Diretório

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:**

- [03 — Modelo de exibição da conexão remota, 5 estados e glossário](./03-presentation-model-states-and-glossary.md): a exibição das categorias de erro depende dele.
- [10 — Assistente de três telas: esqueleto, tela unificada de seleção e linha de progresso recolhida](./10-three-screen-wizard-and-selection.md)

**Comportamentos a entregar:**

**Tela de "Conectando"**

- **Topo e lista de etapas**:
  - No topo são exibidos o nome do dispositivo e a etiqueta do método de conexão.
  - A lista de etapas é gerada conforme o método de conexão; a etapa atual aparece em negrito e mostra o tempo decorrido.
  - As etapas de upload e download exibem barra de progresso e velocidade.
- **Situações que exigem confirmação do usuário** são confirmadas diretamente na lista, sem janelas adicionais:
  - Instalação de novo componente: exibe a versão real, o local de instalação e o espaço ocupado.
  - O dispositivo já foi reinstalado: após a confirmação, passa a ser usado como um novo dispositivo.
  - Há tarefas em execução durante uma atualização forçada: lista essas tarefas.
- **Log e erros**:
  - O log vem recolhido por padrão e é expandido automaticamente em caso de falha.
  - Os erros são exibidos conforme as categorias definidas em 03: título, causa, ação de correção e detalhes copiáveis.
- **Rodapé e remoção de itens**:
  - No rodapé, à esquerda fica "Continuar em segundo plano" e, à direita, "Cancelar conexão".
  - Removem-se o diagrama de cadeia de links e o ID curto do dispositivo.

**Tela de seleção de diretório**

- **Caminho e navegação**:
  - Exibe o caminho completo.
  - Ao clicar em um chip de "Recentes" ou "Histórico remoto", o navegador de diretórios salta para o destino correspondente.
- **Erros e "escolher depois"**:
  - Quando o diretório não pode ser aberto, usa-se uma mensagem amigável.
  - Mantém-se o "Escolher depois" adicionado por [08](./08-disconnect-experience-and-in-place-reconnect.md).
- **Nota de limite**: "Local offline, as tarefas continuam rodando" passa a ser uma linha dispensável na página, exibida apenas uma vez.
- **Barra de status e renomeação**:
  - A barra de status deixa de repetir o nome do dispositivo.
  - Após renomear o dispositivo, exibe-se um feedback de salvamento.

Corresponde à segunda e à terceira telas da seção "Assistente de conexão (três telas)" da especificação pai, bem como ao layout da tela de "Conectando".

Escopo:

- **Defeitos corrigidos junto**:
  - A confirmação de instalação exibe uma versão falsa e um local fixo no código.
  - O primeiro item da lista de etapas é cortado.
  - Aparecem placeholders no banner de sucesso.
  - Não há nenhum feedback após renomear o dispositivo.
  - A nota de limite interrompe a conexão na forma de pop-up.
- **Progresso de download**: reaproveita os eventos de progresso já existentes.

**Conclusões da revisão do protótipo** ([06 — Conclusões da revisão](./06-interaction-prototype-review.md#comments)): a interface segue o protótipo aprovado na revisão; os pontos abaixo prevalecem conforme o 06.

- Em caso de falha de autenticação, a senha ou a passphrase da chave privada são reinseridas nesta própria tela, com a mesma interação de "precisa de senha"; só se retorna ao formulário quando for necessário trocar o usuário ou o arquivo de chave privada. A tabela de categorias de erro da especificação de UX já foi sincronizada.
- Nomes das etapas: "Confirmar conexão" passa a "Identificar dispositivo"; a etapa "Conexão pronta" é removida e, após o sucesso, o fluxo vai direto para a tela de seleção de diretório ou abre o projeto conforme a intenção.
- O texto da ação secundária para falha de deploy é "Baixar direto no dispositivo". A especificação de UX já foi sincronizada.
- A lista de etapas da tela de "Conectando", os pontos de espera embutidos e os blocos de erro, as regras de recolhimento do log, bem como o layout da tela de seleção de diretório, seguem o protótipo.

Critérios de aceite:

- [x] Todos os elementos da tela de "Conectando" têm cobertura de testes do assistente; o E2E faz asserção, na etapa de confirmação de instalação, de que são exibidos a versão real e o local de instalação.
- [x] As etapas de upload e download exibem barra de progresso e velocidade.
- [x] As três situações — falha de autenticação, recusa de conexão e falha na etapa de deploy — exibem o erro e a ação de correção correspondente; as duas primeiras têm cobertura E2E.
- [x] O caminho completo, a navegação por chips, a mensagem de erro de diretório e o "Escolher depois" da tela de seleção de diretório têm cobertura de testes.
- [x] A nota de limite não interrompe mais a conexão na forma de pop-up, com cobertura E2E.
- [x] Comparação com o protótipo; capturas de tela nos temas claro e escuro e em janela de 900px.
- [x] Atualização da especificação de UX e sincronização do catálogo de casos E2E.
- [x] Commit local após passarem `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E de SSH afetados.


## Comments

### Implementação e verificação (2026-09-29)

- Dentro da etapa de conexão, unificou-se a entrada de senha/passphrase, a pré-visualização da instalação, a confirmação de reinstalação do dispositivo e a confirmação de atualização forçada com tarefas em execução; cancelamento, recolhimento e a intenção original de diretório foram preservados. A duração de cada etapa cobre casos normais que cruzam o segundo e o caso da meia-noite; upload/download incluem velocidade, tamanho e tempo restante estimado, e o log continua consolidando o progresso. Mesmo com o erro de autenticação em chinês do SSH real envolvido pelo preflight, o fluxo retorna corretamente ao input de credenciais dentro da etapa.
- Os chips de diretório navegam de forma sincronizada e descartam requisições atrasadas; durante carregamento/erro não é possível abrir um diretório não confirmado; caminho completo, erros amigáveis, "escolher depois", feedback de salvamento/falha de nome e a notificação única e não bloqueante foram implementados. A barra de status do diretório não repete o nome do dispositivo.
- Os achados técnicos da revisão de dois eixos (Standards e Spec) foram corrigidos e reconferidos. **O usuário confirmou em 2026-09-29 a expansão de escopo**: passam a ser permitidos a pré-visualização de instalação somente-leitura e a lista de tarefas em execução no snapshot de gerenciamento, bem como o `running-tasks --json`. A especificação pai foi sincronizada, sem alterar o formato persistido de status, o owner de tarefas, o isolamento de identidade nem continuous/replayable.
- `pnpm typecheck`, `pnpm lint` (64 avisos pré-existentes, 0 error), `pnpm architecture:check --changed`, `typecheck:e2e` do desktop e a verificação de fixtures das três telas passaram. A regressão final afetada passou com 32 arquivos e 356 testes; em seguida, a regressão de autenticação em chinês/ícone de espera/barra de status passou com 67 testes.
- A suíte completa de testes unitários exigida pelo implement foi executada: 18.718 passaram, 14 ignorados, 5 falharam. 1 deles é uma asserção de terminologia substituída pela decisão "Identificar dispositivo" do 06, já atualizada e verificada com sucesso; os demais são 1 de `desktopResourceTelemetry`, 2 de `r3RemoteProcess` e 1 de `settingService` com problema de timeout/saída de subprocesso — esses arquivos não foram alterados e a reverificação serial independente dos 66 testes relacionados passou integralmente. Não se alegou que a primeira rodada completa ficou toda verde, nem se repetiu a suíte inteira.
- O E2E com SSH real final passou em **4/4 specs**: `desktop-e2e-20260928171512189-p86116-9ec1bbe80ceb67aa`, cobrindo RDUX-10/11 de primeira instalação/diretório, SSH-P0-CONN-01/02 de nova tentativa de autenticação, CONN-06/07 de credenciais ausentes e reaproveitamento online, e RDUX-LOG de recusa de conexão. A primeira instalação exigiu **4 cliques e 1 input**, com asserções sobre a versão real `3.12.2` e o local absoluto de instalação remota. Foram tiradas 24 capturas de tela (instalação/diretório, tela de seleção e cartões de falha) em tema claro/escuro × 1440/900px, além de capturas de recusa de conexão; todas foram conferidas contra o protótipo do 06. As capturas foram mantidas no diretório local de artifacts daquele run.
- O catálogo de casos e a coverage matrix foram sincronizados. Casos pendentes não foram promovidos manualmente nem admitidos no CI. O `/remote` do celular não alterou a entrada de gerenciamento e seguiu a regressão completa existente; não foram executados na prática o relay do celular, um celular físico ou máquinas reais com WSL/Docker — para estes dois últimos há regressão de DOM na linguagem das etapas.
