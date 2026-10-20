# 02 — Contrato compartilhado do Relay V2 e fixture de relay falso

**O que construir:** Sem alterar nenhum comportamento existente do V1 (fase de expand), fornecer para as duas pontas — desktop e celular — o contrato compartilhado do Relay V2: os tipos de mensagem do relay V2 e a validação em runtime, os tipos do contrato HTTP de registro/listagem/exclusão de dispositivo e de token único, a construção e o parsing de URLs de QR code sem `hash` e as constantes de heartbeat do V2; além de um relay V2 falso em processo, compartilhado pelos testes das duas pontas. Ao final, qualquer uma das pontas pode escrever e executar testes contra o handshake do V2, o heartbeat, os códigos de erro e as falhas de HTTP sem depender de um ambiente online.

**Bloqueado por:** Nada — pode começar imediatamente.

**Status:** in-progress

**Pai:** [Controle remoto Web com Relay V2: conectar o desktop após o login no celular](./01-relay-v2-login-pairing.md)

## Critérios de aceite

- [x] Documento primeiro: criar o esqueleto de `docs/web-remote-control/relay-v2-pairing.md`, registrando o contrato de mensagens WebSocket do V2 (`auth_init` sem `role`, `pair_status_query` sem `device_sid`, `client_ts` em segundos Unix), o contrato HTTP (registro/listagem/exclusão de dispositivo, token único de `role=device|terminal`) e os limites de capacidade do relay falso.
- [x] O shared ganha os tipos de mensagem de entrada e saída do relay V2, os tipos de requisição/resposta HTTP e as funções de parsing em runtime correspondentes; o parsing rejeita campos inválidos. Os tipos e o parsing do V1 permanecem intocados e todos os testes existentes do shared passam.
- [x] O construtor de URL de QR code dá suporte à forma V2 sem `passHash`/`timestamp`; o parser aceita URLs em que `sid`, `mid`, `name` e `app_version` são todos opcionais e não há `hash`. O resultado do parsing do V1 com `hash` não muda.
- [x] As constantes de heartbeat ganham o grupo do V2: base de 5 segundos, jitter ±1 segundo, deadline de ACK de 15 segundos; as constantes do V1 são mantidas.
- [x] Fixture de relay V2 falso: em processo, oferece simultaneamente handlers HTTP de registro/listagem/exclusão de dispositivo e de emissão de token, além de um servidor WebSocket em `/api/v1/remote/ws2?token=`. O token é de uso único e fica vinculado ao `role` e ao usuário; `auth_init` valida a posse do dispositivo, e um dispositivo de outro usuário devolve `AUTH_FAILED`; uma nova conexão com o mesmo papel substitui a antiga e envia `KICKED` para a antiga; `data` é transmitido entre as duas pontas pareadas e tem `client_ts` substituído por `server_ts`.
- [x] O relay falso permite encenar: o `pair_status` de `auth_ack`/`pair_status_ack`, qualquer código de erro (`AUTH_FAILED`/`WRONG_PARAM`/`KICKED`/`INTERNAL`/`DEVICE_OFFLINE`), desconexão pelo servidor, erros de rede e HTTP 401/5xx; registra cada mensagem recebida e cada chamada HTTP para asserções. Serve tanto a clientes Node `ws` quanto a clientes WebSocket compatíveis de navegador.
- [x] O próprio relay falso tem testes que comprovam os comportamentos acima coerentes com a documentação do V2. A fixture fica em um local que os testes do desktop e do celular consigam importar; a posição exata é decidida na implementação e registrada em `relay-v2-pairing.md`.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed` e os testes unitários afetados passam.

## Comentários

2026-09-19: implementação da funcionalidade concluída, o portão de validação ainda tem bloqueios de baseline/ambiente; o status permanece `in-progress`, sem commit.

- A base do contrato e a API da fixture estão em [Contrato de pareamento do Relay V2](../../web-remote-control/relay-v2-pairing.md). O parsing independente de mensagens/HTTP do V2 no shared, o parsing explícito de QR code do V2, as constantes de heartbeat do V2 e o relay falso compartilhado já foram implementados; o comportamento padrão do V1 foi preservado.
- `pnpm typecheck`, `pnpm lint` (0 errors, 60 warnings preexistentes) e `pnpm architecture:check --changed` passaram; a regressão final do pacote shared e do transport existente do desktop/celular totalizou 133 arquivos e 1.504 testes passando.
- O `pnpm test:unit` completo exigido pelo implement foi executado: 1.914 arquivos passaram, 4 falharam e 2 foram pulados; 17.943 testes passaram. Após a reexecução direcionada, os timeouts de TTFT do CUA staging e os erros de teardown não voltaram a aparecer; continuam falhando `e2eRuntimePaths.test.ts` (o `feedback-upload-privacy.test.ts:105` existente usa `/private/tmp`) e `storagePreparationProtocol.test.ts` (o dist local exportado por `@zcode/adapters/storage` não tem o `SqliteSessionStore.openStartup` que existe no código-fonte). Os fontes relacionados não tiveram alteração em relação à baseline do início da tarefa; não foram misturadas correções sem relação com este ticket.
- Revisão de código em dois eixos: Standards sem achados; Spec encontrou diferenças de status HTTP/código de negócio na exclusão, que foram corrigidas e reconferidas até o fechamento. O portão completo não passou; seguindo a regra raiz, as alterações foram mantidas sem commit automático.
