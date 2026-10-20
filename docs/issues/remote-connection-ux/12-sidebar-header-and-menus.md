# 12 — Barra lateral, cabeçalho da sessão e menus

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** [03 — Modelo de apresentação da conexão remota, 5 estados e glossário](./03-presentation-model-states-and-glossary.md), [06 — Protótipo de interação e revisão](./06-interaction-prototype-review.md)

**Comportamento a entregar:**

- **Linha de projeto**:
  - Passa a ter layout de uma linha só: um espaço para o ícone de status, o nome do projeto e o nome do dispositivo.
  - O ícone de status tem quatro formas: um único spinner, nuvem riscada, nuvem com `!` e nuvem com `✕`.
  - O nome do dispositivo usa a cor de texto secundária e tem largura limitada; quando o dispositivo está offline, esse espaço passa a mostrar um texto de status curto.
  - Removem-se o ícone ⓘ, o spinner duplicado e o botão de reconexão permanente; as ações no fim da linha só aparecem no hover ou quando o elemento recebe foco pelo teclado.
- **Cartão de detalhes**:
  - Abre imediatamente ao clicar na aba do dispositivo; após um hover de cerca de 400 ms.
  - Mostra dispositivo, conexão, caminho, status e motivo.
  - Ações oferecidas: conectar ou desconectar, editar a conexão e gerenciar nas configurações (ir para a página de configurações e posicionar no cartão deste dispositivo).
- **Menu "Projeto +"**: "Abrir projeto remoto" expande para a lista de dispositivos. Dispositivos online entram direto na seleção de diretório; dispositivos offline são conectados primeiro e só então é selecionado o diretório. O último item do menu é "Nova conexão remota…".
- **Cabeçalho da sessão**: exibe de forma permanente o nome do dispositivo e o ícone de status.
- **Outros lugares**:
  - O menu de troca de projeto dentro do campo de entrada exibe o nome do dispositivo.
  - A aba de dispositivo na linha da tarefa tem estilo unificado em todas as visões.

Corresponde à seção "Barra lateral, cartão de detalhes e cabeçalho da sessão" da especificação pai.

Escopo:

- **Correção de layout do cartão de detalhes**:
  - O separador ocupa toda a largura do cartão.
  - A aba de status fica alinhada à direita.
  - Não cobre as ações da linha nem a coluna de tempo.
  - A aba de tipo usa capitalização normal.
- **Outras correções**:
  - Depois que o menu de projeto fecha, não sobra nenhum tooltip.
  - O nome e o caminho no tooltip de hover do cabeçalho da sessão são os mesmos da barra lateral.
  - Dispositivos online que estão apenas conectados, sem projeto aberto, também aparecem na lista de "Abrir projeto remoto".

