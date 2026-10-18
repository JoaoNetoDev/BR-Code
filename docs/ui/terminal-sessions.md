# Sessões de Terminal

O painel de terminal suporta múltiplas terminal tab em um mesmo workspace, com isolamento e persistência por workspace identity.

## Resumo das mudanças de funcionalidade

| Campo                     | Conteúdo                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Mudança                   | A primeira terminal tab não exibe `1`; as seguintes começam em `2`; ao fechar ou quando o PTY encerra, a tab correspondente é fechada |
| Local visível ao usuário   | A tab strip do painel Terminal na parte inferior                                          |
| Dono do estado            | Estado local do renderer de `Terminal`; o ciclo de vida do PTY é gerenciado por cada `TerminalSession` |
| Fora de escopo            | A Terminal tab do side pane à direita, realtime de sessão/task do chat, protocolo e runtime Host/Agent |

## Comportamento do produto

Regras principais:

- A chave de workspace usa `workspaceIdentity?.trim() || workspacePath`, usada apenas para isolar as sessões de terminal.
- `workspacePath` é passada apenas como cwd do PTY para `terminalService.create()`.
- Recolher o painel de terminal ou trocar de workspace/task não faz dispose das terminal tab já criadas.
- Com mais de uma terminal tab, fechar uma tab descarta o `TerminalSession` correspondente e, com isso, faz dispose do PTY do backend.
- Com apenas uma terminal tab, o botão de fechar da tab continua sendo exibido; ao clicar, fecha todo o painel Terminal, sem descartar a sessão. Ao reabrir o painel, a sessão original continua em uso.
- Tab e Side Header usam o mesmo estilo ghost: sem borda visível, fundo de seleção igual ao hover, espaçamento de 4px; overflow de conteúdo usa máscara com fade, sem reticências. O botão de fechar participa do layout flex normal, aparecendo apenas quando selecionado, em hover ou em focus-within, e preservando o espaço reservado quando oculto; a máscara não se move conforme o estado de exibição do botão. O título 「终端」 permanece como está, e o nome do shell usa texto auxiliar comum, sem estilo pill.
- Quando a sessão de shell/PTY em si encerra, a tab correspondente é fechada automaticamente; um subcomando comum que retorne algo diferente de 0, mantendo o shell vivo, não fecha a tab.
- Quando uma sessão em segundo plano entre múltiplas tabs encerra, apenas a própria tab é removida, sem alterar a tab ativa atual; quando a sessão ativa encerra, aplica-se o fallback de fechamento manual para a tab vizinha.
- Quando a última sessão do workspace atual encerra, a sessão encerrada é removida e todo o painel Terminal é fechado; na próxima abertura uma sessão totalmente nova é criada de forma preguiçosa, sem manter uma tab `[进程已退出]`.
- Quando a última sessão de um workspace oculto encerra, apenas o estado de terminal daquele workspace é limpo, sem fechar o painel Terminal do workspace atual.
- Falha na inicialização do terminal não é um PTY exit; o conteúdo do erro permanece na tab para investigação.
- Depois de fechar a tab de um workspace, o painel recicla os terminais ocultos conforme as chaves de workspace ainda abertas, evitando vazamento de PTY em segundo plano.
- Ao abrir o painel de terminal, trocar de terminal tab ou criar uma nova terminal tab, o xterm visível atual deve receber o foco de teclado automaticamente; workspaces/sessões ocultos não roubam o foco.
- Ao arrastar para redimensionar a altura do terminal inferior, o fit do xterm e o resize do PTY do backend não podem ser executados de forma síncrona a cada callback do `ResizeObserver`; durante o arraste usa-se uma prévia de baixa frequência conforme `TERMINAL_RESIZE_THROTTLE_MS`, e ao soltar o mouse faz-se o flush imediato do tamanho final, deduplicando `{ cols, rows }` idênticos, evitando que resize contínuos travem a UI no Windows / PowerShell.
- O nome exibido da tab usa o nome folha do cwd da sessão correspondente; o primeiro número `1` não é exibido, por exemplo `z-code`. O número `2` e posteriores são exibidos como `z-code 2`, `z-code 3`.
- O nome da tab permanece inalterado após a criação. Fechar outras tabs não dispara renomeação de tabs existentes.
- Uma nova tab usa o menor inteiro positivo disponível dentro do workspace atual. Depois de fechar `z-code 2` e criar outra, o nome continua sendo `z-code 2`.
- Links em texto claro `http://` / `https://` na saída do terminal são reconhecidos pelo xterm link provider, exibindo sublinhado e cursor de mão no hover; ao clicar, reutiliza o `onOpenBrowserUrl` da camada de UI para abrir o navegador à direita; na Web continua seguindo o fallback existente de nova aba.

