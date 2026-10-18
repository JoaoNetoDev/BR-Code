# Pré-verificação segura de undo de arquivos no summary

## Contexto

O botão de alterações de arquivos no summary de uma mensagem serve para desfazer as modificações de arquivo
desta rodada. O fluxo antigo chamava diretamente o workspace rewind e dependia apenas da escrita de volta do
`beforeContent` do checkpoint, sem conseguir confirmar se o arquivo já havia sido alterado por outro processo
no momento do clique. Quando o mesmo arquivo é modificado consecutivamente por várias tools na mesma rodada,
também é preciso reproduzir os checkpoints em ordem inversa, na ordem de criação, e não apenas usar o diff
agregado final para uma única escrita de volta.

## Objetivos

- Ao clicar no botão de undo de arquivos do summary, exibir primeiro um diálogo de confirmação.
- O diálogo mostra, por arquivo, quais arquivos podem ser desfeitos com segurança e quais não podem.
- Modificações de arquivo geradas por ferramentas bash/shell não participam do undo de arquivos do summary nem
  aparecem na lista de arquivos desfezíveis.
- Quando um arquivo é modificado por várias tools não-bash, o undo deve ser reproduzido checkpoint por
  checkpoint, em ordem inversa.
- Antes de aplicar o undo, é preciso refazer a pré-verificação; se existir qualquer arquivo unsafe, nada é
  escrito nesta rodada.
- Desktop e o controle remoto do celular reutilizam o session host atual, sem criar runtime independente.

## Não objetivos

- Não implementar “reaplicar”. O artifact de checkpoint atual guarda de forma confiável apenas o conteúdo
  anterior à mudança, e não o conteúdo posterior.
- Não fazer undo parcial. O P0 adota all-or-nothing: havendo arquivos unsafe, o botão de confirmação é
  desabilitado.
- Não inferir o conteúdo da escrita de volta a partir de `fileChanges.snapshots` da UI ou do tool result; a
  pré-verificação e a escrita de volta reais são feitas pelo agent runtime.

## Boundaries da combinação do reset com editUserQuery

- O `applyFileRewind` do summary permanece workspace-only; ele pode exibir arquivos shell ignorados e desfazer
  os demais arquivos seguros.
- O `editUserQuery(workspaceMode=rewind)` da edição inline exige o rollback completo da rodada alvo: unsafe,
  shell ignorado, unsupported ou sem checkpoint seguro retornam um blocked estruturado, sem escrever arquivos,
  sem recortar a conversa e sem enviar requisição ao modelo.
- O modo combinado precisa refazer a pré-verificação, escrever os arquivos e efetivar o branch cut dentro do
  mesmo Agent command; a UI não pode encadear dois comandos CAS.
- A escrita de múltiplos arquivos usa um journal de compensação; quando branch/admission falha antes do ponto de
  commit, o conteúdo dos arquivos anterior ao comando e o antigo branch metadata são restaurados.

## Protocolo

Dois novos métodos de sessão do ZCode Protocol:

- `session/previewFileRewind`
- `session/applyFileRewind`

Os parâmetros reutilizam o target de histórico da sessão:

```ts
{
  sessionId: string;
  target: ZCodeSessionHistoryTarget;
  expectedRevision?: number;
}
```

O preview retorna resultados por arquivo:

```ts
{
  sessionId: string;
  target: ZCodeSessionHistoryTarget;
  canApply: boolean;
  safeFiles: Array<{
    path: string;
    action: "restore" | "delete";
    operationCount: number;
    toolNames: string[];
  }>;
  unsafeFiles: Array<{
    path: string;
    reason:
      | "external_modified"
      | "checkpoint_missing"
      | "checkpoint_unreadable"
      | "unsupported_checkpoint"
      | "file_read_failed";
    operationCount: number;
    toolNames: string[];
  }>;
  ignoredFiles: Array<{
    path: string;
    reason: "bash_ignored";
    operationCount: number;
    toolNames: string[];
  }>;
}
```

`applyFileRewind` retorna o preview refeito após a nova pré-verificação, se foi applied e o snapshot após a
aplicação.

## Algoritmo do Runtime

1. Localizar o owner do checkpoint com base no target. O checkpoint tem como owner a user message da rodada; quando
   a UI passa a assistant message, a camada de protocolo normaliza primeiro para a user message pai e, como
   fallback, casa com o raw assistant step sob o mesmo pai. O target `turn` também é resolvido para a user
   message da rodada correspondente.
2. Ler os checkpoints workspace/both desse owner. Se a rodada tiver vários checkpoints, todos são mantidos na
   ordem de criação.
3. Ler todos os artifacts de checkpoint; checkpoints cuja leitura falhou marcam os arquivos envolvidos como
   unsafe.
4. Ignorar artifacts de bash/shell/terminal.
5. Para os artifacts não-bash, construir a sequência de operações e verificá-la na ordem inversa da criação dos
   checkpoints.
6. O conteúdo atual de cada arquivo precisa ser igual ao conteúdo after daquele checkpoint para que a escrita de
   volta do conteúdo before seja permitida. O conteúdo after vem preferencialmente de campos explícitos do
   artifact; artifacts antigos podem ser reconstruídos a partir de `beforeContent + structuredPatch`.
7. A fase de pré-verificação apenas simula a escrita de volta, sem alterar o disco. A fase de apply reexecuta a
   mesma pré-verificação; com `canApply=false`, nenhum arquivo é escrito.
8. A escrita de volta do apply também é executada passo a passo na ordem inversa dos checkpoints, garantindo que,
   quando várias tools modificam o mesmo arquivo, ele volte ao estado anterior ao início da rodada.

## Comportamento da UI

- O botão no header do summary serve apenas para abrir o diálogo.
- O diálogo exibe os arquivos que podem ser desfeitos; o bloco de arquivos que não podem ser desfeitos com
  segurança só aparece quando existem arquivos unsafe. Cada linha de arquivo mostra o caminho, a ação e o
  número de tools/operações envolvidas.
- Havendo arquivos unsafe, o botão de confirmação é desabilitado e informa que esses arquivos precisam ser
  tratados manualmente antes.
- Após um apply bem-sucedido, o snapshot da sessão é atualizado e o `fileState` do summary passa para `reverted`.

## Boundaries do Controle Remoto

Essa capacidade é um session command e não altera a semântica de transporte realtime de task. O desktop continua
com o fluxo principal `desktop-continuous`; o controle remoto do celular chama o mesmo session host por shared-host
attachment e restaura a UI pelo snapshot replayable, sem espalhar a lógica de restauração de estado replayable
para o desktop.