# Projeção de workspace remoto e compatibilidade de persistência

Especificação atual. A UI de chat remoto sem projeto foi desativada; a entrada de projeto, a
seleção de diretório, a desconexão e a recuperação de navegação são definidas pela
[especificação de navegação de projeto](../remote/project-first-remote-navigation-spec.md).
Este documento mantém as restrições de leitura de compatibilidade e de persistência, e não
inclui mais o design de connect-and-chat nem as fases de implementação já concluídas.
O plano original, os cenários RCONV e as bases da revisão podem ser consultados com
`git show a17a875588b8d66c2bee49236292e174df651363:docs/architecture/remote-domain-simplification-and-conversation-workspace-spec.md`.

## Domínio e posse do estado

- A identidade de Source, o Profile, a chave canônica e a migração seguem a
  [especificação principal R3](r3-source-server-remote-architecture.md) §3, §9.
- A conexão física do dispositivo pertence ao Manager do Window Host; o attachment de workspace
  pertence ao Registry. Um dispositivo online não equivale a um projeto pronto.
- O join somente leitura da UI é fornecido por `RemoteWorkspaceProjection`; os cinco estados
  exibidos estão na [especificação de UX](remote-device-connection-ux-spec.md).
- `openWorkspaces` contém apenas workspaces remotos; `executionContexts` pode conter locais e
  remotos. Não é possível injetar campos de Source em uma tab local.
- A workspace key usa `workspaceIdentity?.trim() || workspacePath`; o path é usado para I/O, e o
  nome e a forma de conexão não participam da igualdade de identidade.
- Settings, Dialog e Sidebar reutilizam o mesmo join, filtrando apenas por surface, sem calcular
  cada um por conta própria o readiness de Source/attachment.
- command/controller reutilizam os Service/Manager/Registry existentes; a intenção atual de
  conexão de projeto está na especificação de navegação, e a antiga UI `open-conversation` não
  é restaurada.
- Main/relay não detêm a verdade de task/session/stream; o desktop continuous e o celular
  replayable mantêm seus respectivos limites de recuperação.

```text
Source Directory + Host Manager/Registry + TabStore
  → RemoteWorkspaceProjection → Settings / Assistente / Navegação de projeto
Ação explícita do usuário → Controller existente → serviço autoritativo do Host
```

## Seleção de navegação e projeção de compatibilidade

- A nova versão só restaura e grava `lastActiveWorkspace`; para limpar usa null; os membros de
  projeto/conexão pertencem ao SQLite do Host.
- `lastWorkspaceSession`, `recentProjects` e `lastActiveTabIndex` são projeções de compatibilidade
  degradadas, derivadas pelo Host a partir dos membros já confirmados, e não podem servir como
  open set de cold start da nova versão.
- Só a importação de settings antigos que não têm `lastActiveWorkspace` lê as listas antigas; o
  preenchimento tardio do active-first da versão antiga ainda precisa impedir o renascimento após
  o fechamento e a sobreposição da persistência pela recuperação em caso de falha.
- As tabs live/desconectadas do Renderer atual são cache de navegação em tempo de execução. Quando
  um Source fica online, apenas as tabs já existentes são reanexadas; os attachments de todos os
  diretórios não são recriados a partir dos campos antigos de compatibilidade.
- O fechamento explícito libera apenas o attachment daquela janela, sem apagar o dispositivo, o
  Profile, os membros do projeto, o backing directory ou as tasks remotas, e sem desconectar
  implicitamente o dispositivo inteiro.
- As referências de credential dos snapshots históricos não transferem posse. A atualização do
  histórico, o corte de capacidade e a remoção só podem produzir intenção de limpeza de
  credentials próprios `remote-workspace:`; os credentials `connection-profile:` são gerenciados
  pelo Source Directory e não podem ser apagados, mesmo se a reprojeção remover a referência.
- Os credentials legados de fallback são mantidos no rekey/na recuperação; o fechamento explícito
  só permite limpar credenciais antigos exclusivos e não referenciados por outro owner.
- A fonte de verdade atual da persistência é o [F5 de projeto virtual](../superpowers/specs/2026-09-09-virtual-project-design.md);
  a recuperação de dispositivos e janelas está em [reanexação do Renderer](../remote/desktop-remote-session-renderer-reattach.md).

## 5. Design de persistência

### 5.1 Esquema de compatibilidade próximo

Mantém `lastWorkspaceSession` como projeção de compatibilidade degradada derivada pelo Host:

- a entrada remote ganha `workspacePurpose?: WorkspacePurpose`, com omissão em `project`;
- a nova versão restaura apenas o `lastActiveWorkspace` somente leitura; os campos antigos não
  sobrescrevem a entrada de projeto do Host, e o Renderer e Web/Mobile não gravam essa projeção
  de membro;
