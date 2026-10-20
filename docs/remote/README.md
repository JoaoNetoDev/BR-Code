# Porta de entrada de leitura da cadeia principal remota

A especificação atual cobre Source Server via SSH / WSL / Docker. Escolha o documento de fatos conforme a mudança e não trate planos históricos como contrato atual.
Os owners de runtime, a identidade de workspace, o Host único por Window e os limites continuous/replayable estão em
[limites de runtime](../agents/runtime-boundaries.md).

```text
Especificação principal R3 (identidade / conexão / migração)
  ├─ UX de conexão (assistente / cinco estados / gestão de dispositivos)
  ├─ Navegação de projetos (intenção de diretório / experiência de desconexão / retomada de navegação)
  └─ Contratos específicos (Provisioning / reattach do Renderer / compatibilidade de persistência)
Diretório de cenários → matriz de cobertura → evidência de execução salva por baseline
Questões em aberto → registro de questões; corpo de processos antigos → entrada do snapshot histórico
```

## Contrato atual

As especificações principais citadas na tabela abaixo são [R3 Source Server](../architecture/r3-source-server-remote-architecture.md).

| Mudança                                                     | Fonte de fatos                                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source/Profile/identidade de workspace em três camadas, endereço da tarefa | Especificação principal §3                                                                                                                                                                                                       |
| Processo, Transport, instalação e upgrade, daemon/archive remoto         | Especificação principal §4–5; [Server CLI/daemon](../architecture/r2-server-cli-and-daemon.md)                                                                                                                                   |
| Handshake, autenticação, gate de compatibilidade e atualização           | Especificação principal §6                                                                                                                                                                                                       |
| Conexão física, conexão silenciosa de inicialização, retry e troca de geração de recuperação | Especificação principal §7                                                                                                                                                                                                       |
| Propriedade do serviço RPC, gestão de dispositivos e migração           | Especificação principal §8–9                                                                                                                                                                                                     |
| Reload do Renderer, reattach do projeto após o Source voltar ao ar      | [Reattach do Renderer](desktop-remote-session-renderer-reattach.md)                                                                                                                                                    |
| Projection, open set, strict schema, itens pendentes de migração para R4 | [Projeção e compatibilidade de persistência](../architecture/remote-domain-simplification-and-conversation-workspace-spec.md)                                                                                                             |
| Assistente de três telas, cinco estados unificados, log de erros, card de dispositivo, prévia de instalação e lista de tarefas | [UX de conexão](../architecture/remote-device-connection-ux-spec.md)                                                                                                                                                  |
| Projetos lado a lado, reconexão no lugar, permissão de diretório, retomada do projeto e da sessão originais | [Navegação de projetos](project-first-remote-navigation-spec.md); a UI de chat remoto sem projeto foi desativada, os dados são preservados                                                                                                                         |
| Provisioning automático de Provider e ajustes de modelo local              | [Provisioning](provider-provisioning.md); [propriedade das configurações do app](../ssh-remote-app-global-state-authority.md)                                                                                                           |
| Host attachment já existente no celular e recuperação replayable              | [Arquitetura de controle remoto](../web-remote-control/web-remote-control-architecture.md), [sincronização de tarefa em tempo real](../web-remote-control/task-realtime-sync.md), [reconexão do workspace do celular](../web-remote-control/mobile-remote-workspace-reconnect.md) |
| WSL                                                      | [Limite de tempo real](wsl-remote-realtime-boundary.md), [headers de Provider](wsl-provider-runtime-headers.md), [design de WSL](../wsl-remote-workspace-design.md)                                                                 |
| Cache de assets do Windows                                         | [Hardening de rename do cache](windows-remote-asset-cache-rename-hardening.md)                                                                                                                                                   |
| Política de rede de descriptor/archive do Desktop                      | [Política de rede de assets remotos](zcode-agent-remote-deployment.md)                                                                                                                                                            |
| Conexão direta ao Server só em dev                                     | [Server workspace](server-remote-workspace-connection.md); a descrição do processo antigo segue a especificação principal                                                                                                                               |
| Artefatos de release e CI                                            | [CI/CD](../desktop-ci-cd.md), [layout de artefatos](../desktop-ci-artifact-layout.md)                                                                                                                                      |

## Questões e verificação

- [Separação entre criação de projeto e gestão de conexão remota](../issues/remote-connection-ux/15-project-device-selection-and-connection-management.md): contém as três entradas, a seleção de dispositivo, a adição por categoria, o retorno ao rascunho e os cenários de aceite; o escopo de implementação e verificação está nos registros de conclusão dos subtickets #16–#22, e o status do ticket pai e as plataformas ainda não verificadas seguem os registros de cada ticket.

- [Seleção obrigatória de pasta remota após conectar o chat e entrada no projeto](../issues/remote-connection-ux/21-chat-settings-round-trip.md): em 2026-10-14 foi implementado conforme #23–#26; seleção explícita de diretório a cada vez, entrada no projeto por correspondência única／múltipla／nula, cancelamento restaura o alvo original e o envio fica proibido até a preparação do projeto terminar. As evidências de verificação atuais e as plataformas ainda não exercitadas estão na especificação, e os candidatos ainda mantêm o limite de revisão manual.

- [Registro de questões do R3](../architecture/r3-source-server-remote-open-issues.md): mantém itens não corrigidos, aguardando verificação e decisões de produto pendentes; itens fechados não entram mais na ordem de correção.
- [Índice de subtarefas de UX](../issues/remote-connection-ux/01-remote-connection-ux-optimization.md): implementação concluída e avaliação de ssh-agent ainda em aberto.
- [Plano de testes](../testing/r3-remote-automation-plan.md), [matriz R3A](../testing/r3-remote-automation-case-matrix.md): metas completas de aceite e lacunas de cobertura.
- [diretório de cases](../conversation-session-case-catalog.md), [matriz de cobertura](../testing/conversation-session-e2e-coverage-matrix.md): IDs estáveis, arquivos de teste, status pending/formal e evidências.
- [SSH P0](../testing/ssh-remote-p0-e2e-plan.md): asserções específicas e entrada de projeto; [harness](../../harness/remote/README.md): comandos de execução e isolamento de ambiente.
- [Regressão do guia SSH do desktop em 2026-10](../testing/desktop-ssh-guide-regression.md): os 100 cenários agendados do lote original e as correções direcionadas posteriores; não é possível afirmar com base nisso que celular/WSL/Docker estão todos verdes.
- [Reexecução histórica de 2026-09-10](../testing/r3-remote-full-rerun-2026-09-10.md): resultados da baseline original; o [índice de arquivos históricos](../archive/remote-r3/README.md) localiza evidências anteriores.

O PASS registrado vale somente para o código-fonte, build, cenários e ambientes listados. A compactação de documentação não reroda testes, não muda status e não apaga artefatos originais.