Ordem de estado e eventos:

```text
Primeira abertura                      Nova
Painel fechado ──open──> [z-code] ─────────────────> [z-code] [z-code 2]
                          │ close                       │ close z-code 2
                          ▼                             ▼
                      Painel fechado                [z-code]
                   (sessão persistida)                 │ new
                          │ reopen                     ▼
                          └──────────────────────> [z-code] [z-code 2]

[z-code] [z-code 2] ──close z-code──> [z-code 2]
                                         │ new (os nomes existentes não mudam, reusa o menor número 1)
                                         ▼
                                   [z-code 2] [z-code]

[z-code] [z-code 2] ──PTY exit 2──> [z-code]
         │
         └─PTY exit 1 (última)──> remover sessão encerrada ──> painel fechado
                                                            │ reopen
                                                            ▼
                                                     nova [z-code]

Subcomando com exit code != 0 ──shell ainda vivo──> tab inalterada
```

## Registro de esclarecimentos

| Rodada | Pergunta                                | Resposta do usuário                                       | Limite fixado                                                     | Confirmação posterior |
| ------ | --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| 1      | Estado após fechar uma única tab       | Fechar toda a página de terminal                          | Fechar o painel em vez de manter um estado sem tabs ou criar automaticamente uma tab substituta | Não |
| 1      | Nome base e numeração das tabs          | Nome do workspace atual; a segunda é o nome do workspace + `2` | O número `1` não é exibido, a partir do número `2` é exibido    | Não |
| 1      | Renomear após fechar outras tabs        | O terminal não muda de nome depois de criado                | O nome permanece estável durante o ciclo de vida da sessão       | Não |
| 1      | Criar novamente após fechar o número `2` | Continua sendo o terminal `2`                             | Usa o menor número disponível no momento                        | Não |
| 2      | Qual exit fecha a tab automaticamente    | Apenas quando a própria sessão de terminal termina          | Falha de subcomando não dispara; exit normal e anormal do shell disparam | Não |
| 2      | Manter aviso após o exit                | Não manter                                                 | A tab é removida imediatamente após receber o PTY exit          | Não |
| 2      | Última sessão encerrada                 | Fechar todo o painel e criar um terminal novo na próxima abertura | Não manter a sessão encerrada nem subir um novo PTY em segundo plano imediatamente | Não |
| 2      | Exit em tab de segundo plano e na ativa  | Segundo plano remove só a si; tab ativa muda para a vizinha | Não roubar foco por causa do exit de uma tab em segundo plano   | Não |
| 2      | Falha na inicialização do terminal      | Manter a mensagem de erro                                   | Falha de inicialização não fecha automaticamente como PTY exit  | Não |

## Escopo de domínio e itens de alto risco

| Domínio                                  | Incluído         | Decisão                                                                                                        |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| File/Git/Terminal UI                    | Sim              | Modifica a nomenclatura, o fechamento e a alocação de numeração locais do renderer da Terminal tab inferior      |
| UI shell / responsivo                   | Sim              | Desktop e Web móvel compartilham o componente `Terminal`, o comportamento permanece consistente e não há ramificação por plataforma |
| Workspace identity / remote runtime     | Verificação representativa | Quando a workspace identity não é vazia, ela tem prioridade para o isolamento; caso contrário há fallback para o workspace path; `workspacePath` continua sendo usado apenas para cwd e exibição de nome |
| Mobile replayable / conversation         | Podado           | Não modifica session/task stream, snapshot, queue, protocol nem delivery kind                                    |
| Terminal do side pane à direita         | Podado           | Já possui um modelo de tab independente e não é modificado nesta ocasião                                          |

## Diagrama conceitual e dono do estado

| Conceito                                       | Estado autoritativo / entrada de código                              | Evidência observável                                                 |
| --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Registro de terminais do workspace             | renderer state em `packages/ui/src/Terminal.tsx`                   | tab strip do workspace atual                                         |
| Numeração de sessão e menor número disponível  | `packages/ui/src/terminal/terminalPanelState.ts`                  | títulos de tab e testes unitários de estado puro                     |
| Ciclo de vida do PTY                          | `packages/ui/src/terminal/TerminalSession.tsx`                    | componente desmonta após o fechamento de múltiplas tabs; com uma única tab, o componente continua montado após ser recolhido |
| Abertura do painel                             | `isTerminalOpen` em `packages/ui/src/hooks/useAppPanels.ts`        | visibilidade do painel Terminal                                      |

## Dimensões de estado e combinações candidatas

