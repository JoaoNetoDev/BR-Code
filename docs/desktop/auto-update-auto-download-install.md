# Download e instalação automáticos de atualizações

## Contexto

O popup de atualização automática do Electron precisa suportar que o usuário escolha "baixar e instalar atualizações automaticamente depois". Essa preferência precisa ser persistida nas configurações globais e manter consistência com a chave de mesmo nome na página de configurações. A janela independente de atualização não registra o service completo de workspace e, portanto, não pode depender diretamente do `settingService` da camada de UI.

## Comportamento

- Nova configuração `autoDownloadAndInstallUpdates`, desabilitada por padrão.
- No popup de atualização, no estado "não baixado", exibe-se um checkbox alinhado à esquerda acima dos botões inferiores: `以后自动下载并安装更新`.
- Na página de configurações, o mesmo toggle é exibido no grupo genérico.
- Quando essa configuração está ativa e uma atualização disponível é detectada, o processo main chama automaticamente o fluxo de download atual.
- Durante o download, a entrada principal de atualização mostra apenas o progresso/estado de carregamento, sem permitir clicar para abrir o popup de atualização.
- Quando o download é concluído e o usuário clica em "reiniciar para atualizar":
  - se não houver Agent session em execução, executar diretamente o `quitAndInstallUpdate()` existente.
  - se houver tarefa em execução, avisar primeiro que o aplicativo vai sair e reiniciar e que as tarefas em andamento serão interrompidas; após a confirmação do usuário, executar a atualização.

## Arquitetura

- A persistência da configuração continua usando `AppSettings` e `settingService`.
- O `autoUpdater` do processo main lê a configuração no evento `update-available` e dispara o download automático, evitando depender de qualquer janela renderer estar aberta.
- A janela independente de atualização lê e grava a preferência de atualização automática por uma interface estreita de plataforma, sem expor o setting service completo.
- A verificação de tarefas antes da reinicialização reutiliza o `IPlatformService.getDesktopSessionActivity()` existente, evitando que a camada de UI leia diretamente o store de tarefas ou acesse implementações de serviço entre camadas.

## Verificação

- Cobertura de testes unitários:
  - valor padrão e patch do schema de configurações.
  - com a preferência ativa, o download começa automaticamente ao detectar uma atualização.
  - o checkbox do popup grava a configuração e dispara o download com a atualização disponível.
  - a entrada principal de atualização fica desabilitada durante o download.
  - com tarefa em execução, o botão de reiniciar solicita confirmação antes.
- Ainda é preciso executar `pnpm typecheck` e `pnpm lint`.