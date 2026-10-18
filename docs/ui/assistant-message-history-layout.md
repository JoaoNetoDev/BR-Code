# Assistant Message History Layout

> **Estado histórico**: este documento registra o esquema de DOM do `ChatMessage` antes da migração para o V4 e não é a especificação da implementação atual.
> Hoje o conteúdo do assistant é renderizado por `packages/ui/src/v4/ConversationTurnGroup.tsx` e
> `packages/ui/src/v4/ConversationRowView.tsx` a partir de projection rows/render units.

## Objetivo

Ajustar a estrutura de DOM das mensagens do assistant, para que dentro da mesma `.is-assistant` seja possível distinguir de forma estável os "fragmentos de histórico" e o "fragmento mais recente", facilitando o tratamento de estilo e de comportamento por camadas.

## Estrutura histórica

- `packages/ui/src/ChatMessage.tsx`
  - `.is-assistant` continua sendo o container raiz de uma única mensagem do assistant
  - Enquanto a task está em execução, todos os fragmentos são envolvidos uniformemente por `.history-message`
  - Depois que a task termina, apenas o último `content part` de resposta em texto simples é promovido do histórico para `.latest-message`
  - `.history-message` passa a usar um `Collapsible`
  - Durante a execução do turno atual, a área de histórico é forçadamente expandida e não recolhível, e o texto do trigger é `Working for ...`
  - Depois que o turno atual termina, a área de histórico é recolhida por padrão e pode ser expandida manualmente, e o texto do trigger é `Worked for ...`
  - A última resposta em texto simples promovida é o fragmento mais recente, posicionado depois de `.history-message`
  - `MessageChangeSummaryPanel` continua no fim do container do assistant, sem entrar em `.history-message`

## Semântica do DOM

```html
<div class="is-assistant">
  <div class="history-message">
    <button>Worked for 1m 18s ></button>
    <div>...</div>
  </div>
  <div class="latest-message">latest part</div>
  <div>change summary</div>
</div>
```

## Restrições

- `.history-message` só é renderizado quando existem fragmentos de histórico
- Uma mensagem do assistant com um único fragmento permanece como está, sem criar containers vazios adicionais
- `latest-message` carrega apenas respostas em texto simples do assistant, e não thought nem blocos de tool
- `change summary` continua pertencendo à mensagem atual do assistant, mas semanticamente é independente da divisão history/latest
- A duração de trabalho usa espaçamento de unidades natural conforme o idioma: em inglês, números e unidades ficam colados (como `Worked for 7m 30s`); em chinês, mantém-se um espaço entre número e unidade (como `已工作 7 分 30 秒`); entre múltiplos segmentos de duração usa-se uniformemente um único espaço como separador