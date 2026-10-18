# Menu de Ajuda do Header do Workspace

A área de ações do header do Workspace oferece, à esquerda do botão de terminal, um menu leve de ajuda, como entrada fixa para o usuário obter suporte, enviar feedback e acessar a documentação na área de trabalho principal.

## Layout

- No Workspace Header completo de uma tarefa existente, o botão de ajuda fica à esquerda do toggle de Terminal e pertence ao mesmo grupo de ações de header que a troca de editor, o Terminal e o Side pane.
- No estado de rascunho de nova tarefa não há Workspace Header completo, mas o mesmo botão de ajuda continua disponível no canto superior direito.
- O botão usa o estilo de botão de ícone, mantendo o tamanho `icon-md` e o visual `ghost`, para não ocupar o título do workspace.
- Em telas estreitas de controle remoto pelo celular, `simplifyForNarrowRemote` é reutilizado e oculta os botões de ajuda e de Terminal, evitando uma barra de título de controle remoto lotada.
- No estado de rascunho de nova tarefa em desktop Windows / Linux, o canto superior direito tem botões de controle de janela desenhados pela própria aplicação; o botão de ajuda precisa, via espaçamento seguro à direita, evitar a área de minimizar, maximizar e fechar.

## Itens do menu

O menu é dividido em dois grupos, sem exibir títulos de grupo; apenas o desktop exibe uma linha divisória entre os dois grupos.

Primeiro grupo, de cima para baixo:
1. Documentação do produto: abre `https://zcode.z.ai/docs`.
2. Comunidade de usuários: usa `IPlatformService.openCommunity()`.
3. Relatar problema: abre o formulário de feedback embutido, mantendo `type=bug`, `module=其它`, `includeLogs=true` e o comportamento de captura de tela.
4. Pedir uma feature ao produto: abre um diálogo de solicitação dedicado, mantendo `type=feature`, `includeLogs=false`.

O segundo grupo é exibido apenas no desktop, de cima para baixo: exportar logs, gerenciador de recursos, verificar atualizações, sobre o ZCode. "Verificar atualizações" aparece somente em production, mantendo o texto dinâmico existente e o estado desabilitado; Preview oculta. "Sobre" é sempre o último item.

"Exportar logs" reutiliza o texto `titleBar.menu.help.exportLogs` e `createHelpMenuActionHandlers().exportLogs`, passando por `IPlatformService.exportLogs()` para chamar a mesma função de exportação do processo principal usada pelo menu do sistema. Mantém o toast de exportação em andamento, a mensagem de falha e o comportamento de localizar o pacote de logs no explorador de arquivos do sistema ao final; nenhuma nova implementação de exportação é adicionada. Na Web (incluindo o controle remoto pelo celular) não há exportação local: apenas o primeiro grupo é mantido, sem renderizar "exportar logs" nem divisórias extras.

```text
Menu de interrogação → ação de exportação compartilhada / toast → IPlatformService.exportLogs() → IPC ─┐
Menu do sistema → DesktopCommandIds.ExportLogs ─────────────────────────────────────────────┤
                                                                                          ↓
                                                                            main exportLogs → pacote de logs / localização no sistema
```

Cadeia de status de atualização: main updater (único owner) → snapshot de plataforma / evento de status → exibição no menu; clique → comando de desktop existente → main updater. Eventos em tempo real têm prioridade sobre snapshots emitidos antes; após a desmontagem, nenhuma resposta é aplicada.

Aceitação: na página de tarefa do desktop, no estado de rascunho e na página de configurações, o menu compartilhado de interrogação abre a janela "Sobre"; em chinês e inglês exibe "关于 ZCode" / "About ZCode"; na Web não aparece nenhuma entrada inválida.

Aceitação da exportação: testes unitários do componente cobrem a entrada do desktop, a ação compartilhada e a ocultação na Web; os cenários de estado de rascunho em inglês e de página de configurações em chinês de `help-menu-about.test.ts` clicam de fato em "exportar logs", verificando que o processo principal gera o ZIP e solicita a localização pelo sistema, que o aviso de exportação fecha ao final, e continuam verificando a ordem do menu e a entrada "Sobre". A chamada de localização pelo sistema é interceptada em E2E isolado, mas o arquivamento real continua sendo executado.

Verificação de 2026-10-09: E2E de Preview em macOS arm64 4/4 aprovado, screenshots de Zai Light em inglês e Zai Dark em chinês conferidos; a configuração de ajuda usa fixtures locais e a ordem é afirmada após o fim do carregamento dos itens dinâmicos. Testes unitários relacionados 34/34, typecheck, typecheck de E2E, lint e verificações de arquitetura e formatação aprovados; o lint tem 68 avisos não relacionados a esta alteração. Não foram executados E2E em máquinas reais Windows/Linux, em navegador de celular nem com identidade production. Registro da execução: `packages/desktop/.e2e-artifacts/desktop-e2e-20261009043852849-p29715-f22a05c87493b116/summary.json`.

Todo texto visível deve passar por i18n; os itens do menu usam ícones lucide, sem texto em chinês hardcoded nos componentes.

## Diálogo "Pedir uma feature ao produto"

- Não reutiliza o formulário genérico de reporte de problema, evitando que semânticas de bug como captura de tela, logs e descrição do problema confundam o usuário.
- O diálogo contém um texto de orientação, os campos obrigatórios "需求描述" (descrição da solicitação) e "期望的解决方案" (solução esperada), e uma forma de contato opcional.
- "重置内容" fica na parte inferior esquerda; "取消" e "提交需求" ficam na parte inferior direita.
- O envio só é permitido quando os dois campos obrigatórios têm conteúdo.
- No envio, os dois campos são organizados em uma descrição Markdown estruturada e um ticket do tipo `feature` é criado pelo feedback service.
