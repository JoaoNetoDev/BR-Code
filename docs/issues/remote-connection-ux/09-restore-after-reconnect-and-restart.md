# 09 — Voltar ao ponto de origem após reconexão ou reinício

Status: done

**Spec pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** [08 — Experiência de desconexão e reconexão no lugar](./08-disconnect-experience-and-in-place-reconnect.md). O placeholder e o banner exibidos até a conclusão do reattach são fornecidos pela 08.

**Comportamentos a entregar:**

- **Após a reconexão**: voltar para a sessão que estava sendo vista antes da desconexão. Se essa sessão já não existir, abrir a página de novas tarefas do projeto.
- **Após reiniciar o aplicativo**: restaurar o último projeto e a última sessão ativados.
  - Antes da conclusão do reattach do projeto remoto, apenas exibir o placeholder "Conectando".
  - Se o reattach terminar como "não conectado" ou "falha", permanecer nesta aba e exibir o banner, sem pular automaticamente para o projeto local.
- **Escopo de impacto**: essas alterações afetam apenas a recuperação contínua (continuous) do desktop; a recuperação reproduzível (replayable) do celular permanece inalterada.

Isso corresponde à parte "voltar ao ponto de origem" e ao diagrama de sequência da seção "Reconexão e recuperação" da spec pai.

Escopo:

- **Quem é responsável pelo alvo de recuperação**: reaproveitar a persistência de abas já existente para registrar o alvo de recuperação, sem criar um novo owner.
- **Gate de reattach**: as regras não são afrouxadas; nenhum conteúdo de sessão remota é renderizado antes da conclusão do reattach.
- **Antes de mexer**: conferir primeiro o [documento do gate de reattach do Renderer](../../remote/desktop-remote-session-renderer-reattach.md) e depois escrever o diagrama de sequência, o owner e a ordem dos eventos na [spec de navegação](../../remote/project-first-remote-navigation-spec.md).

Critérios de aceite:

- [x] A spec de navegação contém o diagrama de sequência, o owner do alvo de recuperação e a ordem dos eventos, e está consistente com o documento do gate de reattach.
- [x] Após a reconexão, volta-se à sessão original; quando a sessão original já não existe, abre-se a página de novas tarefas do projeto. Precisa de teste de persistência de abas e cobertura de E2E.
- [x] Após o reinício, restaura-se o último projeto e a última sessão remotos ativados; até a conclusão do reattach, renderiza-se apenas o placeholder. Precisa de teste de reattach e de cobertura de E2E do caso de reconexão em cold start.
- [x] Quando o reattach falha, permanece-se na aba original e exibe-se o banner, sem pular automaticamente para o projeto local.
- [x] Regressão das duas rotas de recuperação — desktop continuous e celular replayable —; todos os testes existentes de controle remoto do celular passam.
- [x] Após a aprovação das verificações abaixo, commit local: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, testes unitários afetados, E2E afetados.


## Registro de implementação e verificação (2026-09-28)

- A recuperação de navegação continua reaproveitando a posição de projeto/ativação do TabStore e a persistência existente da seleção de pane do Layout. O cold start preserva o foco remoto original; o preenchimento em background e o reattach da Source não disputam o foco; quando a sessão original já não existe, volta-se à página de novas tarefas do projeto.
- A consulta de recuperação lê o task-index autoritativo remoto apenas na restauração de inicialização ou no limite de reattach do attachment; o ACK de nova tarefa chega antes da escrita do índice e não participa da decisão de remoção. Erros de RPC preservam o alvo; a troca de geração de navegação/attachment cancela a consulta antiga. A reconexão carrega a intenção de seleção de recuperação; a seleção comum de diretório mantém a semântica original.
- Persistência de abas, isolamento de identidade pelo mesmo caminho, restauração de pane, cancelamento de consulta, desabilitação no celular e regressão da corrida de índice de nova tarefa: primero vermelho, depois verde; os testes existentes de readiness do Renderer verificam que a camada de dados remota não é montada antes do reattach. Os problemas levantados na revisão dupla de spec e especificação local foram corrigidos e reconferidos.
- `pnpm typecheck`, `pnpm lint` (0 erros, 64 avisos preexistentes), `pnpm architecture:check --changed` (0 violações), verificação de tipos do E2E e verificação dos dois fixtures afetados passaram.
- E2E real de cold start via SSH PASS: `r3-server-rdux09-cold-20260928-03`, cobrindo reconexão no lugar, sessão B original após reinício completo de Electron/Main/Host, banner na aba original e placeholder sem conteúdo remoto com a reconexão automática desativada, e fallback para nova tarefa com ID de sessão inválido.
- E2E de recuperação com projetos mistos PASS: `r3-server-rdux09-mixed-20260928-01`, cobrindo foco remoto original, preenchimento active-first, open set sem perda/duplicação, reattach independente de siblings e retomada da tarefa original.
- E2E real de relay do celular + SSH PASS: `r3-server-rdux09-mobile-20260928-01`, cobrindo a recuperação conjunta do desktop continuous e do celular replayable; a página de teste foi construída a partir do código-fonte da branch atual. Todos usaram Electron em macOS → alvo SSH em Docker Linux isolado da própria máquina, celular em viewport do Chrome, sem verificação em aparelho físico ou em WAN entre máquinas.
- A primeira rodada de SSH foi bloqueada por um aviso publicado; com base na evidência de gravação, essas duas cases de navegação passaram a usar o mock de conta já existente. A segunda rodada expôs um problema de timing do índice de nova tarefa, corrigido e verificado por testes de regressão e pelo PASS de SSH real subsequente. A suíte completa de testes unitários foi abortada ativamente na primeira execução por pressão de memória em concorrência com o build; foi executada separadamente depois, e o aborto não foi contabilizado como aprovação.
- O E2E continua em manual-review/pending, sem promoção manual nem admissão no CI via Docker.

- Execução final completa da suíte unitária: `ZCODE_TEST_POOL=forks pnpm test:unit --maxWorkers=2 --reporter=dot`, 2.031 arquivos / 18.683 itens aprovados, 2 arquivos / 14 itens ignorados conforme a configuração, 3 arquivos / 25 itens falhando. 22 itens falharam porque os mocks antigos dos testes de layout não tinham as interfaces de selector/resolver recém-lidas; após completá-los, 24 asserções de layout passaram; outros 3 itens vieram dos testes do atualizador não modificados (timeout e contagem de chamadas anormal em seguida) e do teste de upload lento de 256 MiB em processo independente. Por fim, todos os arquivos que falharam e os testes desta alteração foram retestados em série: 7 arquivos / 217 itens, todos aprovados, sem modificar a implementação ou os testes do atualizador e do upload. O código de saída da primeira execução completa não foi descrito como aprovação; depois disso, apenas os dublês de teste foram alterados, sem repetir a execução completa.
- As verificações necessárias, o reteste dos itens que falharam e a autoinspeção do diff foram concluídos; commit local no branch atual conforme o acordo de implementação, sem push.