**Conclusão da revisão do protótipo** ([Conclusão da revisão em 06](./06-interaction-prototype-review.md#comments)): a interface é implementada conforme o protótipo aprovado na revisão; nos pontos abaixo, vale o 06.

- O cartão de detalhes é ancorado à linha inteira e aparece à direita da barra lateral, sem cobrir as ações do fim da linha.
- A aba de status do dispositivo é escrita como "status · frase curta do motivo", por exemplo "Conectando · recuperação automática 2/3", sem mais concatenação direta.
- A linha de projeto usa o texto curto de recuperação "recuperação automática 2/3"; a frase completa fica somente no cartão de detalhes.
- A descrição da conexão usa capitalização normal, por exemplo `Docker · …`, sem mais gerar `DOCKER`.

Critérios de aceite:

- [x] Com a largura padrão da barra lateral de 264px, a largura visível do nome do projeto aumenta de forma perceptível em relação à linha de base do walkthrough, confirmado por comparação de capturas de tela.
- [x] A aparência da linha de projeto nos 5 estados é igual à do protótipo: o teste de componente afirma que o ícone e o texto curto de status vêm do modelo de apresentação, com capturas de tela anexadas.
- [x] O atraso de abertura do cartão de detalhes, cada ação e o salto para a página de configurações posicionado no dispositivo têm teste; "Gerenciar nas configurações" tem cobertura E2E.
- [x] O menu "Abrir projeto remoto" lista os dispositivos, inclusive os dispositivos online conectados que ainda não abriram projeto.
- [x] O cabeçalho da sessão e o menu de troca de projeto exibem o nome do dispositivo, e projetos com o mesmo nome em dispositivos diferentes podem ser distinguidos.
- [x] O estilo da aba de dispositivo na linha da tarefa é consistente em todas as visões de tarefa.
- [x] As capturas de tela cobrem os temas claro e escuro, chinês e inglês, e janelas de 900px de largura.
- [x] Atualiza a especificação de navegação e sincroniza o catálogo de casos E2E.
- [x] Commit local depois de `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E afetados passarem.

## Registro de verificação (2026-09-29)

- A linha de projeto usa um ícone de status único, nome do dispositivo com largura limitada e texto curto de status do modelo; os detalhes compartilham uma camada flutuante única de hover/clique de 400ms, e a edição, o desligamento do dispositivo, a conexão do diretório original e a posição do cartão nas configurações reutilizam as entradas existentes. O cabeçalho da sessão e dos rascunhos remotos, o menu de troca de projeto e a aba da tarefa foram sincronizados.
- A revisão de spec e de especificação passou. Os problemas encontrados na revisão — cobertura de preferências de múltiplas linhas, lacuna no cabeçalho de rascunho, consumo duplicado da intenção de posicionamento e temporizador de assunção de foco — foram corrigidos e voltaram a passar na regressão. O E2E real reproduziu e corrigiu ainda o problema em que a âncora automática do Radix sobrescrevia a âncora virtual, garantindo que, ao voltar para a página de projeto, a camada continue à direita da linha.
- Comparação lado a lado do componente real nos cinco estados com o componente de linha do HEAD inicial: 264px, nome de projeto em chinês — online 101→105px, recuperando 64→125px, offline 126→154px, requer ação 116→144px, falha 12→144px; as capturas de tela cobrem chinês/inglês, claro/escuro, 1400/900px, num total de 8, em `packages/desktop/.e2e-artifacts/rdux12-visual`. A entrada visual temporária foi removida e não foi commitada.
- O E2E SSH real `conversation-session-remote-sidebar-menus` passou, run `desktop-e2e-20260928191550395-p40953-3f34da887a24cf8d`. Cobre dispositivo online sem projeto entrando no diretório, nome do dispositivo no cabeçalho, edição da conexão, posicionamento do gerenciamento, desconexão e reconexão do diretório original, e menu fechando sem tooltip; foram geradas 16 capturas de tela do aplicativo em chinês/inglês, claro/escuro, 1400/900px, online/offline, com asserção de que os detalhes ficam à direita da linha inteira. O novo caso permanece pending e a validação de fixtures passou; catálogo, matriz de cobertura e fila de execução do servidor foram sincronizados.
- A regressão final de UI direcionada passou em 66 itens; duas inconsistências antigas de aceitação (registro da fila do spec remoto e asserção estática do cabeçalho de rascunho) foram corrigidas e os 21 itens relacionados passaram. No celular foi feita apenas a regressão dos testes unitários existentes, sem verificação visual em aparelho real; a fila remota completa do Linux não foi executada.
- `pnpm typecheck`, a checagem de tipos do E2E do desktop, `pnpm lint` (64 avisos pré-existentes, 0 erros) e `pnpm architecture:check --changed` (0 violações) passaram.
- A suíte completa de testes unitários foi executada (`ZCODE_TEST_POOL=forks`, 2 workers): 2.034 arquivos / 18.741 itens passaram, 2 arquivos / 14 itens foram pulados conforme as condições já existentes; as duas falhas eram exatamente o registro da lista remota e a antiga asserção de código-fonte do rascunho, ambas corrigidas e verificadas pela regressão direcionada de 21 itens. Não restou nenhuma falha no final. O uso de threads com alta concorrência nesta máquina já havia provoca pressão de memória e interrompido a execução; a execução completa foi concluída com o modo de execução isolado suportado pelo repositório.
