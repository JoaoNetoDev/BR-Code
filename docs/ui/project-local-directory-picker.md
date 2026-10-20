# Projeto local usa o seletor de diretórios múltiplo do sistema operacional

## Comportamento e propriedade

Ao criar um projeto local no desktop e ao editar um projeto local em «Adicionar pastas», usa-se a caixa de seleção de diretórios nativa do sistema operacional, que permite selecionar vários diretórios de uma só vez. Reaproveita-se a capacidade de native dialog da interface de plataforma, adicionando a nova opção `IPlatformService.selectDirectories(): Promise<string[]>`; o main do Electron usa `openDirectory`, `createDirectory` e `multiSelections`, devolvendo todos os caminhos e, ao cancelar, uma lista vazia. O contrato antigo de seleção única `selectDirectory` permanece inalterado.

O `ProjectEditor` continua sendo o único owner do rascunho de nome, roots e primary; o resultado da múltipla seleção é anexado na ordem retornada, com deduplicação. Quando os roots originais estão vazios, o primeiro diretório passa a ser o diretório principal; caso contrário, o diretório principal existente é preservado. A operação de seleção não cria projeto, não abre workspace nem inicia Agent; apenas o salvamento explícito chama o `saveProject` original.

```text
Desktop + Host local → selectDirectories da plataforma → preload IPC → nativo multi-seleção do main
                                                         ↓ todos os caminhos / []
                                                rascunho do ProjectEditor
                                                         ↓ salvamento explícito
                                                   saveProject do Host
Remoto / Web / celular → projectService.readDirectory(hostId) original → mesmo rascunho
```

## Limites e semântica de falha

- O seletor do sistema só é usado quando `hostId` não foi especificado ou é `local` e quando a plataforma oferece `selectDirectories`; a decisão não depende do tab/cwd atual. Projetos remotos continuam percorrendo o Host de origem; Web/celular não oferecem essa capacidade e não podem escolher diretórios do dispositivo do navegador como root do Host.
- Durante a seleção nativa em andamento, edição, salvamento, exclusão e fechamento ficam desabilitados, evitando que o retorno assíncrono se intercale com alterações do rascunho; a mesclagem acontece uma única vez após a conclusão da seleção. Resultados que chegarem após a desmontagem do componente não podem disparar persistência nem reabrir o editor.
- Cancelar não modifica o rascunho; em caso de falha na chamada, exibe-se a área de erro original, preserva-se o rascunho e permite-se nova tentativa, sem trocar automaticamente para outra forma de seleção.
- A seleção de diretórios não altera o estado organizacional do Host, `workspaceIdentity`, owner/lease, nem as semânticas de continuous no desktop ou replayable no celular; não há migração de banco de dados/protocolo CLI.
- Os temas claro e escuro seguem o editor original; as caixas do sistema são renderizadas pelo sistema operacional; macOS, Windows e Linux compartilham as opções nativas de diretório do Electron.

## Casos de aceite (accepted / pending)

| Caso   | Operação e asserção                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| NDP01 | No desktop local, clicar em adicionar e selecionar dois diretórios reais de uma vez; os parâmetros nativos incluem múltipla seleção e não aparece um navegador de diretórios dentro do app; após salvar, ao editar de novo, os dois diretórios continuam lá |
| NDP02 | Anexar um resultado de múltipla seleção que contém um diretório já existente: apenas os novos diretórios são anexados e o diretório principal original é preservado; cancelar a seleção não altera os diretórios; cancelar a edição não salva |
| NDP03 | Durante a seleção nativa em andamento, salvar/fechar é proibido; após a falha, o rascunho é preservado e pode ser tentado de novo; um Host remoto usa a navegação do Host mesmo tendo capacidade nativa; Web/celular, sem capacidade nativa, ainda conseguem navegar |
| NDP04 | A seleção única existente continua devolvendo um caminho ou null; o cancelamento da múltipla seleção devolve []; o editor nos dois temas continua utilizável |

Candidatos de interação no Electron: `packages/desktop/test/e2e/ui-shell/manual-review/pending/project-native-directory-picker.test.ts`. O mock substitui apenas o valor retornado ao usuário pela caixa do sistema; a execução real UI → preload → main, o salvamento e a reedição são exercitados; não se afirma cobertura da múltipla seleção por mouse dentro da janela nativa do sistema operacional. Os testes unitários cobrem os limites de Host/plataforma e os estados de falha/em andamento. O E2E existente de navegação de diretórios local passa a usar também o mock da caixa nativa. A conexão real pelo celular e as GUIs de Windows/Linux precisam de verificação separada.

## Registro de verificação (2026-09-15)

- Testes unitários relacionados: 5 arquivos / 21 casos aprovados; `pnpm typecheck` e `typecheck:e2e` do desktop aprovados; `pnpm lint` com 0 errors / 47 warnings já existentes.
- Electron: `desktop-e2e-20260915125744659-p84856-08e67d2dd0407c35`, 2/2 aprovados, incluindo NDP01/NDP02, a regressão existente WCP01 (exclusão e posterior reinício) e capturas de tela nos dois temas.
- `architecture:check --changed --base HEAD` com 0 violations; a checagem de baseline de staging padrão ainda mostra o `packages/ui/src/root/resolveConversationWorkspaceTarget.ts` unmanaged-new-file, já existente antes do início dos trabalhos, sem novas violações.
- Não foram executados o pareamento real pelo celular, Host via SSH/WSL, as GUIs de Windows/Linux ou a múltipla seleção manual dentro da caixa nativa; esses limites não são substituídos por mock da caixa do desktop.
