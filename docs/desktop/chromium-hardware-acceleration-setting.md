# Configuração de aceleração de hardware do Chromium

## Contexto

O desktop do ZCode roda sobre Electron/Chromium. Algumas combinações de placa de vídeo ou driver podem apresentar tela branca, crash ou anomalias de renderização na inicialização da GPU, na composição de páginas ou nos caminhos de WebGL. O Electron só permite chamar `app.disableHardwareAcceleration()` antes de `app.ready`, portanto a opção de produto precisa ser salva como configuração de inicialização e passar a valer na próxima subida.

## Semântica de produto

- Nome da opção: Chrome hardware acceleration (aceleração de hardware do Chrome).
- Valor padrão: ativada.
- Quando desativada: na próxima subida do desktop, chamar `app.disableHardwareAcceleration()`.
- Quando ativada: não chamar `app.disableHardwareAcceleration()`, restaurando o comportamento padrão de aceleração de hardware do Electron/Chromium.
- Após a alteração é obrigatório informar ao usuário que é preciso reiniciar o aplicativo; esta mudança não faz troca imediata em tempo de execução.
- O escopo desta alteração não inclui a sincronização do parâmetro `.desktop Exec` de deep link do AppImage no Linux.

## Limites de implementação

- O campo de configuração é gravado no `AppSettings` global e expressa apenas o comportamento de inicialização do desktop; mesmo que a Web e o mobile leiam esse campo, nenhuma ação de plataforma é disparada.
- No início da inicialização usa-se leitura síncrona do arquivo `~/.zcode/v2/setting.json`, evitando esperar por `createSettingService().get()` ou por `app.whenReady()` e com isso chamar a API tarde demais.
- Em caso de falha de leitura, configuração ausente ou tipo de configuração inválido, o padrão é voltar a "ativado", sem impactar a subida do aplicativo.
- A UI exibe a opção apenas na página de configurações do desktop, com texto explicando que desativar a aceleração de hardware contorna alguns problemas de placa/driver e deixando explícito que vale após reiniciar.

## Verificação

- Testes unitários cobrem o valor padrão e o patch do schema de configurações.
- Testes unitários cobrem a extração da configuração de inicialização e a fronteira de chamada de `app.disableHardwareAcceleration()`.
- Testes unitários cobrem a renderização da opção no desktop e seu callback na página de configurações.
- Ao final, executar `pnpm typecheck` e `pnpm lint`.