# Diretório de Sessões de Subagentes

## Objetivo

O estado dos subagentes da sessão pai usa uma única projeção somente leitura, que ao mesmo tempo alimenta a entrada em tempo real do composer, o resumo no canto superior direito,
o diretório de subagentes e a limpeza de tabs inválidas. O diretório mostra apenas as chamadas de Agent/Task do branch de conversation vigente que podem ser associado de forma confiável a
sessões `subagent_child` já persistidas; não cria sessões placeholder nem adiciona tabelas ao banco.

A atividade de Workflow não entra nessa projeção; a estrutura de dados e as interações de Workflow existentes permanecem inalteradas.

## Autoridade e Consulta

```text
child runtime ── persist subagent_child session ── SubagentSpawned/status/stopped
                                                   │
                                                   ▼
CLI ProductProjection V4 snapshot.subagents
├─ revision
├─ childSessionIds[]（当前 branch manifest）
├─ running[]（完整、不分页）
└─ endedTotal
       │
       ├─ desktop-continuous ────────────────┐
       └─ web-remote-replayable snapshot/gap ├─ UI 纯消费
                                             └─ UI 仅用 session/subagents 查询 ended 分页详情
```

- `snapshot.subagents` da V4 é a única autoridade de estado de runtime do branch atual; a contagem do composer, o resumo de status, os itens em execução e a
  limpeza de child tabs inválidos consomem diretamente essa projeção, sem emitir outra consulta `session/subagents` para reconstruir o estado de execução.
- A UI consome de `session/subagents` apenas a paginação keyset dos detalhes já encerrados, sem participar da contagem de membros em execução nem do manifest de
  tabs; os campos antigos de running/manifest na resposta servem só para compatibilidade de protocolo e validação de cold recovery da CLI, e deixam de ser autoridade do renderer.
- Antes de `SubagentSpawned` ficar visível externamente, a child session já deve estar persistida e ser legível como
  `taskType=subagent_child`. Execução, background start e resume usam a mesma ordem, e não se permite que a projeção anuncie antes um child
  que ainda não existe, nem se auto-cura por atraso do renderer, polling ou troca de Session.
- Uma mesma submissão de projeção da CLI atualiza atomicamente `childSessionIds`, `running`, `endedTotal` e a Agent row correspondente;
  a UI não faz uma segunda concatenação entre evento e consulta. `revision` só incrementa junto com essa submissão de projeção, e deltas atrasados ou duplicados não podem reverter o estado.

- O branch ativo usa a semântica de transcript append-only `keptMessageIDs + branchCutAfterMessageID`;
  compact apenas comprime o contexto do provider, sem remover membros do diretório.
- Childs do branch antigo removidos por edit/retry saem imediatamente da projeção; fork herda as referências confiáveis de
  `childSessionId` já encerradas copiadas do transcript, mas não herda o estado de runtime da Session original.
- A associação lê preferencialmente o `childSessionId` do output/metadata da tool; para resultados de foreground concluídos, quando há apenas um
  `agentId` estável, a identidade formal `sess_subagent_{agentId}` do runtime do Agent é usada para construir o valor e então verificar novamente que a session correspondente
  realmente existe e tem `taskType=subagent_child`. Foreground em execução usa a relação `parentToolCallId -> childSessionId` do parent event log,
  e ainda precisa atingir uma tool call do branch ativo; não se adivinha por título, tempo ou posição na lista.
- Um child que já executou normalmente já foi persistido após falha em requisição de modelo, ferramenta ou cancelamento; se a falha ocorreu antes da primeira persistência,
  ou se o histórico não prova de forma confiável a associação do child, nenhum stub é exibido.
- `running` inclui foreground, background, blocked e waiting; success, failed, cancelled, lost
  pertencem uniformemente a `ended`, e cada item continua preservando o status específico.
- O cold recovery reconstrói primeiro as rows a partir do transcript persistido e então valida a associação dos membros com o fato verificado de
  `taskType=subagent_child` no session store; referências ambíguas, não persistidas ou removidas por branch cut em históricos antigos não podem entrar em
  `snapshot.subagents`. O estado de execução em recuperação é completado pelo runtime overlay, sem adivinhar por título ou tempo.
- A resposta da consulta de encerrados carrega um `revision` de consulta independente e usa cursor keyset estável, 20 itens por página, mais recentes primeiro.
  `snapshot.subagents.childSessionIds` é a lista de invalidação de tabs do branch atual, não uma segunda cópia dos dados de exibição.

## Contrato de UI

