# 27: Disposição e paleta do formulário de nova conexão

Status: done

**Parent:** [#01 — Otimização da UX de interação e visual das conexões remotas](01-remote-connection-ux-optimization.md)

**Spec:** [Especificação de UX de conexão de dispositivos remotos · RDUX-27](../../architecture/remote-device-connection-ux-spec.md#新建连接表单rdux-272026-10-14)

**O que construir:** o formulário compartilhado entre a entrada «Nova conexão» em Configurações e a entrada «Nova conexão SSH» em projeto/chat. Ajustar, conforme a spec, o cabeçalho, a troca de tipo, a importação do SSH config, a disposição dos campos, a divisão de colagem, a validação inline, as dicas de Docker/WSL, a paleta e o rodapé. Alterar apenas a camada de UI, sem mexer no fluxo de conexão, no protocolo e na semântica de estado de `useRemoteConnectionForm`.

**Blocked by:** nenhum. Reutiliza o formulário categorizado da entrada de Configurações de [#17](17-typed-remote-device-addition.md).

## Acceptance criteria

- [x] A entrada de Configurações não exibe a barra de etapas nem a frase de explicação; o título é «Nova conexão», com pré-visualização ao vivo do destino da conexão abaixo do título. A entrada de projeto/chat mantém a barra de três etapas e exibe a etiqueta de tipo ao lado do título.
- [x] A troca de tipo é um controle segmentado com ícones, e o item selecionado usa a cor do tipo correspondente; o método de autenticação e a forma de entrada de Docker permanecem neutros.
- [x] «Importar do SSH config» na entrada de Configurações abre uma camada pesquisável, e a seleção exibe a etiqueta associada; o × apenas desfaz a associação e preserva os valores já preenchidos; fica desabilitado quando não há Host; em caso de falha de leitura, exibe um aviso e permite o preenchimento manual. A entrada de projeto/chat não exibe a entrada de alias.
- [x] Host e porta ficam na mesma linha; o nome de usuário ocupa uma linha inteira; as opções avançadas não têm separador tracejado.
- [x] Ao colar `user@host`, `user@host:port` ou `ssh user@host -p N` no campo de host, o conteúdo é dividido automaticamente e a dica «Reconhecido» é exibida; outros conteúdos são colados como estão; a colagem desfaz a associação de alias.
- [x] Na abertura, o foco fica no host; após a importação, o foco vai para o primeiro campo obrigatório vazio.
- [x] Os erros de validação são exibidos abaixo do campo e associados via `aria-describedby`; o foco vai para o primeiro campo com erro; o rodapé não tem texto de validação; o modal de edição de conexão reaproveita a mesma função de validação e os mesmos erros inline.
- [x] Docker / WSL removem o parágrafo explicativo do topo; quando o Docker está indisponível, exibe um cartão de aviso; quando não há contêiner em execução, exibe um aviso neutro.
- [x] O rodapé da entrada de Configurações é alinhado à direita; o da entrada de projeto/chat tem «Voltar» à esquerda e «Conectar» à direita.
- [x] A borda superior do modal fica fixa em 10% da viewport; a troca do método de autenticação ou do tipo não move a borda superior.
- [x] Chinês e inglês, temas claro e escuro, 1440 / 480px ficam totalmente visíveis; todos os `testid` existentes são preservados, com a adição de `remote-ssh-config-import`, `remote-ssh-config-alias-chip` e `remote-new-connection-preview`.

## Verification

- Testes unitários de UI: testes de tabela de `parseSshPasteTarget`; regras de `collectRemoteFormFieldErrors`; cabeçalho do formulário, troca de tipo, importação/etiqueta de associação, colagem, foco, validação inline, rodapés das duas entradas e o modal de edição.
- E2E desktop: atualizar as asserções afetadas em `conversation-session-settings-connection-completion`, `conversation-session-ssh-remote-three-screen` e `conversation-session-remote-accessibility`; o caso permanece pending.
- Checagem de tipos, lint, portão de arquitetura e testes unitários afetados.

## Deferred verification

- [ ] Descoberta real de WSL no Windows e adição manual.
- [ ] Regressão real de ponta a ponta da entrada de controle remoto no Web／no celular.

## Completion evidence (2026-10-14)

- Implementação: a pré-visualização do cabeçalho e a barra de etapas estão em `RemoteConnectionWizardChrome.tsx`; a troca de tipo, a importação e o rodapé estão em `RemoteConnectionDialogContent.tsx`; a disposição dos campos, o controle segmentado, a camada de alias, a divisão de colagem e os erros inline estão em `RemoteConnectionFields.tsx`; a única fonte de validação `collectRemoteFormFieldErrors`, a pré-visualização `formatRemoteDraftPreview` e a análise de colagem `parseSshPasteTarget` estão em `lib/remoteConnectionWizard.ts`; a origem das cores por tipo é `REMOTE_KIND_PRESENTATION`. O modal de edição de conexão removeu a validação de campos própria e passa a usar a mesma função.
- O item não selecionado do controle segmentado usa `focus-visible:bg-hover` para indicar o foco por teclado: desde o commit `2bb283f474`, o estilo global desabilitou o focus outline / box-shadow. A asserção original de outline em `settings-connection-completion` necessariamente falha após esse commit e foi trocada por uma asserção de `:focus-visible`.
- Verificação: `pnpm typecheck`, `pnpm lint` (0 errors), `pnpm architecture:check --changed` (0 violations) e os testes unitários de UI novos e afetados passaram. Em macOS Desktop local com um contêiner SSH Linux dedicado, `conversation-session-settings-connection-completion.test.ts` rodou com 2 casos aprovados, incluindo validação inline e foco de formulário vazio, etiqueta de associação de importação e foco, pré-visualização do cabeçalho, borda superior estável ao trocar o método de autenticação, divisão de colagem, cor do tipo Docker e remoção do parágrafo explicativo, com capturas de tela cobrindo chinês e inglês, temas claro e escuro, 1440 / 480px.
- `conversation-session-ssh-remote-three-screen.test.ts`: o botão de importação, a confirmação de primeira instalação e a adição de dispositivo passaram; depois disso foi bloqueado pelo pop-up «login expirado» do ambiente de E2E, e a reconexão offline e a recolhimento do trecho que falhou não foram concluídos.
- `conversation-session-remote-accessibility.test.ts`: a parte de teclado do formulário (incluindo `:focus-visible` do controle segmentado) passou; em seguida o caso ainda aguardava a entrada de Configurações chegar à tela de diretório, o que conflita com a semântica de conclusão dentro das configurações de #16/#17 (o log de conexão mostra `remote-connected`), tratando-se de uma asserção obsoleta preexistente; este ticket não reescreveu a segunda metade do caso. A nova asserção «foco no host ao abrir» fica na segunda metade e não chegou a ser executada.
- Testes unitários afetados na raiz (`--base f67f7570ba`): 1393/1395 arquivos passaram; as 3 asserções de endpoint de suíte de `packages/services` (`z.ai` vs `z.ai`) também falham na baseline `f67f7570ba` e são alheias a este ticket.

## Follow-up fixes (2026-10-14)

Após a revisão de `870fc0e012`, foram corrigidos quatro pontos: a porta produzia `port: 0` quando apenas o espaço em branco era preenchido (a construção passou a ler o mesmo valor com trim usado na validação); a análise de colagem extraía um nome de usuário incorreto de `ssh://user@host` e `user:password@host` (o nome de usuário passa a excluir `:` e `/`, com colagem literal); o dropdown vazio de Docker passou a exibir sempre «Selecione o contêiner em execução» (texto da causa restaurado); ao abrir o modal de edição a partir de «Modificar host», o foco da validação caía no host sinalizado (agora foca somente campos com descrição de erro). Testes unitários de UI cobrem os quatro itens; o E2E desktop ganhou o RDUX27-1.
