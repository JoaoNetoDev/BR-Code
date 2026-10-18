# Estilos HTML da descrição de conteúdo público

2026-09-11. Apenas amplia os atributos HTML de `description.format=html`, sem alterar a estrutura da interface, o description.style externo, o Hero ZIP, o polling ou o reporte.

```text
content do servidor -> template inerte -> filtragem de tags / mesclagem de class / validação de style -> nós React
```

O único ponto de entrada de renderização é CloudDialogDescription, sem novos estados assíncronos; compartilhado entre desktop/Web, sem modificar a comunicação continuous/replayable.

## class

Não há lista branca em tempo de execução; nomes de classe desconhecidos são preservados. O servidor tem como convenção usar Tailwind. Usa-se o `cn(标签默认类, 云端类)` existente para mesclar conflitos. Apenas o CSS já empacotado pelo App tem efeito: não se executa compilador dinâmico nem carrega CSS remoto. O `@source inline` do styles.css apenas garante que as classes utilitárias comuns do template atual sejam empacotadas de forma estável; não é usado para filtrar as classes enviadas.

Como class pode usar classes de layout/posicionamento já empacotadas, esse recurso destina-se somente a conteúdo mantido por servidores confiáveis; não se afirma que os estilos HTML são isolados com segurança. A importância e a precedência de seletores continuam seguindo o CSS.

## inline style

Em elementos não montados, a declaração completa é analisada via CSSStyleDeclaration e então filtrada por propriedade e valor, gerando React CSSProperties; declarações ilegais são descartadas individualmente. São proibidos definição arbitrária de variáveis, URL de recursos, valores escapados, !important, posicionamento/dimensão/camada/transformação/animação.

| Propriedade | Valores aceitos |
| --- | --- |
| color / background-color / text-decoration-color | cores reconhecidas pelo navegador, currentColor; correspondência exata dos tokens var(--color-foreground), foreground-subtle, foreground-subtlest, foreground-inverse, primary, primary-foreground, secondary, brand, icon-blue, success, warning, destructive, popover, surface, background, sem fallback |
| font-size | correspondência exata var(--text-ui-xl/lg/base/caption/sm/xs); nenhum tamanho de fonte arbitrário é liberado |
| font-weight / font-style | 1..1000, normal/bold/bolder/lighter; normal/italic/oblique |
| line-height | normal ou valor sem unidade de 1..3 |
| text-align | start/end/left/right/center/justify |
| white-space | normal/nowrap/pre/pre-wrap/pre-line/break-spaces |
| overflow-wrap / word-break | normal/break-word/anywhere; normal/break-all/keep-all/break-word |
| text-decoration / text-decoration-line / text-decoration-style | combinações válidas de none/underline/overline/line-through com solid/double/dotted/dashed/wavy; cor e espessura usam propriedades separadas |
| text-decoration-thickness / text-underline-offset / letter-spacing | 0..32px, 0..2rem/em ou zero com unidade; também aceitam auto/from-font ou normal (conforme a propriedade) |
| margin / padding e top/right/bottom/left | 1 a 4 comprimentos finitos não negativos, valor único 0..32px ou 0..2rem/em; rejeita porcentagem, auto, calc |

Os estilos padrão das tags seguem a implementação antiga; os inline styles permitidos sobrescrevem as classes pela precedência normal do CSS. Tags seguras, callback de host do link e o fallback para texto puro com limite de 20.000 caracteres/32 níveis permanecem inalterados; plain_text/markdown não interpreta HTML.

## Aceitação

Testar antes de implementar: exemplo completo de class do usuário, preservação de classe desconhecida, conflito entre class e estilo padrão, precedência do inline style, rejeição de valores perigosos, regressão de eventos/tags/links, estilo de link sem callback, regressão de conteúdo antigo. O E2E do App entrega HTML por HTTP isolado e verifica os estilos calculados reais e que o reporte de fechamento não mudou; tela estreita e verificação de tema claro/escuro não equivalem a testes em aparelhos reais de celular/sistemas.

Registro de verificação: 50 testes unitários em 4 arquivos aprovados; E2E do App isolado no macOS com 13 casos aprovados, run `desktop-e2e-20260911073714355-p21756-b72a79ab40f8cbad`. Novos casos verificam a data de class vinda da nuvem com peso 600/sublinhado pontilhado/sem quebra de linha, a sobrescrita por inline style, a preservação de classe desconhecida, a remoção de posicionamento perigoso, cores nos temas claro/escuro, a convergência da largura de conteúdo de 358px sem overflow horizontal e o cancel apenas no fechamento. As capturas de execução foram inspecionadas. typecheck, typecheck de E2E e verificação de arquitetura aprovados; lint com 0 erros/46 avisos já existentes. Não foram executados testes em aparelhos reais Windows/Linux/celular, entrega por servidor real nem build Web completo; não se afirma que qualquer classe Tailwind possa ser gerada dinamicamente.