| Case ID     | Estado da tab              | Ação do usuário             | Efeito esperado                                                | Classificação |
| ----------- | -------------------------- | --------------------------- | -------------------------------------------------------------- | ------------- |
| TERM-TAB-01 | Primeira criação, apenas o número `1` | Ver o título da tab  | Exibe o nome do workspace, sem exibir `1`                      | accepted |
| TERM-TAB-02 | Já existe o número `1`     | Criar nova tab              | A nova tab exibe `workspace 2`; o nome da primeira tab não muda | accepted |
| TERM-TAB-03 | Já existem os números `1`, `2` | Fechar o número `2` e criar outra | A nova tab reusa o número `2`                          | accepted |
| TERM-TAB-04 | Já existem os números `1`, `2` | Fechar o número `1` | O número `2` mantém o nome original, não vira o nome base      | accepted |
| TERM-TAB-05 | Apenas uma tab             | Clicar no botão de fechar da tab | Recolhe todo o painel Terminal, a sessão persiste        | accepted |
| TERM-TAB-06 | Mais de uma tab            | Fechar qualquer tab         | Libera apenas a sessão alvo; se a tab ativa for fechada, seleciona a tab vizinha | accepted |
| TERM-TAB-07 | Múltiplas tabs, PTY de segundo plano vivo | PTY exit em segundo plano | Remove a tab que saiu, a tab ativa e o foco não mudam | accepted |
| TERM-TAB-08 | Múltiplas tabs, PTY ativo vivo | PTY exit da tab ativa      | Remove a tab que saiu e ativa a tab vizinha                   | accepted |
| TERM-TAB-09 | Uma única tab no workspace atual | Reabrir o painel após o PTY exit | Fecha o painel primeiro; ao reabrir, cria uma tab totalmente nova com o nome base | accepted |
| TERM-TAB-10 | Uma única tab em workspace oculto | PTY exit oculto            | Limpa apenas o workspace oculto, sem fechar o painel atual    | accepted |
| TERM-TAB-11 | Shell vivo                 | Subcomando retorna valor diferente de 0 | Não gera PTY exit, a tab permanece                     | pruned |
| TERM-TAB-12 | Falha na criação do terminal | Promise reject             | A tab mantém o erro de inicialização, sem fechar automaticamente | accepted |

Decisão de poda: tema, locale e viewport desktop/mobile não alteram a nomenclatura nem a máquina de estados de fechamento; mantêm-se apenas asserções representativas dos componentes compartilhados. desta ocasião não há requisitos de protocolo, fixture de provider, temporização de rede ou isolamento via Docker.

## Plano de cobertura

| Case                 | setup / action / assertion                                                | Camada de evidência                  | Status                        |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------ | ----------------------------- |
| TERM-TAB-01/02/03/04 | Construir o estado de terminais do workspace, executar criação/fechamento e asseverar numeração e títulos estáveis | renderer state + UI label helper     | covered unit + runtime CDP   |
| TERM-TAB-05          | Disparar o fechamento com uma única sessão e asseverar a intenção de fechar o painel sem remover a sessão | renderer state + panel callback  | covered unit + runtime CDP   |
| TERM-TAB-06          | Disparar o fechamento com múltiplas sessões e asseverar a remoção da sessão alvo e o fallback correto da sessão ativa | renderer state                   | covered unit + runtime CDP   |
| TERM-TAB-07/08       | Disparar o PTY exit com múltiplas sessões e asseverar a remoção das tabs de segundo plano/ativa e o fallback de active | renderer state + exit event      | covered unit + runtime CDP   |
| TERM-TAB-09/10       | Último PTY exit do workspace atual/oculto e asseveração do limite de fechamento do painel e da reconstrução preguiçosa | renderer state + panel callback  | covered unit + runtime CDP   |
| TERM-TAB-11/12       | Falha de subcomando não gera exit; create reject mantém a tab de erro    | terminal service/event contract    | covered by invariant         |

Entrega do E2E: esta mudança não envia requisições ao provider e não precisa de replay/file fixture; caso um E2E desktop seja adicionado depois, deve-se asseverar diretamente o título das tabs, o botão de fechar, a visibilidade do painel e se o DOM do PTY permanece vivo, evitando colocar a Terminal do side pane à direita no mesmo case.

Camadas de arquivo:

- `packages/ui/src/Terminal.tsx`: painel de terminal, registro de sessões por workspace, UI das tabs.
- `packages/ui/src/terminal/TerminalSession.tsx`: uma instância do xterm e o ciclo de vida do PTY do backend.
- `packages/ui/src/terminal/terminalPanelState.ts`: funções auxiliares de dados puros para o estado de tabs/workspaces do terminal.
- `packages/ui/src/terminal/terminalLinks.ts`: reconhecimento de links HTTP no buffer do terminal e cálculo de ranges do xterm.