# Spec de onboarding de permissão em tempo real para `request_access` do CUA

- Data: 2026-08-25
- Status: em implementação
- Relacionados: producer `zcode-cua` !576, consumer `z-code` !2315

## Contrato do produto

`request_access` é um snapshot de permissões somente leitura e não dispara diretamente um native prompt. O Producer fornece o estado versionado no `_meta` namespaced do resultado de sucesso no macOS; o Consumer gera uma única observação de permissão somente quando a authority official-CUA, o nome exato da ferramenta, o schema estrito e o live event local `desktop-continuous` valerem simultaneamente.

```text
live official request_access
  -> typed metadata
  -> authority-gated CLI projection
  -> desktop-only live observation
  -> fresh Host status
  -> ZCode confirmation
  -> fresh Host status
  -> existing onboarding
  -> Helper restart + refresh

history / recovery / mobile / remote / ordinary error -> no side effect
```

## Estado e efeitos colaterais

- `denied` e `stale` de Accessibility, e `denied` de Screen Recording, são ausência de permissão determinada; `unknown` não dispara o onboarding daquela permissão.
- Qualquer live task local gerenciada pelas janelas de desktop atuais pode disparar; não é exigido que a tarefa esteja visível nem que o workspace esteja ativo.
- A mesma `workspaceKey + sessionId + turnId + missingPermissions` só é confirmada uma vez; observações concorrentes são agrupadas enquanto a confirmação ou o onboarding está em andamento. Um novo `request_access` em um novo turn pode lembrar novamente.
- Antes e depois da confirmação se chama `getStatus(..., {includeFunctionalProbes:false})`, e só o estado fresco decide a lista de permissões.
- Quando ambas faltam, a ordem fixa é Accessibility e depois Screen Recording.
- Se o usuário cancelar, as configurações do sistema não são abertas; após a autorização voltar, o Helper correspondente é reiniciado e o estado é atualizado apenas conforme o contrato de owner existente.
- Nenhum conversation command é chamado, não há continuation automática e nem `request_access` ou ações anteriores são repetidas.

## Fronteiras de entrega e identidade

- A observação de wire é gerada apenas pelo `ToolCallResult` live e não entra em snapshot, transcript nem recovery.
- O renderer confiável de `desktop-continuous` pode assinar; `web-remote-replayable` retorna evento vazio.
- `workspaceKey = workspaceIdentity?.trim() || workspacePath` é usado para isolamento; a execução e as consultas ao Helper continuam usando `workspacePath`. Workspace com `remoteSessionId` ou identity remota é podado direto.
- MCP de terceiros com o mesmo nome, metadata malformado, `permission_denied` comum, textos históricos de `CUA_PERMISSION_REQUIRED` e o parser de JSON do Tool Card não podem disparar.

## UI

Reaproveita o ConfirmDialog global e o onboarding existente, sem criar um sistema novo de modais. O texto explica que a tarefa de operação de computador em execução precisa de permissões do macOS, e as ações são "Ir autorizar" / "Agora não". A janela em segundo plano apenas enfileira a exibição da confirmação e não rouba o foco.

## Verificação

- Producer: schema do metadata, texto inalterado, fail closed de somente leitura / entre plataformas.
- Core/Protocol: authority, nome da ferramenta, strict schema, live-only e fronteira de clientMode.
- UI: dupla checagem de estado fresco, agrupamento de concorrência, deduplicação no mesmo turn, cancelar/confirmar, recuperação do Helper e zero repetição de tarefas.
- E2E: tarefa em segundo plano, cold restore, mobile replayable e case representativo de erro comum.