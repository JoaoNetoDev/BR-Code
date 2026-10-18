# Medição de altura e barra de rolagem do conteúdo inline do Gen UI

## Comportamento

O documento raiz do Gen UI oculta de forma uniforme a barra de rolagem nativa, sem reservar largura para ela. Isso atua apenas sobre `html` e `body`, não modifica as áreas de rolagem dentro dos componentes do autor nem proíbe a rolagem da página inteira com `overflow: hidden`.
Conteúdo inline comum se expande conforme a altura real do conteúdo, e a rolagem fica a cargo da sessão externa; ao atingir o limite existente de 10000px ou ao entrar em viewport ampliado, a capacidade de acesso ao conteúdo é mantida, sem novas dicas nem modos de exibição.

## Medição e propriedade

```text
mudança de tamanho do conteúdo / filhos da raiz / largura da viewport
  → guest faz merge no próximo frame de animação e lê a geometria do conteúdo (sem escrever a altura da raiz)
  → ui/notifications/size-changed já existente
  → o page owner do Gen UI atualiza a altura inline
  → layout do navegador; mudanças iguais apenas pela altura da viewport não são reportadas de novo
```

- O guest é a única fonte da medição de conteúdo; a medição automática do SDK é substituída, sem manter dois observers em paralelo.
- Excluem-se script, style e tooltip de nível raiz. Com um único nó raiz de conteúdo, combinam-se os limites dele e o scrollHeight; com múltiplos nós raiz, usa-se o limite de conteúdo mais abaixo; texto puro usa Range. O padding superior/inferior do body é contado apenas uma vez.
- O ResizeObserver observa o body e os nós raiz de conteúdo; o MutationObserver atualiza o conjunto de nós raiz observados; o resize trata as mudanças de viewport. Nós removidos cancelam a observação e, no unload da página, as observações são desconectadas e os frames pendentes cancelados.
- Com a mesma largura, quando o incremento do conteúdo é exatamente igual ao incremento da altura da viewport, não há feedback nem novo reporte, evitando que alturas em vh / porcentagem cresçam continuamente conforme o host é ajustado. No ampliado o host continua mantendo o espaço reservado do corpo, e ao recolher a medição é refeita.
- O estilo de ocultação da barra de rolagem da raiz é injetado uniformemente pela montagem do documento em sandbox, sem exigir alterações nos trechos do autor; MCP App e a exportação HTML independente não são afetados por esse estilo.

## Evidência do problema e limites

Quando se alterna de uma tag baixa para um gráfico, o guest primeiro transborda e o host em seguida aumenta a altura; mesmo com scrollHeight e clientHeight já iguais e distância de rolagem 0, a barra de rolagem da raiz ainda pode manter 15px de largura. Ocultar temporariamente e depois restaurar o overflow limpa esse estado, mas o problema reaparece na próxima troca de tag. A medição do SDK antigo define temporariamente a altura de html como max-content; a nova medição lê apenas a geometria do conteúdo, evitando que a própria medição introduza mudanças de layout.

A implementação envolve apenas a camada de apresentação do plugin-sandbox do desktop, preservando o protocolo de tamanho existente, o limite de altura do host e a lógica de ampliado. O registro atual do Gen UI exige o sandbox do desktop; não há nova via de renderização Web/celular. O reflow em tela estreita usa a mesma lógica de medição. Não há mudanças de cores de tema, textos, branches de plataforma ou fluxo de mensagens de sessão; o continuous do desktop e o replayable do celular, bem como as rotas de workspace remoto, mantêm as fronteiras originais.

## Matriz de regressão

No `node packages/desktop/scripts/gen-ui-e2e.mjs` existente são acrescentados casos reais com Electron:

| Cenário                                                    | Asserção                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Tag baixa ↔ gráfico SVG de altura fracionária, várias trocas | O contêiner aumenta/encolhe a tempo, conteúdo completo, barra de rolagem da raiz sem largura |
| Largura de desktop e tela estreita de 390px, temas claro/escuro | Medição correta após o reflow, sem overflow horizontal          |
| Adição/remoção de conteúdo aninhado, tooltip de nível raiz | Mudança de conteúdo atualiza a altura, tooltip não aumenta o corpo |
| Wheel real enviado com o mouse dentro do gráfico           | A sessão externa rola, guest scrollY permanece 0                |
| Ampliado / recolhido                                        | Mesmo guest preservado, espaço do corpo e medição após recolher corretos |
| Processo de medição da raiz                                 | Não modifica html.style.height; sem feedback contínuo de tamanho |
| Altura dependente de vh                                     | Atualização de tamanho do host não gera crescimento infinito    |
| Altura acima de 10000px                                    | O limite existente e o acesso ao conteúdo por rolagem continuam válidos, encolhe após remoção |

Os testes unitários de montagem do protocolo verificam que o estilo da barra de rolagem da raiz fica depois do conteúdo do autor e que ele não é injetado no documento MCP.