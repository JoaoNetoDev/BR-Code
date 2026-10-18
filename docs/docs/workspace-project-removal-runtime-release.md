# Remoção de projeto libera o Runtime do Workspace

## Contexto

O Windows considera o diretório de trabalho atual do processo e os handles de arquivo abertos como ocupação de diretório. Se, após o usuário remover o projeto na barra lateral do ZCode e sair do aplicativo, o Agent, o terminal, o file watcher ou o runtime remoto correspondentes ainda não tiverem sido liberados, o diretório do projeto pode continuar impossível de excluir ou renomear.

Outro risco de compatibilidade com o Windows são arquivos com nomes de dispositivos reservados. Nomes como `nul`, `con`, `aux`, `com1`, `lpt1` não são nomes de arquivo comuns na resolução de caminhos Win32 do Windows; assim que existe um arquivo desse tipo dentro do projeto, o usuário pode encontrar «MS-DOS 功能无效» ao excluir ou renomear depois o diretório do projeto no Explorador de Arquivos ou em comandos comuns do PowerShell.

## Problema

«Remover projeto» é uma ação do ciclo de vida do workspace, não apenas a remoção de uma entrada de UI. O comportamento antigo apenas fechava a aba e invalidava o cache de tasks:

```text
Clicar em remover projeto na barra lateral
  -> closeTab(tab.id)
  -> invalidateTaskQueryCacheByScopes(...)
```

Isso faz o projeto sumir da barra lateral, mas não garante que o Agent pré-aquecido ou o runtime daquele workspace no host sejam liberados. `useWorkspaceShellLifecycle` só recolhe, de forma best-effort, o estado pré-aquecido não utilizado quando o componente de workspace do App é desmontado, o que não cobre a entrada de remoção direta de projeto pela barra lateral.

O comportamento antigo também não avisava, antes da remoção, que ainda havia chat/runtime em execução sob aquele workspace. O usuário pode remover sem perceber uma conversa ainda em `creating`, `restoring` ou `streaming`.

## Comportamento desejado

Ao remover um projeto pela barra lateral, é obrigatório verificar primeiro se há chat/runtime em execução e então disparar a liberação do runtime do workspace:

```text
Clicar em remover projeto na barra lateral
  -> ler o estado atual de runtime das tasks do workspace
  -> se houver task em creating/restoring/streaming ou draft runtime
       -> mostrar confirmação: a remoção vai parar as conversas/Agents em execução desse projeto
       -> usuário cancela: não remover
       -> usuário confirma: continuar
  -> closeTab(tab.id)
  -> zcodeTaskService.releaseWorkspacePreparation({ workspacePath, workspaceIdentity?, provider })
       -> zcodeAgentService.disposeWorkspace(...)
       -> zcodeAgentProcessManager.disposeWorkspace(...)
       -> taskkill /T /F do Windows para limpar a árvore de processos filhos do Agent
  -> invalidateTaskQueryCacheByScopes(...)
  -> varredura assíncrona leve dos arquivos com nomes de dispositivos reservados do Windows e aviso de risco
```

Restrições:

- A verificação de chat/runtime em execução lê apenas o estado atual de UI/runtime do workspace no ZCode, sem varrer o disco, o que permite bloquear a remoção sincronamente.
- Havendo chat/runtime em execução, a remoção só pode prosseguir após confirmação do usuário.
- A liberação do runtime é best-effort e não bloqueia a remoção do projeto da UI.
- É obrigatório passar `workspaceIdentity`, evitando confundir um workspace remoto com um workspace local de mesmo caminho.
- Uma falha na liberação apenas registra log e não pode trazer de volta o projeto já removido.
- Não arquivar nem apagar o histórico de tasks; remover o projeto remove apenas a entrada e a ocupação de runtime.
- A verificação de nomes de dispositivos reservados do Windows não é um diagnóstico de falha de exclusão do sistema do usuário nem promete que o projeto certamente poderá ser excluído; ela apenas faz um aviso leve de risco para arquivos comuns de projeto que o ZCode/Agent pode alcançar.
- A verificação de nomes de dispositivos reservados do Windows é executada de forma assíncrona e não bloqueia a remoção do projeto da barra lateral.
- Por padrão, pula diretórios de alto custo e baixa relevância como `.git`, `node_modules`, `dist`, `build`, `.next`, `out`, `coverage`, `.cache`, `.turbo`, `.vite`.
- A verificação de nomes de dispositivos reservados do Windows precisa ter limite: basta encontrar os primeiros caminhos de risco para avisar, e uma falha na varredura apenas registra log.
- A fronteira realtime entre `desktop-continuous` no desktop e `web-remote-replayable` no controle remoto do celular permanece inalterada; esta correção apenas chama a API de release já existente com escopo de workspace e não adiciona comportamento de replay/snapshot.

## Regras de nomes de dispositivos reservados do Windows

A avaliação de risco é feita por segmento de caminho:

```text
Segmento de nome de arquivo
  -> remover espaços e pontos finais
  -> obter o basename antes da extensão
  -> converter para maiúsculas
  -> comparar com os nomes de dispositivos reservados
```

A primeira versão cobre:

```text
CON
PRN
AUX
NUL
COM1 ~ COM9
LPT1 ~ LPT9
```

Exemplos de arquivos de risco:

```text
nul
NUL
nul.txt
con.md
aux.log
COM1.json
LPT1.tmp
```

## Aceitação

- Após clicar em remover em um workspace local, `releaseWorkspacePreparation({ workspacePath, provider })` é chamado.
- Após clicar em remover em um workspace remoto, `releaseWorkspacePreparation({ workspacePath, workspaceIdentity, provider })` é chamado.
- Em caso de falha na liberação, o projeto ainda é removido da barra lateral e o erro é registrado pelo logger da UI.
- Quando o workspace tem task/draft runtime em execução, clicar em remover exibe primeiro uma confirmação.
- Quando o usuário cancela a confirmação, a aba não é fechada, o runtime não é liberado e o cache de tasks não é invalidado.
- Quando o usuário confirma, a aba é fechada, o runtime é liberado e o cache de tasks é invalidado.
- Quando, após a remoção, arquivos com nomes de dispositivos reservados do Windows como `nul` / `con.md` / `COM1.json` são encontrados na varredura assíncrona, um toast avisa sobre o risco.
- A varredura de nomes de dispositivos reservados do Windows pula por padrão os diretórios de alto custo, e a falha não afeta o fluxo de remoção.