# Otimização da interação e da experiência visual da conexão remota

Status: in-progress

2026-10-10 consolidation: 12 subtickets de implementação estão como done; a avaliação de ssh-agent/chave padrão continua como ready-for-human, sem agendamento ou implementação automática. A ticket principal mantém o escopo e os itens pendentes originais, sem copiar a tabela de status, a tabela de erros e o fluxo da especificação formal.

2026-10-12 foi adicionada [15 — Separação entre criação de projeto e gestão de conexões remotas](15-project-device-selection-and-connection-management.md), com Status ready-for-agent. Essa ticket é o próximo objetivo de interação já confirmado, ainda não implementado; as descrições de escopo abaixo preservam o contrato original dos lotes 02–14, e o escopo substituto da 15 quanto a entrada, destino após a conclusão da conexão e retorno de rascunho segue o texto da própria ticket.

## Problema e especificação atual

O problema original era a dificuldade de entender os erros de conexão, a inconsistência de estados, o caminho de primeira conexão longo demais, a ausência de conteúdo e de entrada de recuperação após a desconexão, além da dispersão das regras de gestão de dispositivos e das regras visuais.
Os fatos atuais são mantidos pelos seguintes arquivos:

- [Conexão UX](../../architecture/remote-device-connection-ux-spec.md): cinco estados, erros, assistente de três telas, cartão de dispositivo, logs, pré-visualização de instalação, atualização e acessibilidade.
- [Navegação de projetos](../../remote/project-first-remote-navigation-spec.md): projetos em mosaico, preservação da intenção de diretório, reconexão no lugar, restauração da navegação e limite dos dados históricos.
- [Especificação principal R3](../../architecture/r3-source-server-remote-architecture.md): identidade, autoridade de Host/Source, versão e migração.
- [Especificação de design](../../../DESIGN.md): tema, cores semânticas e escala dos componentes.

### Escopo e limites

- **O escopo é o fluxo de interação**, sem alterar o modelo de domínio, a máquina de estados da conexão nem a semântica do protocolo de tarefas; apenas as extensões de contrato listadas abaixo são permitidas.
  - O modelo de três camadas `sourceServerId`, Connection Profile e workspace identity permanece inalterado.
  - O contrato de navegação "projetos em mosaico + escolha de diretório após conectar" permanece inalterado.
- **As alterações de contrato permitidas se limitam aos cinco itens a seguir** (os itens 4 e 5 foram confirmados pelo usuário em 2026-09-29, a serviço de [11 — Tela de conexão e tela de seleção de diretório](./11-connecting-and-directory-screens.md)):
  1. Ampliação do conjunto de códigos de erro de conexão.
  2. Novo item no camada de serviço: "ler o log da última operação do dispositivo".
  3. O registro de dedupe das notificações de atualização passa a ser persistido. Ele pertence às preferências locais da UI e não envolve o protocolo.
  4. O snapshot de gerenciamento oferece uma pré-visualização de instalação somente leitura: versão publicada, caminho real de instalação no remoto e tamanho do pacote de instalação. O tamanho do pacote não se faz passar por espaço ocupado após a extração.
  5. Fornecer uma lista somente leitura das tarefas em execução no remoto: uma projeção de atividade do owner de tarefas existente, entregue via `running-tasks --json` e pelo snapshot de gerenciamento à tela de confirmação de atualização forçada; remotos antigos que não suportam essa capacidade exibem explicitamente que a lista está indisponível.
  - Os itens 4 e 5 não alteram a execução de tarefas, a máquina de estados da conexão, o formato persistido de `status.json`, o isolamento da identidade de workspace nem a semântica de recuperação `continuous` do desktop / `replayable` do celular.
- **O estreitamento e a sanitização do log de progresso** são correções de comportamento do processo principal e do lado do host, sem novo contrato.
- **ssh-agent e chave padrão não são prometidas por enquanto.** Suportar `IdentityFile`/`IdentityAgent` na config, o padrão `~/.ssh/id_*` e ssh-agent (no Windows, o pipe do OpenSSH agent ou o Pageant) exige uma avaliação separada da carga de alterações na camada de serviço e das diferenças entre plataformas; o resultado da avaliação vai para o usuário decidir se há agendamento.
- **Somente o desktop.** O Web do celular `/remote` não é ajustado, apenas passa por regressão, garantindo que não haja quebra.
- **Afeta apenas a recuperação do desktop.** Alterações que envolvem o tempo da recuperação valem apenas para a recuperação `continuous` do desktop; o limite de recuperação `replayable` do celular permanece inalterado.

## Subtarefas e evidências

