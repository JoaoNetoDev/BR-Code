# 03 — Modelo de apresentação da conexão remota, 5 estados e glossário

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** [02 — Log de conexão e contrato de erros](./02-connection-log-and-error-contract.md). A classificação de erros deste ticket deve cobrir todos os códigos de erro definidos em 02.

**Comportamentos a entregar:**

- **Consistente em todos os lugares**: para o mesmo dispositivo, cor do estado, texto e ação principal são idênticos na barra lateral, no cabeçalho da sessão, no cartão de detalhes, na página de configurações, no assistente e na linha da tarefa.
- **Apenas 5 estados**: o usuário só precisa conhecer estes 5 estados: conectado, conectando, desconectado, requer atenção e falha de conexão.
- **Desconexão ativa não conta como falha**: quando o usuário desconecta ativamente, exibe-se o "desconectado" em cor neutra.
- **Requer atenção tem próximo passo**: todos os casos a seguir são exibidos como "requer atenção", com a ação correspondente: precisa atualizar, precisa instalar, precisa confirmar novo dispositivo, precisa fornecer a senha.
- **Quando a máquina local está desatualizada, apontar para o desktop**: quando a versão do desktop local está desatualizada, o usuário é orientado a atualizar o desktop.
- **Não há mais terminologia de engenharia**: a interface não exibe mais terminologia de engenharia.

Corresponde às seções "Modelo de apresentação da conexão remota", "Classificação de erros de conexão", "Terminologia e textos" e "Design system" da especificação pai.

Escopo:

- **Modelo de apresentação**: criar um novo módulo de funções puras na camada de UI, com dois pontos de entrada: mapeamento de estados e classificação de erros. Entradas, saídas e regras de decisão conforme a especificação pai.
  - Usá-lo para substituir os três conjuntos existentes de mapeamento de estado, bem como o mapeamento existente de textos de erro.
  - Migrar todas as telas consumidoras para o modelo de apresentação, preservando o layout atual, sem reordenar o visual. O redesenho do layout fica a cargo de 10～13.
- **Design system**: adicionar a cor semântica "em andamento". "Conectando" deixa de usar a cor do tipo SSH ou o âmbar.
- **Correção de defeitos**:
  - Aparecem dois indicadores de carregamento enquanto conecta.
  - "Recuperação automática n/3" precisa estar visível na interface, e não apenas no `aria-label`.
  - Quando a máquina local está desatualizada, a ação principal deve ser "atualizar o desktop"; o botão "conectar" não deve ser ocultado por engano.
  - Dispositivos que precisam de instalação ou de atualização não aparecem mais como "offline".
- **Terminologia**:
  - Limpar todos os textos em chinês e inglês relacionados ao remoto, conforme o glossário da especificação pai.
  - Renomear a seção de configurações para "dispositivos remotos".
  - Reescrever os termos jargões "troca de geração" e "versão oficial" e os textos dos relatórios de migração em formulações que o usuário consiga entender.
- **Consolidação de especificações entre módulos**:
  - Escrever na [Especificação de UX de conexão de dispositivos remotos](../../architecture/remote-device-connection-ux-spec.md) a tabela de mapeamento de estados, o glossário, a tabela de classificação de erros e os cenários de aceite.
  - Marcar as passagens das especificações antigas que foram substituídas.
  - Atualizar o índice da [Entrada de leitura da cadeia principal remota](../../remote/README.md).
  - Atualizar o [DESIGN.md](../../../DESIGN.md) e as [convenções de token](../../../DESIGN.md).
  - Registrar em [R3 open issues](../../architecture/r3-source-server-remote-open-issues.md) as questões subsequentes surgidas do item "fora do escopo" da especificação pai.

Critérios de aceite:

- [x] **Testes de mapeamento de estado**: cobrir com testes baseados em tabela todas as combinações de entrada listadas na especificação pai, verificando o estado visível, o texto curto, a cor semântica, o ícone e a ação principal.
- [x] **Testes de classificação de erros** cobrindo:
  - todos os códigos de erro de 02, além do fallback para casos desconhecidos;
  - as variantes de texto de cada modo de conexão;
  - "usar download remoto" aparece apenas no SSH e quando o download local foi escolhido.
