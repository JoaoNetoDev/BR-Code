# Limite de identidade entre caminho de workspace local e recuperação a frio

## Status

- Tipo: especificação de correção de bug
- Superfície afetada: workspace local do desktop, persistência de session do CLI, recuperação a frio de conversation do V4
- Não altera: a identidade do workspace remoto, nem as semânticas de entrega de `desktop-continuous` no desktop e `web-remote-replayable` no celular

## Problema

O workspace local permite não passar `workspaceIdentity`, e a chave de identidade é obtida pelas regras já existentes:

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
```

O `workspacePath` que o usuário obtém pelo seletor de diretórios pode manter a `/` final. Esse valor é usado no estado de identidade do workspace, como provider registry, tab e task index; ao criar o runtime, o CLI obtém novamente por `path.resolve` um diretório de execução sem a `/` final e grava o diretório de execução de volta no `path` / `directory` da session. Após reiniciar o CLI, a recuperação a frio do V4 reconstrói a referência do workspace apenas com base no caminho da session, de modo que o mesmo diretório local aparece com duas chaves exatas:

```text
当前 attachment / provider registry   /home/user/project/
session 冷恢复路径                    /home/user/project
```

Não se trata de um problema na etapa de busca do provider catalog, mas sim de a informação de identidade do workspace ser sobrescrita pelo caminho de execução no limite entre runtime e persistência.

## Limites semânticos

`workspacePath` e `workingDirectory` precisam ser armazenados separadamente:

```text
目录选择器 / 当前 attachment
  workspacePath: /home/user/project/
             |
             +--> workspaceKey / provider registry / task index
             |
             +--> AgentRuntimeConfig.workspacePath
                        |
                        +--> session.path + session.directory（身份恢复）

执行链路
  workspacePath: /home/user/project/
             |
             +--> path.resolve(...)
                        |
                        +--> workingDirectory: /home/user/project（cwd / 文件 / Git）
```

- `workspacePath`: preserva a representação real do caminho passado pelo chamador, usada na recuperação da identidade do workspace local.
- `workingDirectory`: pode ser normalizado e é usado apenas para semânticas de execução como cwd de comandos, leitura/escrita de arquivos e Git.
- Não normalizar `workspaceKey` globalmente, para evitar quebrar ou migrar chaves persistidas existentes, como tab, task index e provider registry.

## Recuperação a frio do V4

O subscribe de conversation já está dentro de um attachment de workspace confiável, então é preciso passar a referência `workspace` atual para a recuperação a frio:

```text
desktop / web attachment
  -> v4/conversation/subscribe { sessionId, workspace }
  -> ColdSessionResumeCoordinator
  -> activateSessionForResume({ sessionId, workspace })
  -> provider registry 按当前 workspaceKey 命中
```

Prioridade:

1. o `workspace` carregado pelo subscribe atual;
2. o `path` / `directory` da session já persistida, apenas quando o chamador não tem contexto de workspace.

Assim é possível corrigir tanto a informação persistida de novas sessions quanto recuperar imediatamente as sessions históricas que versões antigas já gravaram sem a `/` final.

## Cenários de aceitação

1. Quando o caminho do workspace local tem `/` final, a nova session mantém esse caminho na persistência e o cwd do runtime continua sendo o caminho normalizado.
2. Quando a session histórica está registrada sem a `/` final e o attachment atual tem a `/` final, a recuperação a frio usa o workspace do attachment, o provider model fica disponível e é possível continuar enviando mensagens.
3. Chamadas compatíveis sem contexto de workspace atual ainda conseguem restaurar a partir do caminho persistido na session.
4. O workspace remoto continua carregando por completo `workspaceIdentity` e `remoteSessionId`, sem isolamento isolado por `workspacePath`.
5. O continuous do desktop e o replayable do celular apenas compartilham o repasse da referência de workspace, sem alterar os limites de snapshot, gap, queue ou entrega de mensagens.