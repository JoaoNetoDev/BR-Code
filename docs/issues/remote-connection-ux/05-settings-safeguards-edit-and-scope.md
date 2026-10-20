# 05 — Salvaguardas da página de configurações, edição de conexão e marcação de escopo

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** nada, pode começar imediatamente.

**Comportamentos a entregar:**

- **Operações perigosas mais seguras**:
  - A caixa de confirmação destrutiva tem o foco padrão em "Cancelar" e pressionar Enter não dispara a confirmação.
  - A caixa de confirmação de remoção de dispositivo informa quais projetos abertos serão desconectados, e o título e os botões usam a mesma redação.
  - Desconectar um dispositivo não abre caixa de confirmação, mas explica que "as tarefas remotas continuarão em execução".
- **Feedback de operação mais claro**:
  - Botões em execução não podem ser clicados novamente.
  - O estado vazio não é exibido antes da conclusão do carregamento; o estado vazio oferece um botão "Nova conexão".
  - Quando o salvamento de um switch falha, o valor é revertido.
  - O horário de "visto por último" é preciso.
  - "Mostrar na barra lateral" consegue localizar o dispositivo correspondente.
  - "Reinstalar e conectar" carrega as informações deste dispositivo.
  - O mesmo erro não é exibido duas vezes.
- **Edição de conexão**:
  - Os campos e controles do diálogo de edição são consistentes com o formulário de nova conexão.
  - O nome da conexão e o nome do dispositivo são editados separadamente.
  - O salvamento tem estado de carregamento e, em caso de falha, mostra a causa real; a redação diz com honestidade que "vale na próxima conexão".
- **Marcação de escopo**: o nome do dispositivo é mantido apenas no menu de escopo; a seção de configurações e o formulário de edição removem de forma unificada a linha de aviso "editando".

Corresponde à seção "Dispositivos remotos" da página de configurações na especificação pai (feedback e estado, caixas de confirmação, marcação de escopo), e à parte sobre o diálogo de edição de conexão da seção "Assistente de conexão".

Escopo:

- **Alterações que afetam todo o aplicativo**: o foco padrão e o comportamento do Enter nas caixas de confirmação destrutivas valem para todas as caixas de confirmação destrutivas do aplicativo.
- **Cobertura da marcação de escopo**:
  - Rotinas, plugins, MCP, habilidades, comandos, hooks e subagentes não exibem uma linha de aviso de máquina independente.
  - O mesmo vale para workspaces Docker.
  - Vale para desktop e celular, temas claro e escuro, português e inglês, com consistência entre lista e formulário de edição.
  - O menu de escopo exibe o nome do dispositivo; o workspace remoto deixa de usar o ícone de monitor.
- **Regras de escopo inalteradas**: as regras de "qual máquina seguir" de cada seção não mudam nesta rodada.
- **Campos de edição da conexão**: incluem host, botões segmentados de método de autenticação, apelido, forma de download de recursos e seleção de arquivo de chave privada.

Critérios de aceite:

- [x] **Caixa de confirmação destrutiva**: o foco padrão está em "Cancelar" e pressionar Enter não dispara a confirmação. É preciso haver cobertura de teste das caixas de confirmação, com regressão das demais caixas destrutivas do aplicativo.
- [x] **Remoção e desconexão**: a caixa de confirmação de remoção de dispositivo lista os projetos que serão desconectados, com redação consistente; a desconexão não abre caixa de confirmação e passa a ter uma explicação inline.
- [x] **Feedback de botões e estado**: botões em execução exibem estado de ocupado e não podem ser clicados novamente; estado de carregamento e estado vazio são bem distinguidos; falha ao salvar o switch reverte o valor e exibe um aviso. É preciso haver cobertura de testes de componente do painel de configurações.
- [x] **Localização e reinstalação**: "Mostrar na barra lateral" localiza os projetos do dispositivo; "Reinstalar e conectar" pré-preenche as informações deste dispositivo; o horário de "visto por último" é preciso.
- [x] **Diálogo de edição**: os campos são consistentes com o formulário de nova conexão; alterar o nome da conexão não altera o nome do dispositivo; o salvamento tem estado de carregamento e, em caso de falha, exibe a causa real.
- [x] **Marcação de escopo**: as seções e o formulário não exibem a linha de aviso "editando", e o menu de escopo mantém o nome do dispositivo. As asserções de componente e E2E foram sincronizadas com esse comportamento.
- [x] **Atualização das especificações**: os trechos da página de configurações e da edição de conexão na especificação de UX foram atualizados para o comportamento mais recente; os casos de E2E relacionados às configurações foram sincronizados.
- [x] **Verificações obrigatórias**: após `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E afetados passarem, fazer o commit local.
