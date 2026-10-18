# Sidebar Footer Log Export

## Objetivo

O menu de conta no canto inferior esquerdo passa a oferecer a entrada "Exportar logs", para que o usuário possa exportar o pacote de diagnóstico sem precisar entrar no menu da barra de título do Windows nem no menu do sistema.

## Comportamento

- A entrada fica na área de ações de suporte do menu de conta, no mesmo grupo de "Relatar problema" e "Comunidade de usuários".
- Os textos do menu reaproveitam `titleBar.menu.help.exportLogs` do menu do Windows; os textos do toast reaproveitam os existentes `sidebar.exportLogs.pending` e `sidebar.exportLogs.error`.
- Ao clicar, reaproveita `platform.exportLogs()`, e o processo principal do desktop é responsável por empacotar os logs e exibir o resultado da exportação no explorador de arquivos do sistema.
- Na Web continua sendo usado o fallback da camada de plataforma; quando o recurso não é suportado, é exibido um toast de erro, sem novos ramos exclusivos de desktop.

## Local da implementação

- Entrada do menu: `packages/ui/src/WorkspaceSidebarFooter.tsx`
- Ação compartilhada: `packages/ui/src/lib/exportLogsAction.ts`
- A barra de título do Windows reaproveita a mesma ação: `packages/ui/src/WindowsCaptionMenuButton.tsx`