| Subtarefa                                                                                       | Estado do registro |
| ---------------------------------------------------------------------------------------------- | ------------------ |
| [02 — Log de conexão e contrato de erros](02-connection-log-and-error-contract.md)               | done               |
| [03 — Modelo de apresentação, 5 estados e glossário](03-presentation-model-states-and-glossary.md) | done              |
| [04 — Correções P0 do assistente e extração do controlador de fluxo](04-wizard-p0-fixes-and-flow-controller.md) | done              |
| [05 — Salvaguardas da página de configurações, edição de conexão e marcação de escopo](05-settings-safeguards-edit-and-scope.md) | done              |
| [06 — Protótipo de interação e revisão](06-interaction-prototype-review.md)                    | done               |
| [07 — Avaliação de ssh-agent e chave padrão](07-ssh-agent-default-key-evaluation.md)            | ready-for-human    |
| [08 — Experiência de desconexão e reconexão no lugar](08-disconnect-experience-and-in-place-reconnect.md) | done              |
| [09 — Voltar ao ponto original após reconexão ou reinício](09-restore-after-reconnect-and-restart.md) | done              |
| [10 — Assistente de três telas: esqueleto, tela de seleção unificada e linha de progresso recolhida](10-three-screen-wizard-and-selection.md) | done              |
| [11 — Redesenho da tela de conexão e da tela de seleção de diretório](11-connecting-and-directory-screens.md) | done              |
| [12 — Barra lateral, cabeçalho de sessão e menus](12-sidebar-header-and-menus.md)                | done               |
| [13 — Cartões de dispositivo na página de configurações, conexões incompletas e avisos de atualização](13-settings-device-cards-and-updates.md) | done              |
| [14 — Acabamento visual e acessibilidade](14-visual-polish-and-accessibility.md)                | done               |
| [15 — Separação entre criação de projeto e gestão de conexões remotas](15-project-device-selection-and-connection-management.md) | ready-for-agent |
| [27 — Layout e cores do formulário de nova conexão](27-new-connection-form-polish.md)             | done               |

Cada subticket mantém a causa raiz, a spec correspondente e as evidências de execução. done não representa a admissão formal/CI;
o [catálogo de cases](../../conversation-session-case-catalog.md) define os cenários,
e a [matriz de cobertura](../../testing/conversation-session-e2e-coverage-matrix.md) registra os arquivos de teste, o status pending e as evidências.

## Out of Scope

- **Ajustes de exibição e de interação da apresentação remota no Web do celular `/remote`**, incluindo a distorção do nome do dispositivo em R3-ISSUE-017. Nesta rodada, apenas se garante a ausência de regressão.
- **Filtro ou agrupamento quando o número de dispositivos e de projetos é muito grande (mais de 20).** A navegação continua em mosaico.
- **Desconexão por tempo ocioso quando o dispositivo está online mas sem projeto aberto.** Isso alteraria a máquina de estados da conexão.
- **A atribuição de escopo de cada seção da página unificada de configurações**, como o fato de o subagente sempre atuar na máquina local. Nesta rodada, apenas se faz a marcação explícita.
- **Verificação do comportamento real dos hooks sob escopo remoto.**
- **Enfileiramento de mensagens offline, bem como reconexão automática no momento do envio.**
- **Alterações de modelo de domínio, máquina de estados e protocolo fora das cinco alterações de contrato listadas neste documento.**
- **Suporte a ssh-agent e chave padrão.** Exige avaliação separada e, em seguida, decisão do usuário sobre o agendamento.
- Os cinco primeiros itens acima são registrados no documento de issues abertas, como issues posteriores.

## Itens pendentes e base histórica

- A revisão do protótipo está registrada na subticket 06; a avaliação de ssh-agent fica com a subticket 07, que preserva a decisão do usuário.
- Os issues fora de escopo estão reunidos em [R3-ISSUE-017/025–028](../../architecture/r3-source-server-remote-open-issues.md#连接体验后续议题rdux-范围外). Itens não concluídos não são escondidos dentro do texto histórico.
- As inferências da walkthrough original sobre atualização local muito antiga, notificação de atualização repetida e progresso de recuperação não podem se passar por evidências de execução; a cobertura posterior segue a subticket e a matriz correspondentes.
- Ainda é preciso avaliar de forma independente se o log de diagnóstico como um todo deve ser sanitizado ainda mais; o contrato desta rodada cobre apenas o log de conexão visível ao usuário e o conteúdo anexado ao feedback.
- A linha de base original da walkthrough é `e185847b58`, e o diretório temporário de capturas de tela é `/tmp/zcode-remote-ux-walkthrough/`, sem garantia de disponibilidade em outras máquinas.
- A lista completa de problemas, as histórias de usuário, os nomes originais das capturas de tela e o processo de decisão ficam guardados no commit anterior à organização, e não mais constituem uma segunda especificação atual:

```bash
git show a17a875588b8d66c2bee49236292e174df651363:docs/issues/remote-connection-ux/01-remote-connection-ux-optimization.md
```
