# Todo 77: unificação de estilo do controle de nível de raciocínio

> Atualização da atribuição de verificação (2026-09-09): as pendências de teste, falhas e promoções manuais restantes neste documento foram transferidas para [Todo102](todo-102-verification-debt-closeout.md), e o cronograma de verificação independente neste documento é encerrado; as evidências históricas são mantidas, e a transferência não significa que os testes passaram.

> As pendências posteriores de E2E gráfico do Desktop são consolidadas pelo Todo 78; este Todo não faz mais cronograma próprio.

> Correção da decisão de 2026-09-07: a frase abaixo "não criar um novo container externo de Reasoning" não representa o requisito de produto mais recente. Já havia sido decidido criar os containers com título "推理设置" e "高级设置", e a correção dessa omissão é executada por Todo 88 / R13; os requisitos de tamanho de controle e centralização deste Todo continuam válidos.

> Status: concluído (testes unitários de UI, verificação de tipos e lint passaram; E2E gráfico do desktop aguardando nova execução em ambiente Mac)
>
> Data: 2026-09-04
>
> Relação: fechamento visual de baixo escopo do UI polish da página de modelos do Todo 75.

## Problema

As opções de capacidade do modelo usam o estilo `outline + lg` do `Button` compartilhado; os níveis de raciocínio, por sua vez, são compostos por um `div` customizado e um `button` nativo. Hoje a altura, o raio de canto, o fundo e as regras de alinhamento de texto dos dois são diferentes:

```text
模型能力选项：h-8 / rounded-lg / 共享 Outline / 居中布局
推理档位：    h-7 / rounded-md / bg-surface / 原生按钮默认排版
```

Isso não é causado por um container externo. O próprio nível de raciocínio não reaproveita as regras de tamanho e alinhamento do botão compartilhado, e por isso parece menor e com cor diferente no mesmo diálogo de edição de modelo; no estado não editável o texto também não tem uma centralização horizontal e vertical explícita.

## Objetivo

- Os níveis de raciocínio usam altura, raio de canto, borda padrão e nível de fundo consistentes com as opções de capacidade do modelo;
- o texto dos níveis no estado não editável é explicitamente centralizado na horizontal e na vertical;
- não há salto de altura ao alternar entre estado editável, estado estático e o botão de adicionar;
- preservar a semântica de arraste, clique para editar, exclusão, operação por teclado, ordem e borda de Personal Override dos níveis de raciocínio;
- não transformar os níveis de raciocínio em checkbox, nem mudar valores, Mapping, salvamento ou comportamento de runtime de Reasoning.

## Fronteiras de Implementação

1. Priorizar o reaproveitamento das regras de tamanho e cor do `Button` compartilhado, evitando duplicar um segundo sistema de botões no Reasoning Editor.
2. Os níveis de raciocínio ainda podem exibir o botão de exclusão no hover dentro do mesmo container; se não for possível usar o `Button` completo, extrair ou reaproveitar apenas o `buttonVariants` necessário, sem mudar a responsabilidade de interação do DOM.
3. Botões de texto estático usam `inline-flex items-center justify-center`; o input de edição mantém a mesma altura e se estica conforme o conteúdo dentro das larguras mínima/máxima já existentes.
4. O botão de adicionar tem a mesma altura do container dos níveis; os estados Focus, Hover, arraste e disabled continuam usando as cores semânticas do design system.
5. Não criar um novo container externo de Reasoning, nem ajustar o layout de Mapping, MFJS ou Footer.

## Verificação

- Completar ou atualizar primeiro os testes unitários de `ProviderModelReasoningLevelEditor`, cobrindo centralização estática, tamanho unificado, tamanho no estado de edição e interação do botão de exclusão.
- Atualizar o E2E de UI da página de modelos validando apenas a estrutura visível, a consistência das dimensões reais e o comportamento de edição/arraste, sem amarrar a nomes de classes internas desnecessários.
- Validar em chinês/inglês, escuro/claro e em janela estreita.
- Executar os testes unitários de UI relacionados, `pnpm typecheck`, `pnpm lint`; o E2E gráfico do desktop é executado novamente em ambiente Mac.