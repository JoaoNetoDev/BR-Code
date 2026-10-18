# Workspace Hook Trust — Aceitação manual

> Posição atual: o Workspace Hook tem apenas dois resultados de autorização, "não confiável / confiável persistente". O
> `Allow once` das permissões comuns de ferramentas não tem relação com esta funcionalidade.

## 1. Objetivo da aceitação

- O Workspace Hook não confiável não é executado por padrão e não bloqueia a conversa normal.
- Em `Configurações → Hooks → Workspace`, a linha não confiável exibe apenas um botão "Confiar" à esquerda do interruptor de configuração, na extremidade mais à direita.
- Após o clique bem-sucedido o botão desaparece; não são exibidos badges de estado como "configuração ativada / confiável / precisa de revisão / vai executar".
- O interruptor de configuração controla apenas a ativação; o botão de confiança estabelece apenas o Trust persistente exato.
- O SessionStart ignorado não é reexecutado na próxima mensagem da task atual.
- Fechar as configurações, expirar o tempo limite ou a desconexão não estabelecem Trust; após a mudança do digest declarado o botão "Confiar" é exibido novamente.

## 2. Preparação e inicialização

Na raiz do repositório, usando Node 24:

```bash
nvm use 24
pnpm --dir apps/zcode-cli/packages/cli build:desktop-agent
node scripts/create-workspace-hook-trust-uat-fixture.mjs
```

O último comando imprime um novo workspace temporário, por exemplo:

```text
/private/tmp/zcode-workspace-hook-trust-uat-XXXXXX
```

Registre esse caminho e inicie o Desktop:

```bash
pnpm dev:desktop:test
```

O fixture contém dois Hooks SessionStart e um Hook UserPromptSubmit. A execução real apenas anexa JSON ao arquivo abaixo,
sem executar operações perigosas:

```text
<workspace>/.workspace-hook-trust-uat/executions.jsonl
```

Antes de cada rodada é possível verificar que o fixture não sofreu drift:

```bash
node scripts/create-workspace-hook-trust-uat-fixture.mjs --verify "<workspace>"
```

## 3. UAT-01: negação por padrão e entrada inline

1. No Desktop, adicione esse workspace, crie uma nova task e envie `reply with ok`.
2. Confirme que a conversa conclui normalmente e que a área de chat exibe o aviso de Workspace Hook aguardando revisão.
3. Clique no aviso para entrar em `Configurações → Hooks → Workspace`.
4. Inspecione cada Hook não confiável.

Esperado:

- O marcador de execução não existe, ou não há registro deste Hook.
- Em cada linha não confiável, a ordem na extremidade mais à direita é `Confiar` → `interruptor de configuração`.
- A página não tem painel de revisão independente nem operações em lote de Trust/Allow once/Keep blocked.
- A página não exibe badges como "configuração ativada / confiável / precisa de revisão / vai executar".

## 4. UAT-02: é possível confiar mesmo com a configuração desligada

1. Desligue o interruptor de configuração de um dos Hooks.
2. Confirme que a linha ainda exibe "Confiar".
3. Clique em "Confiar".

Esperado:

- Após o sucesso, o botão "Confiar" desaparece da linha.
- O interruptor de configuração permanece desligado; a ação de confiança não habilita o Hook por efeito colateral.
- As outras linhas não confiáveis ainda exibem seus próprios botões "Confiar".

## 5. UAT-03: confiança linha a linha e eventos futuros

1. Clique em "Confiar" em um Hook SessionStart.
2. Permaneça na task atual e envie mais um prompt.
3. Clique em "Confiar" no Hook UserPromptSubmit e envie mais um prompt.
4. Crie uma nova task, para que um novo SessionStart natural aconteça.

Verifique as evidências de execução:

```bash
test -f "<workspace>/.workspace-hook-trust-uat/executions.jsonl" \
  && tail -n 20 "<workspace>/.workspace-hook-trust-uat/executions.jsonl"
```

Esperado:

- O SessionStart ignorado anteriormente na task atual não é reexecutado por causa da confiança.
- O UserPromptSubmit já confiável pode rodar na próxima submissão natural de prompt.
- O SessionStart confiável e habilitado pode rodar no SessionStart natural de uma nova task/sessão.
- Cada confiança inline afeta apenas a própria linha; os outros botões não confiáveis não desaparecem junto.

## 6. UAT-04: persistência e mudança de digest

1. Feche e reinicie o Desktop e abra o mesmo workspace.
2. Confirme que as declarações inalteradas continuam sem exibir "Confiar" e que os Hooks habilitados rodam em eventos naturais.
3. Altere os argumentos de comando ou o matcher de um dos Hooks, salve a configuração e entre novamente no workspace atual.

Esperado:

- Reiniciar não limpa o Trust persistente.
- Declarações com mudança semântica geram um novo digest, exibem "Confiar" novamente e permanecem em fail closed.
- Declarações inalteradas continuam acertando o Trust existente.

## 7. UAT-05: sair sem decidir

1. Use um novo fixture para disparar o estado aguardando revisão.
2. Após abrir as configurações, feche a página de configurações diretamente, sem clicar em "Confiar".
3. Opcional: aguarde o tempo limite da vinculação de revisão, ou desconecte e reconecte pelo Web do celular.
4. Reentre nas configurações de Hooks.

Esperado:

- Fechar, expirar o tempo limite e a desconexão não geram nenhum registro de Trust.
- As linhas não confiáveis ainda exibem "Confiar" e o Hook continua sem executar.
- A restauração mobile replayable restaura apenas o estado autoritativo atual e não cria autorização temporária.

## 8. Relato de falha

Registre as seguintes informações:

- o commit SHA deste branch, o sistema operacional e o ponto de entrada Desktop/Web;
- o caminho do workspace e a linha específica do Hook;
- o estado real dos botões/interruptores;
- o conteúdo de `executions.jsonl`;
- o trecho de log da session correspondente em `~/.zcode/cli/log` (não anexe o conteúdo de comandos sensíveis).

O escopo da verificação automatizada está em
[`workspace-hook-trust-persistent-only.md`](../specs/workspace-hook-trust-persistent-only.md).