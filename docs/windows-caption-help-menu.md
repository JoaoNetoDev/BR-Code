# Menu de ajuda do desktop (menu de interrogação no canto superior direito)

## Contexto

O desktop Windows/Linux chegou a desenhar na barra de título customizada um menu de setas fundido, que servia de entrada tanto para ações de nível de janela quanto de ajuda; quando coexistia com o menu de interrogação do header do workspace, a entrada no canto superior direito ficava duplicada. A partir de 2026-09 (`ab48cad0bd` etc.), as páginas de configurações, de tarefas e o estado de rascunho no Windows/Linux voltaram uniformemente ao menu de ajuda compartilhado por interrogação, `WorkspaceHelpMenuButton`, e o menu de setas `WindowsCaptionMenuButton` não é mais montado.

Isso deixa uma lacuna: o «Explorador de Arquivos» que existia no menu de setas ficou com apenas o caminho do menu Help nativo do macOS; no Windows/Linux não há barra de menus nativa, portanto não existe entrada alguma.

## Semântica de produto

- Nos três plataformas do desktop e no canto superior direito da Web, apenas o menu de ajuda por interrogação é exibido; o local de montagem do botão de interrogação é controlado por `WorkspaceHeaderActionSection` / `SettingsPage`.
- Primeiro grupo: documentação do produto, comunidade de usuários, relatório de problemas e sugestão de requisitos para o produto.
- Após uma linha divisória vem o grupo exclusivo do desktop: exportar logs, Explorador de Arquivos, verificar atualizações e Sobre o ZCode. «Verificar atualizações» aparece somente em production e fica oculto em Preview; «Sobre» é o último item. Usa-se os comandos existentes; quando o download termina, exibe-se «Reiniciar para atualizar»/«Restart to update» e um pill separado de versão.
- A exportação de logs reutiliza a implementação de exportação do processo principal do menu do sistema, e a UI exibe, por meio da ação de ajuda compartilhada, o estado de exportando e as falhas; o relatório de problemas continua com `includeLogs=true`. Na Web não há grupo de desktop nem divisória.

## Restrições de implementação

- Relatório de problemas, documentação do produto e exportação de logs reutilizam `createHelpMenuActionHandlers`, sem adicionar novos desktop commands.
- A detecção de plataforma não faz sniffing de `window` ou do UA dentro de `WorkspaceHelpMenuButton`; em vez disso, `isDesktop` é injetado pelo ponto de montagem (`WorkspaceHeaderActionSection` e `SettingsPage` já possuem esse valor), garantindo que a Web não seja afetada indevidamente. O stub `IPlatformService` da Web também implementa `executeDesktopCommand` (no-op), portanto não pode ser usado como critério de desktop.
- test id: botão gatilho `TID_WORKSPACE_HELP_MENU_TRIGGER`, item do Explorador de Arquivos `TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER`.

## Testes

- Teste unitário: `packages/ui/test/workspaceHelpMenuButton.test.ts` — quando `isDesktop` é verdadeiro, renderiza o item do Explorador de Arquivos e chama `OpenResourceManager`; quando falso, não renderiza.
- E2E: `packages/desktop/test/e2e/resource-manager.test.ts` — abre a janela do Explorador de Arquivos a partir do menu de interrogação.

- E2E oficial da entrada «Sobre»: `packages/desktop/test/e2e/help-menu-about.test.ts` — clica de verdade no menu de interrogação e verifica que a janela «Sobre» está visível e contém o nome e a versão do aplicativo; o item de verificação de atualização aparece conforme a identidade do produto e, em production, a verificação confirma que o clique encaminha o comando IPC existente, sem baixar nem instalar. Não requer requisições ao modelo; já foi confirmado pelo usuário como promovido e incluído na coleta padrão de desktop E2E.

### Complemento de E2E para alterações ainda não enviadas

| Cenário | Aceitação |
| --- | --- |
| Estado de rascunho em inglês, página de configurações em chinês | Texto e ordem do menu «Sobre» corretos; clique real abre a janela «Sobre» com a versão |
| Exportação de logs no estado de rascunho em inglês e configurações em chinês | Primeiro item do grupo de desktop é a exportação de logs; clique real gera um ZIP, solicita a localização ao sistema e encerra o aviso de exportação; reutiliza a implementação de exportação existente |
| Estado inicial em production | Exibe «verificar atualizações»; clique real recebe o recibo `dev-skipped` do pacote de desenvolvimento pelo comando existente |
| Eventos de estado em production | `checking` desabilitado; versão disponível e progresso de download exibem os textos correspondentes; após a conclusão do download, asserta-se separadamente o texto da ação e o pill de versão (sem depender de parênteses nem da concatenação de espaços de nós filhos); ao fechar e reabrir, o pill de versão mantém o estado mais recente |
| Preview | Sem item de atualização tanto no estado de rascunho quanto na página de configurações, e injetar eventos de atualização também não o faz aparecer |

Os eventos de estado usam um `UpdateStatePayload` sintetizado dentro do caso, verificando apenas main→preload→exibição no menu, sem modificar o updater real e sem baixar ou instalar. Os testes não dependem mais da variável `ZCODE_PRODUCT_FLAVOR` do lado Node (sem define compilado, o fallback fixo é preview); a expectativa padrão é Preview; production precisa receber explicitamente a identidade esperada e então asserções são feitas sobre o menu real.

```bash
ZCODE_ENV=production ZCODE_PREVIEW_IDENTITY=0 ZCODE_E2E_HELP_MENU_FLAVOR=production pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/help-menu-about.test.ts
ZCODE_ENV=test ZCODE_PREVIEW_IDENTITY=1 ZCODE_E2E_HELP_MENU_FLAVOR=preview pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/help-menu-about.test.ts
```

As duas trocas de identidade exigem nova build; não se deve configurar skip build. A entrada oculta no Web mobile continua coberta pelos testes unitários do componente existente, e esta rodada não afirma adicionar E2E de navegador mobile.

Verificação em 2026-09-16, macOS arm64: production / Preview passaram 4/4 cada. Em production, após a build completa, por causa de interrupção do host e de correção na localização dos testes, a execução final reutilizou o mesmo artefato; em Preview, após trocar a identidade, o App foi reconstruído, reutilizando o artefato de Agent inalterado.

- production: `packages/desktop/.e2e-artifacts/desktop-e2e-20260916015817140-p11108-40c450981f4adf75/summary.json`
- Preview: `packages/desktop/.e2e-artifacts/desktop-e2e-20260916015910292-p13512-0267b1fc0528ad0b/summary.json`
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm lint`, `pnpm architecture:check --changed` passaram; o lint manteve 43 avisos existentes, 0 erros.
- Não foram verificados Windows/Linux em máquinas reais, navegador mobile nem download/instalação de pacotes oficiais; o caso já foi promovido; a admissão na suíte Docker está fora do escopo desta rodada.

Verificação de promoção (2026-09-16): o caminho oficial não define parâmetros de manual-review nem de identidade esperada, e o Preview padrão passou 4/4; reutilizou-se a build de App/Agent já verificada na rodada anterior. Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260916020532683-p21897-d5394bfcb8f7a780/summary.json`. O ramo explícito de production não mudou, mantendo as evidências 4/4 acima.