- `sourceServerWorkspaceHistory` representa somente o histórico **conhecido** de **project**;
- os dados do backing workspace de conversas históricas são preservados, mas a entrada de
  conversation remota deixa de entrar na navegação da UI ou na recuperação automática;
- target/credential mantêm os campos antigos para compatibilidade com versões antigas, e o novo
  controller resolve preferencialmente pelo Profile.

O entry schema de `lastWorkspaceSession` é um objeto non-strict; versões antigas descartam o
purpose opcional desconhecido, portanto esse campo pode evoluir com segurança; quando uma versão
antiga lê uma entrada remote sem purpose, ela ainda a trata como `project`.

### 5.2 Regras de Source history

`SourceServerWorkspaceHistoryEntry` **não** ganha `workspacePurpose`. O schema atual é `.strict()`;
se uma nova versão escrever um campo novo, ao reverter para uma versão antiga a validação falha
em uma única entrada do history e faz o AppSettings inteiro degradar para os valores padrão;
qualquer atualização de settings posterior da versão antiga pode sobrescrever os settings
originais com base nisso.

- project: continua gravando em `sourceServerWorkspaceHistory`, podendo aparecer nos projetos
  recentes, na contagem de projetos e no seletor de projetos;
- conversation: é proibido chamar o `recordWorkspaceOpen` comum para gravar no project history.

O campo de nível superior do AppSettings guarda, para cada dispositivo, o canonical conversation
path já resolvido, como dado de compatibilidade preservado:

```ts
interface RemoteConversationWorkspaceRecord {
  workspacePath: string;
  lastResolvedAt: number;
}

interface AppSettings {
  remoteConversationWorkspaceBySourceServerId?: Record<
    string, // sourceServerId
    RemoteConversationWorkspaceRecord
  >;
}
```

Esse campo precisa ficar no nível superior do AppSettings non-strict; as versões antigas ignoram
com segurança o campo desconhecido inteiro, e ele não pode ser embutido em schemas strict como
`SourceServerRecord`, `ConnectionProfile` ou `SourceServerWorkspaceHistoryEntry`.
Ao usar esse registro, `workspacePath` serve apenas para I/O/exibição remota; `workspaceIdentity`
deve continuar sendo derivado pelo utilitário unificado
`buildServerRemoteWorkspaceIdentity({ sourceServerId, workspacePath })`, e a map key ou o sufixo
do caminho não podem ser tratados como identity.
Assim que uma versão antiga grava de volta os settings, ela pode descartar esse campo novo; a
nova versão, ao conectar novamente ao Source, precisa conseguir reconstruí-lo de forma
idempotente, sem tratá-lo como authority dos dados remotos nem como registro irrecuperável. Ao
excluir explicitamente um dispositivo, o map entry correspondente é limpo; um simples disconnect
não limpa.

Não é permitido adivinhar o purpose por prefixos de caminho como `.zcode/workspace/default`.

### 5.3 Simplificação de longo prazo (R4)

Quando a janela de reversão para versões antigas terminar, o open set será convergido para uma
estrutura baseada em referências:

```text
openWorkspaceSet:
  ordered workspaceKey[]
  activeWorkspaceKey
  per-key purpose
```

Dispositivo, linha, known workspace e runtime target deixam de ser embutidos duplicadamente no
open set; são resolvidos pelo Source Directory + Profile.
Esta implementação não faz a substituição destrutiva, e estabelece primeiro apenas um adapter de
compatibilidade.

## Compatibilidade de conversation histórica e migração restante

- A ausência de purpose tem como padrão `project`; só é permitido corrigir o purpose histórico
  quando o registro canônico do Source casa exatamente com o caminho, sem adivinhar por prefixo
  de diretório.
- A desativação da UI não apaga a capacidade subjacente, o canonical path map, as sessões
  remotas ou os dados de tasks; a UI deixa de ser restaurada automaticamente a partir da entrada
  open de conversation histórica.
- O open set referenciado do R4 e a limpeza dos campos duplicados de target/credential ainda
  aguardam o fim da janela de reversão; o reader antigo é mantido e não pode ser implementado junto
  com a organização do documento.
- O idle TTL do Source ocioso continua sendo um item de produto em aberto; ver R3-ISSUE-026.

## Limites de aceitação

Mantêm-se as proteções de active-first, fechamento explícito, rekey, gravação após carga parcial e
proteções de owner não-dono/recuperação em caso de falha de RCONV-08/12/13/14/15;
cenários da antiga UI de connect-and-chat como RCONV-01–05 são contratos históricos e não são mais
usados na aceitação do novo produto.
O isolamento de identidade e de múltiplas janelas continua coberto pela regressão do R3; os IDs
estáveis e as evidências estão no
[diretório de cases](../conversation-session-case-catalog.md) e na
[matriz de cobertura](../testing/conversation-session-e2e-coverage-matrix.md).
A organização do documento não reexecutou nem promoveu o status de nenhum teste.
