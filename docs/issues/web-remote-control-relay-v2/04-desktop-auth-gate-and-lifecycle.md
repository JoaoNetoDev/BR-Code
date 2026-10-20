# 04 — Barreira de login do desktop e integração com o ciclo de vida do controle remoto

**O que construir:** O usuário de desktop sem login que abre a janela de controle remoto vê "é preciso fazer login primeiro" e tem acesso ao ponto de entrada de login; o main não registra o dispositivo nem conecta ao relay; quando o usuário faz login com sucesso, o main recebe a notificação e, se existir um alvo "já habilitado" e o workspace da janela já estiver sincronizado, restaura o controle remoto automaticamente; após o logout, o controle remoto para imediatamente e fica em `auth-required`; na inicialização do app, sem JWT, o fluxo de restauração para em `auth-required` aguardando o login. Mais um E2E de desktop.

**Bloqueado por:** 03

**Status:** in-progress

**Pai:** [Controle remoto Web com Relay V2: conectar o desktop após o login no celular](./01-relay-v2-login-pairing.md)

## Critérios de aceite

- [ ] Documento primeiro: `relay-v2-pairing.md` recebe o diagrama de sequência do login/logout com o ciclo de vida do controle remoto e a semântica de `auth-required`; a seção "restauração do estado de habilitação após reiniciar o app de desktop" do documento de arquitetura é atualizada para exigir a espera pelo JWT; listar a tabela de textos de `auth-required` em zh-CN/en-US (título, descrição, botão de login) para confirmação.
- [x] O estado de controle remoto ganha a apresentação `auth-required`: a janela exibe o texto "é preciso fazer login primeiro" e o ponto de entrada de login (reaproveitando o gatilho de login existente), sem exibir o QR code; textos em zh-CN e en-US completos.
- [x] Conferência visual: após a implementação, entregar a captura de tela da janela no estado `auth-required` (tema claro/escuro × zh-CN/en-US), produzida junto com o E2E deste ticket.
- [x] Novo IPC unidirecional renderer→main de notificação de estado de login (login bem-sucedido / logout), enviado pelo renderer quando a sessão OAuth muda; o protocolo usa tipos estritos e validação por schema em runtime.
- [x] O main recebe "login bem-sucedido": se existir um alvo já habilitado e o workspace da janela já estiver sincronizado, retenta a restauração; recebe "logout": para o runtime atual, coloca o estado em `auth-required` e não limpa o registro de habilitação. Na restauração na inicialização do app, sem JWT → mantém `auth-required` aguardando a notificação, sem iniciar outro host, sessão remota ou runtime do Agent.
- [x] Testes (interface pública do manager + fonte de estado de login falsa): sem JWT, recusa a inicialização e não faz nenhuma chamada HTTP/WS; a notificação de login dispara a restauração; a notificação de logout para e preserva o registro de habilitação; a restauração na inicialização aguarda quando não há JWT. O schema do IPC tem teste que rejeita campos inválidos; o estado `auth-required` da janela tem teste de renderização.
- [ ] Um E2E de desktop: no estado sem login, abrir a janela de controle remoto mostra a necessidade de login e o main não inicia nenhum registro nem conexão de relay; adicionado, verificado e promovido conforme o skill de workflow de E2E.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, testes unitários afetados e o novo E2E passam.

## Implementação e verificação

- Já foram adicionados o diagrama de sequência do ciclo de vida de login, a tabela de textos bilíngue, o IPC estrito unidirecional, a barreira de login/restauração do manager e o ponto de entrada de login. O workspace do controle remoto passou a ter o snapshot completo como única entrada; há regressões cobrindo a espera pelo login, o fechamento do alvo durante a leitura do disco, o placeholder remoto sem session, as notificações repetidas e os resultados assíncronos atrasados.
- O E2E pendente do desktop passou 1/1 após o build completo, com contagem de HTTP/WS do controle remoto igual a 0; as capturas de tela de tema claro/escuro × zh-CN/en-US estão em `packages/desktop/.e2e-artifacts/desktop-e2e-20260919054022407-p76850-149c65ccfe5737d4/`. A confirmação manual foi solicitada, ainda sem promoção.
- Os testes unitários de todo o repositório foram executados: 17.958 passaram, 1 falhou, 12 foram pulados. A única falha é `e2eRuntimePaths.test.ts`, que detectou o literal `/tmp` no arquivo já existente `feedback/manual-review/pending/feedback-upload-privacy.test.ts`; o arquivo está idêntico à baseline do início da tarefa e ao conteúdo do HEAD, e continua falhando em uma execução isolada. O incremento final deste ticket rodou mais 10 arquivos, com 125 testes relacionados, todos passando.
- `pnpm typecheck`, `typecheck:e2e`, `pnpm lint` (60 warnings já existentes, 0 erros), `pnpm architecture:check --changed` e a verificação de espaços em branco do diff passaram; as revisões Standards/Spec ficaram com 0 achados restantes.
- `e2e:fixture:check` hoje só suporta conversation-session/plugins; o caminho auth-config não é suportado; não havendo manifest de requisição de modelo, a verificação foi feita direto conforme o contrato já existente nesta área.
- Não foram modificadas as alterações que o usuário já tinha nas tickets 02/03. Por regra do projeto, como os testes unitários de todo o repositório não ficaram todos verdes e a promoção manual ainda não foi concluída, nenhum commit automático foi feito. Não houve teste no celular nem em Windows/Linux.
