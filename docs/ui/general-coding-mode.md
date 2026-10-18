# Modo Geral e Modo de Programação (M1)

## Objetivo e escopo

O Modo Geral reduz as informações técnicas em tarefas que não são de programação; o Modo de Programação mantém a entrada completa de desenvolvimento. Esta etapa altera apenas a exibição e as entradas, sem mudar modelos, system prompts, permissões de ferramentas, capacidade de execução do Agent ou dados históricos. A exibição de artefatos e o estilo de resposta do M2, e o gerenciador de arquivos do M3, não estão no escopo desta vez.

Abrir o conteúdo do arquivo ao clicar em um nome de arquivo não está no escopo desta vez: quando o nome do arquivo carrega um patch, ele ainda abre o Diff de arquivo único; caso contrário, abre o arquivo. Não é a aba «Revisar» do workspace. Não escreva a entrada oculta de criação de revisão como se ela desabilitasse todos os Diffs.

## Comportamento do produto

As opções de alternância na página de configurações e no menu do avatar são ordenadas uniformemente como «Modo de Programação → Modo Geral»; sem preferência salva, o padrão é o Modo de Programação, e a escolha já feita por usuários existentes é preservada.

| Cenário                        | Modo Geral                                                                                  | Modo de Programação                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| Execução de comandos, grupo de execução | mantém resumo e status em execução/falha; oculta comando, saída, expansão e tooltip de erro original | exibe e expande os detalhes conforme as regras originais |
| Edição de arquivos, grupo de modificação | mantém o resumo do arquivo e a entrada do arquivo; oculta expansão, Diff inline e contagem de linhas adicionadas/removidas | mantém os detalhes da modificação |
| Estado da conversa, mudança de rodada | oculta a área de ambiente Git e o resumo de mudanças da rodada | mantém as informações de Git e de mudanças |
| Pensamento                     | mantém o conteúdo bruto do pensamento, incluindo blocos de código; mantém o comportamento original de colapso e expansão | mantém o texto de exibição original |
| Código na resposta final        | quebras de linha fixas, oculta o toggle de quebra de linha, mantém a cópia                   | respeita e mantém a preferência original de quebra de linha do usuário |
| Compressão automática de contexto | usa a formulação «Otimizar conversa»                                                       | mantém a formulação de compressão de contexto |
| Formas de abertura externa na barra superior | apenas o gerenciador de arquivos                                                  | editores instalados, terminal e gerenciador de arquivos |
| Revisão, criação de terminal    | oculta o cartão de inicialização, o menu de adicionar, o painel de comandos e as entradas relacionadas em «Fechados recentemente»; oculta o botão de criação de terminal na parte inferior | mantém as entradas originais |
| Painéis já abertos              | revisão, abas de terminal e o terminal na parte inferior continuam sendo exibidos, alternados, usados e fechados; a aba ativa atual não muda | igual à esquerda |

O filtro de modo das formas de abertura externa cobre apenas o botão «Abrir» da barra superior e respeita as limitações de disponibilidade já existentes de SSH/WSL/Docker. A mudança de modo não sobrescreve a preferência salva de aplicativo externo. O menu de contexto dos links de arquivo na resposta e o menu de contexto da árvore de arquivos da barra lateral mantêm a lista completa de aplicativos externos disponíveis, sem filtro por Modo Geral/Programação.

Outras ferramentas como Read/Search/Browser/MCP não foram simplificadas de forma unificada. A formulação da compressão manual permanece como era. Trocar de modo não apaga nem reescreve os resultados originais das ferramentas, os textos de pensamento ou a configuração de quebra de linha do código.

## Propriedade do estado e migração

```text
Página de configurações / menu do avatar
    -> ZCodeStore.setInterfaceMode
        -> localStorage: zcode-interface-mode
        -> broadcast state:interfaceMode -> setters das outras janelas (eco suprimido)
        -> exibição / entradas de criação da UI compartilhada

useAppPanels / taskSidePaneMemory -> abas abertas, item selecionado, estado de colapso (o modo não reescreve)
Terminal / TerminalSession      -> sessões de terminal, PTY (o modo não fecha)
CLI/runtime -> eventos originais e estado das tasks (o modo não participa)
```

- Os valores são `general` / `coding`. Valor não definido ou desconhecido tem padrão `coding`; o antigo `concise` é migrado para `general` e o antigo `professional` é normalizado para `coding`.
- Desktop e Web compartilham a UI; a preferência do Desktop é sincronizada pelo broadcast existente, e o Web pode usar o broadcast no-op existente. Nenhuma nova preferência de servidor ou configuração de task será introduzida.
- A identidade do workspace continua usando `workspaceIdentity?.trim() || workspacePath`. A troca de modo não altera conexão remota, owner nem escopo de task.
- As cadeias Desktop continuous e Web replayable do celular mantêm as fronteiras originais, sem novas mensagens de recuperação nem estado de runtime.
- O serviço de configurações da instância Dev independente segue o `ZCODE_DESKTOP_HOME_DIR` explícito; quando não definido, mantém o fallback HOME / USERPROFILE / homedir, evitando que operações de aparência sejam escritas em outra instância.

## Cobertura antes do commit

Os casos de aceitação e o status de cobertura estão em [Verificação do Modo Geral/Programação](../testing/general-coding-mode-verification.md). Atualmente apenas as verificações realmente executadas são declaradas; um E2E pending não significa entrada no CI ou na Docker suite.