```text
mini capsule
├─ subagent-only -> 只统计 running subagent；不显示 ended；显示“{count} 运行”
└─ Bash/Subagent mixed -> 统计两类 running item；显示“{count} 运行”

expanded status panel
└─ 智能体（统一折叠分组，标题尾部显示“{count} 运行”）
   ├─ 正在运行 -> 现有运行项，可直接打开 child 详情；可控 background 项保留 Stop
   └─ 已结束 · N -> 打开或复用 Subagent 目录 tab

Subagent directory（桌面 / 普通 Web）
├─ 正在运行（不分页）
└─ 已结束 · N
   ├─ newest first
   └─ 再显示 20 个
```

- “{count} 运行” conta os membros de `snapshot.subagents.running`, expressando a quantidade de subagentes ainda em execução;
  não pode ser exibido como “{count} 后台”, porque esse conjunto também inclui foreground, background,
  blocked e waiting.
- A contagem da mini capsule, sempre que inclua subagentes em execução, também precisa usar “{count} 运行”; apenas a contagem de
  background terminal puro continua usando “{count} 后台”.
- A mini só pode desaparecer quando houver apenas encerrados e nenhum outro conteúdo de resumo como Git/plan/goal/running; não se adiciona uma
  cápsula permanente separada para o diretório.
- No expanded panel, “已结束” precisa ficar dentro do conteúdo recolhido de “智能体”, e não como dois sections de topo paralelos; sem running, mas
  com o panel presente por outro conteúdo de resumo, ainda se pode exibir o grupo “智能体” contendo apenas “已结束”.
- Os itens em execução do expanded panel usam `snapshot.subagents.running` da V4 como identidade do child e fato de exibição, mas o controle de Stop
  continua vindo de `backgroundWorks` do snapshot pai. Os dois só podem ser associados pelo exatamente mesmo `childSessionId`;
  exibe-se Stop quando houver `status=running`, `kind=subagent`, com `workId` e `cancellable !== false`,
  e continua enviando `cancelBackgroundWork(workId)`. O Stop precisa impedir o bubbling do clique nos detalhes; um child foreground sem associação
  confiável a background work não exibe um Stop de item único fabricado, e também não se adivinha por título ou tempo.
- Os itens do diretório mostram a descrição do Agent, o resumo final ou erro, tempo relativo e ícone de status; o diretório é somente leitura, sem novos
  controles de stop/cancel.
- A conclusão ao vivo é feita pela projeção V4 removendo o mesmo item de running e atualizando `endedTotal`; o diretório então mescla esse item no topo pela
  consulta ended-only, preservando as páginas já carregadas e a posição de rolagem.
- A identidade estável da tab de diretório é
  `subagent-directory:{workspaceKey}:{rootSessionId}:{parentSessionId}`; a child tab é
  `subagent-session:{workspaceKey}:{rootSessionId}:{childSessionId}`.
- Clicar em um item do diretório reutiliza a requisição unificada de abertura dos detalhes do child. Cliques repetidos no mesmo root são reutilizados; como a Session original e o root do fork
  são diferentes, cada um pode manter sua própria tab apontando para o mesmo child histórico.
- Quando edit/retry invalida um child, a tab de detalhes correspondente é fechada automaticamente, sem entrar em “recentemente fechadas”; se a tab ativa for essa, prioriza-se voltar ao diretório já aberto, caso contrário à tab visível anterior. compact não fecha tabs.
- A tab de diretório e as child tabs ficam apenas na memória do renderer e não são restauradas após refresh.

## Limites Multi-plataforma

- Desktop e Web comum oferecem o diretório com paginação.
- O `/remote` do celular não oferece diretório; as linhas de Agent/Task e Running ainda podem abrir os detalhes do child na gaveta lateral direita existente.
- O desktop continua usando `desktop-continuous` e o celular `web-remote-replayable`; os dois lados consomem o mesmo `snapshot.subagents` da V4, e a reconexão do celular continua sendo restaurada pelo snapshot/gap existente. A consulta ended-only chega ao mesmo CLI/runtime pelo attachment de host confiável atual, sem adicionar estado no relay, no main do desktop ou no Host.
- O workspace remoto percorre `workspaceIdentity` e `remoteSessionId`; a chave de identidade é sempre
  `workspaceIdentity?.trim() || workspacePath`.

## Acessibilidade, Tema e Internacionalização

- As sections e items do diretório usam títulos semânticos, button e focus visível; o estado não pode ser expresso apenas por cor.
- Usar os tokens surface/text/border/semânticos do `DESIGN.md`, compatível com Zai Light/Dark.
- Textos via locale zh-CN/en-US; títulos e resumos permitem quebra de linha ou truncamento em textos longos, sem depender do comprimento do chinês.