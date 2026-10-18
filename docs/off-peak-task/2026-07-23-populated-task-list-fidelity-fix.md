# Registro de correção de fidelidade visual da lista de tarefas populada

## Contexto

- Data: 2026-07-23
- Arquivo Figma: `IGDrByFuL2wY5fLUWku4sb`
- Nó Figma: `4835:5515`
- Nome do estado de design: `Automations - Task list all`
- Escopo de impacto: estado populado `All` da visão principal de Automations no desktop

Antes da correção, foi criada uma Idle-time task e uma Scheduled task em um ambiente de mock Electron isolado,
e ambas foram comparadas item a item com o nó Figma alvo em uma viewport CSS de 1440×960. As evidências em execução mostram que os dois tipos de tarefa usavam
duas grades independentes, que Keep-awake ficava depois das tarefas e que o tab não selecionado do cabeçalho e o botão de criação também divergiam do design.

## Causa raiz

1. `OffPeakTaskList` e a lista de Scheduled tasks têm cada uma sua própria grid de duas colunas. Mesmo quando o pai exibe os dois
   tipos de tarefa ao mesmo tempo, cada uma começa em uma nova linha e não consegue formar a mesma linha do design.
2. A área de Scheduled tasks renderiza incondicionalmente o título `Task created`, de modo que o estado misto `All` ganha um nível de seção
   que não existe no design.
3. Keep-awake é colocado depois da lista de tarefas; no estado com lista não há expressão separada da ordem de leitura "barra de controle primeiro, tarefas depois".
4. A action row populada reaproveita o botão primário padrão e o ghost tab, sem escolher a aparência de outline action
   e de surface pill correspondentes ao Figma.

## Correção

- Quando `All` contém simultaneamente Idle-time e Scheduled task, o pai estabelece uma grid unificada de duas colunas:
  - duas colunas no desktop, uma coluna antes do breakpoint móvel;
  - altura de linha fixa de 132px;
  - espaçamento horizontal e vertical de 16px;
  - cartão Idle-time primeiro, cartão Scheduled logo em seguida.
- No estado misto, `display: contents` remove as caixas de layout extras das duas sublistas, preservando os componentes de cartão, menus, interação de
  teclado e a semântica de dados de cada uma.
- O título `Task created` é ocultado no estado misto; listas de tipo único mantêm o título e a estrutura de lista existentes.
- No estado populado, Keep-awake é colocado antes da grid de tarefas e o espaçamento entre a action row e o banner é reduzido para 16px;
  o estado vazio mantém a ordem existente "grande cartão vazio → Keep-awake".
- Na action row populada:
  - o tab não selecionado mantém o surface pill;
  - `Create via chat` usa a aparência outline;
  - `Idle-time task` continua usando o botão primário.

## Limites

- O `/remote` do celular não hospeda Automations; desta vez não houve mudança na rota remote nem na semântica de realtime.
- As condições de exibição de apenas Scheduled, apenas Idle, estado vazio e workspace remoto permanecem inalteradas.
- Esta correção trata apenas os problemas de severidade alta e média da auditoria; itens de severidade baixa como deslocamento horizontal das colunas de conteúdo, arquitetura de informação da barra lateral e cor de marca do Keep-awake não estão no escopo.

## Verificação

- `packages/ui/test/automationsPopulatedListFidelity.test.ts`
  - o Keep-awake populado está antes da grid de tarefas e o contrato de espaçamento está correto;
  - o `All` misto compartilha a grid;
  - o estado misto oculta o título extra;
  - estilo do tab pill e da outline action.
- E2E de mock Electron isolado (viewport CSS de 1440×960):
  - o topo dos cartões Idle-time e Scheduled é `273px` em ambos, a largura é `393px` em ambos e o espaçamento entre colunas é de `16px`;
  - Keep-awake fica em `213–257px`, inteiramente antes da grid de tarefas;
  - a grid unificada calcula colunas de `393px 393px` e `Task created` não foi renderizado.
- Portões mecânicos do repositório:
  - `pnpm typecheck`
  - `pnpm lint`