- [x] **Todas as interfaces leem apenas o modelo de apresentação**: barra lateral, cabeçalho da sessão, cartão de detalhes, cartão de configurações, assistente, linha da tarefa e os pontos de status da navegação de configurações leem o estado somente do modelo de apresentação; os mapeamentos antigos foram removidos. Cada interface tem teste de componente que verifica renderizar a saída do modelo.
- [x] **Desconexão ativa**: após a desconexão ativa, a barra lateral e a página de configurações exibem "desconectado" em cor neutra. Coberto por E2E.
- [x] **Precisa atualizar**:
  - Exibe "requer atenção · precisa atualizar".
  - Quando o desktop local está desatualizado, a ação principal é "atualizar o desktop".
  - Antes da correção, escrever o teste de reprodução.
- [x] **Reconexão silenciosa na inicialização**: cada linha de projeto tem apenas um indicador de carregamento; o progresso da recuperação automática fica visível na interface.
- [x] **Tokens de design**: a cor semântica "em andamento" é registrada na especificação de design e no documento de tokens. A cobertura dos testes de conformidade de tokens da UI remota é estendida e passa.
- [x] **Varredura de termos proibidos**: adicionar um teste que varre os pacotes de idiomas em chinês e inglês relacionados ao remoto e confirma que nenhum dos termos proibidos listados na especificação pai aparece. Todos os textos novos e reescritos existem em chinês e em inglês.
- [x] **Sincronia de especificações e casos**: consolidação de especificações entre módulos concluída, todos os links funcionando; sincronizar o catálogo de casos conforme o [fluxo de E2E](../../../.agents/skills/e2e-case-lifecycle/SKILL.md).
- [x] **Verificações obrigatórias**: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E afetados passam; só então o commit local é feito.

## Registro de verificação (2026-09-27)

- Os cinco estados e a classificação de erros foram unificados em um módulo de apresentação com funções puras na camada de UI; o texto original do dispositivo e o erro de exibição do projeto entram como entradas separadas, e a ação de correção é associada à conexão que de fato originou o estado. Barra lateral, cabeçalho da sessão, cartão de detalhes, cartão de configurações, assistente, rótulo da tarefa e navegação de configurações leem o modelo.
- A revisão de dois eixos (spec/especificação) foi concluída com aprovação. Os problemas de despacho de ações, seleção de conexão com erro, fatos de restauração de projeto e cobertura de erros localizados apontados na revisão têm regressão.
- `pnpm typecheck`, `pnpm lint` (apenas avisos preexistentes), `pnpm architecture:check --changed` e a checagem de tipos dos E2E do desktop passaram. A regressão final afetada terá 95 arquivos e 755 casos aprovados, incluindo os testes unitários já existentes de replayable/isolamento/restauração no celular; não houve verificação em aparelho real no celular.
- Os três casos reais de SSH passaram: RDUX-STATE de desconexão ativa com cor neutra; SSH-P0-CONN-01/02 de nova senha incorreta com nova tentativa e de primeira instalação/seleção de diretório; RDUX-LOG de recusa de conexão e filtro de logs. Artefato: `packages/desktop/.e2e-artifacts/rdux03-verified-final`. Foram verificadas capturas de tela do desktop em chinês/inglês, light/dark e 1400/900px; os novos casos permanecem como pending e não são promovidos manualmente de forma automática.
- Sincronizados o case catalog, a coverage matrix e a fila de execução do servidor remoto; a validação dos novos fixtures passou. Corrigida a corrida em que a inicialização dos testes SSH existentes decidia sobre a tela de orientação antes da primeira tela, bem como as asserções antigas do teste de telemetry após a extensão dos códigos de erro em 02.
- **Limitação da execução completa**: a suíte completa de testes unitários exigida na implementação foi executada, com 18.586 casos aprovados; as asserções antigas deste ticket e as alterações feitas após a revisão foram todas verificadas pela regressão final afetada. As falhas de base restantes são duas ocorrências de `ReferenceError: mode is not defined` em `packages/services/test/repoSnapshotUploadTransport.test.ts:133`, que continuam falhando mesmo em reexecução isolada; esse arquivo e o blob do HEAD são idênticos (`8738440a41e8e19f98a31918a54b7cc61ee8ce6b`), e este ticket não alterou services. A falha de limiar de memória no upload que apareceu na execução completa passou em uma reexecução isolada.
- Após tomar conhecimento das duas falhas de base acima, o usuário autorizou explicitamente o registro da exceção e o commit local das mudanças deste ticket; as falhas de base não foram incluídas na correção deste ticket.
