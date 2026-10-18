# Mention Node Tokens

> **Estado atual**: os nós de input e a exibição das mensagens de usuário da conversation V4
> compartilham estes tokens.

`packages/ui/src/styles.css` passou a ter um conjunto de theme tokens dedicados exclusivamente ao
mention node do prompt:

- `--color-file-node`
- `--color-file-node-hover`
- `--color-file-node-foreground`
- `--color-skill-node`
- `--color-skill-node-hover`
- `--color-skill-node-foreground`
- `--color-command-node`
- `--color-command-node-hover`
- `--color-command-node-foreground`

Finalidade:

- Unificar o estilo do mention node no campo de input do prompt e o da exibição em `UserPrompt`
- Permitir que Zai Light / Zai Dark ajustem a paleta dos nodes separadamente; light / dark padrão
  são mantidos apenas como base dos tokens de fallback
- Evitar continuar escrevendo cores atômicas Tailwind `sky/violet/primary` hardcoded nos
  componentes
- O mention node é uma tag visual estruturada, não um controle clicável; tanto o campo de input
  quanto a exibição das mensagens usam `cursor-default`
- A semântica de ícone do command mention node permanece estável: `/goal` usa target, `/compact`
  usa scroll-text, slash commands comuns/customizados usam `square-slash`, e a cor continua vindo
  do command node token

## Regras de exibição do UserPrompt na V4

O `userInput.text` da conversation V4 preserva o markdown de mention original enviado ao Agent, e a
camada de exibição é responsável por restaurá-lo como tags estruturadas conforme a semântica do
antigo `UserMessage`, sem expor caminhos internos ou session id diretamente no balão do usuário:

- `[$skill](.../SKILL.md)` e o formato antigo `$skill`: ícone de varinha + nome legível do skill,
  ocultando o caminho `SKILL.md`.
- `[#标题](#sess_xxx)` e o `#sess_xxx` puro: ícone de conversa + título ou session id; o session id
  no destino do markdown não é exibido em duplicidade.
- `[文件名](path)` e links de diretório: exibem Material icon + label conforme o tipo
  arquivo/diretório, ocultando o destino do markdown.
- `@subagent`: ícone de Bot + nome do subagent.
- `/goal`, `/compact` e outros slash commands: usam respectivamente os ícones Goal, ScrollText e
  SquareSlash.
- Um `/goal` / `/target` inicial já reconhecido pela entrada de envio como comando de controle de
  goal é restaurado no balão do usuário somente leitura como a tag de mention `goal` / `target` sem
  a `/`; o command node no campo de input continua preservando a semântica original do slash
  command.

`/goal` continua sujeito ao limite de V4 command intent: a `/` só é omitida na tag de command quando a
entrada de envio reconhece o comando como comando de controle de goal; quando há anexos comuns ou
contexto oculto que fazem o prompt degradar para um prompt comum, o texto original precisa ser
preservado, sem tentar adivinhar a semântica apenas pelo prefixo de texto. A cópia e a edição inline
continuam usando o `userInput.text` original; as tags de mention afetam apenas a exibição somente
leitura.

Pontos de entrada de código:

- Definição das variáveis de tema: `packages/ui/src/styles.css`
- Reuso do estilo de mention: `packages/ui/src/mentions/mentionChip.ts`
- Ícone do command node e nós de input: `packages/ui/src/mentions/nodes/PromptMentionNode.ts`
- Exibição das mensagens de usuário da V4: `packages/ui/src/v4/ConversationRowView.tsx`

Se for preciso ajustar a cor dos nodes futuramente, prefira alterar os tokens, e não trocar
diretamente as classes atômicas nos componentes.