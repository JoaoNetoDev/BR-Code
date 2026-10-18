# Confirmação de Logout e Reinicialização no Desktop

## Contexto

O logout no desktop altera o contexto global de autenticação. As sessões existentes do ZCode Agent, as tasks em execução e as toolchains em segundo plano dependem do provider token atual e das chaves derivadas de Start/Coding Plan. Para evitar que, após o logout, as sessões antigas continuem segurando contexto inválido, o logout no desktop precisa interromper a execução atual e reiniciar o App depois que o usuário confirmar.

## Design

- O lado da UI continua usando o `ConfirmDialogHost` unificado, sem novos componentes de diálogo.
- O `handleLogout` do Root consulta primeiro a contagem de sessões em execução mantida pelo processo main do desktop, antes de executar `oauthService.logout()`.
- Se forem detectadas agent sessions em execução, o texto de confirmação exibe a quantidade concreta; se nada for detectado, o texto ainda informa que o App será reiniciado.
- "Desconectar e reiniciar" é a ação principal que conclui o fluxo de logout; o botão de confirmação usa o botão primary padrão do ConfirmDialog unificado. O risco das sessões em execução é explicado apenas pelo título e pela descrição, sem rebaixar o botão para warning/danger.
- Se o usuário cancelar, não dispara telemetry, logout nem reinicialização.
- Após a confirmação, o OAuth, o provider family domain e o estado de exibição são limpos na ordem original, e então o App é reiniciado por meio do comando do desktop.

## Limites

- A contagem de sessões em execução vem da contagem de host running tasks já existente no processo main e é usada apenas para o texto de confirmação do desktop, sem afundar o estado de negócio de session/task no main.
- O remote Web/mobile não usa esse comando de reinicialização; o fallback Web retorna 0 sessões em execução e permanece no-op.
- O comando de reinicialização passa primeiro pela preparação de app quit existente, garantindo que o host process e os subprocessos do agent ainda sejam limpos pelo caminho de saída do desktop.