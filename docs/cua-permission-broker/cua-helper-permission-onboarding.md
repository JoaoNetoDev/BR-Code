# Ponto de entrada de permissões do ZCode Computer Use

## Objetivo

O sujeito de permissões do produto macOS do ZCode CUA precisa ser o `ZCode Computer Use.app` externo. A página de configurações mantém a entrada de permissões iniciada pelo usuário; o resultado ao vivo de `request_access` do desktop continuous local pode reutilizar o mesmo onboarding após confirmação por um Host confiável. Erros de chat, texto de tool card e PermissionDialog não têm efeitos colaterais de permissão do CUA. Após habilitar o plugin com sucesso, apenas o estado é atualizado, sem abrir a UI de permissões automaticamente.

## Interação

- A página de configurações do Computer Use oferece duas entradas de permissão: Accessibility e Screen Recording.
- Após a convergência da superfície de configurações em 2026-08-17, a página não exibe mais as linhas de estado/identidade do Helper e do Input controller;
  a seção tem apenas o interruptor geral mais as duas linhas de permissão (ver
  `docs/superpowers/specs/2026-08-17-cua-settings-surface-minimization.md`).
- A cadeia IPC do tile de Helper arrastável da versão antiga (Prepare/StartCuaHelperPermissionDrag)
  foi removida na auditoria de 2026-08-16 — nenhuma chamada na camada de renderização; o onboarding de autorização passa uniformemente por `openCuaPermissionOnboarding`.
- A entrada de Accessibility aciona o Helper, deixando o próprio Helper disparar o prompt de Accessibility do macOS. Screen
  Recording não tem uma API de prompt equivalente e apenas abre a página de configurações do sistema correspondente.
- Quando o `request_access` oficial de uma tarefa em background reporta explicitamente falta de permissão, o listener em nível de janela primeiro apenas relê o estado do Helper e depois exibe o ZCode ConfirmDialog. Após a confirmação do usuário, verifica-se novamente e abre-se, na ordem Accessibility → Screen Recording, apenas o que ainda estiver faltando;
  cancelamento, resultado repetido no mesmo ciclo, estado já recuperado, desconhecido ou indisponível não abrem as configurações do sistema.

## Limites

- O alvo de autorização é fixo em `${ZCODE_HOME:-$HOME/.zcode}/computer-use/ZCode Computer Use.app`.
- Python, Terminal, `uvx`, checkout local ou o broker legado `ZCode.app` não podem exibir o product
  onboarding.
- O `zcode-cua` fornece um snapshot mínimo de permissões via o namespaced `_meta["zcode.cua/request-access-status-v1"]`,
  sem adicionar MCP tool e sem colocar broker token, socket token, argv ou config args nos metadados da UI.
  O Consumer só aceita o `request_access` oficial com authority-verified; a análise de texto comum não pode disparar onboarding.
- Web e plataformas não-macOS não implementam o onboarding de autorização e mantêm apenas um diagnóstico comum ou não exibem essa ação.
- mobile replayable, cold snapshot/recovery e workspace SSH/WSL/Docker não recebem live permission
  observation. Depois da autorização, a tarefa original não é restaurada nem reproduzida automaticamente.
- O onboarding request enviado pelo Renderer contém apenas `operationId`, `initialPermission` e
  `requiredPermissions`; as entradas antigas `prepareAllRequired` / `missingPermissions` não fazem mais parte do contrato IPC.
- O Main continua mantendo internamente o caminho do Helper, a identity assinada e `openedPermissions` como fatos de verificação de assinatura e coordenação de sessão, mas através do IPC retorna apenas `success/canceled/sessionId/returnedFromSettings/
  restartHelperAfterReturn/error`. O Renderer não recebe o caminho de sistema de arquivos do Helper nem campos de diagnóstico de identidade.
- Após retornar das configurações do sistema e concluir com sucesso o reinício do Helper, Settings solicita explicitamente apenas uma vez um teste de captura de tela real; o polling comum e a atualização de focus permanecem sempre somente leitura.

## Verificação

- Unit: opener do desktop main, Settings e o request_access ao vivo reutilizando o mesmo onboarding, apenas refresh após habilitar o plugin,
  sem efeitos colaterais em erro/histórico comum/mobile/remote.
- Teste manual de produto: abrir Accessibility/Screen Recording pela página de configurações do Computer Use; após o retorno da autorização o estado da página
  deve ser atualizado; o request_access ao vivo de uma tarefa em background mostra primeiro a caixa de confirmação, cancelar não abre as configurações e, após confirmar, apenas itens de falta de permissão ainda frescos são tratados.