# Todo 46: continuidade visual na reordenação de modelos e unificação das bordas da lista

> Status: concluído
>
> Data:2026-08-28
>
> Origem: experiência manual na página de configurações de Provider no macOS

## 1. Problema

Na página de configurações de Provider, ao arrastar um modelo e soltar, a linha do modelo volta brevemente à posição antiga e depois salta para a posição de destino. A ordem final costuma ser salva, o que indica que o cálculo e a persistência de `modelOrder` não se perdem; o problema ocorre entre o transform temporário do `dnd-kit` ao final e a confirmação de uma nova revision pela Settings View oficial.

Ao mesmo tempo, a base da lista de modelos apresenta uma borda mais grossa que o divisor entre as linhas. Esse visual não faz parte do design do produto: a lista deve ter apenas uma moldura externa de camada única, e entre os modelos deve existir apenas um divisor.

Após discussão, a cápsula de ativação no título do Provider foi mantida como está. Este Todo não a transforma em Switch: a semântica de interação de um Personal Provider editável e de um estado somente leitura determinado pelo Account Overlay não é exatamente a mesma, e a apresentação atual, que unifica estado e ação, continua válida.

## 2. Causa raiz

Atualmente a reordenação de modelos executa `setModels(next)` uma única vez de forma síncrona dentro de `InlineEditableProviderCard`, mas não mantém, como a reordenação de Providers, a ordem mais recente do usuário como pending intent até a confirmação da Settings View oficial:

```text
Pointer Up
    |
    +--> dnd-kit 清除 transform
    |
    +--> 本地 setModels(next)
    |
    +--> Config 写入 / Registry refresh
    |
    `--> provider prop 更新时无条件 setModels(authoritativeModels)
```

Portanto, uma única atualização de state local não é suficiente para cobrir a janela de confirmação assíncrona, a reprojeção da View antiga e arrastos consecutivos. O Bugfix 02 chegou a supor que o `setModels(next)` de Model já era suficiente, mas naquela época essa conclusão não foi verificada com salvamento atrasado controlado e reprojeção por uma View antiga do upstream.

O estilo da lista, por sua vez, colocava a moldura externa e o `divide-y` juntos no contêiner pai, que contém a subárvore de runtime do DnD. Independentemente de como o navegador projete o DOM auxiliar do DnD, a responsabilidade pelas bordas não está explícita o bastante; a última linha de modelo visível não deveria depender de “o último DOM child” para decidir se desenha o divisor.

## 3. Design alvo

A reordenação de modelos e de Providers reutiliza o mesmo conjunto de semânticas de pending da UI:

```text
Authoritative modelOrder -----------------------+
                                                 |
Drag End --> Pending Model Reorder --------------+--> Rendered Model Order
                    |
                    +--> Settings View 对齐 --> 清除 Pending
                    `--> 保存失败 -----------> 回滚 Authoritative
```

- Personal Config e a Settings View continuam sendo a autoridade de persistência e leitura oficial;
- o pending existe apenas na página de configurações atual e não entra em Config, Registry, Selection ou Runtime;
- quando o upstream envia uma Provider View com os mesmos membros, mas em ordem antiga, o pending não é sobrescrito;
- em caso de mudança de membros, troca de Provider/Environment ou falha de salvamento, o pending é encerrado com segurança;
- arrastos consecutivos são salvos na ordem de interação, e um resultado antigo de conclusão não pode sobrescrever a ordem mais recente;
- edição, ativação/desativação e exclusão de modelos continuam localizadas por Model ID estável, sem depender do índice exibido, que pode mudar.

As bordas da lista passam a ter uma estrutura explícita:

```text
List container  -> 单层 rounded outer border
Model row       -> 单层 bottom divider
Last model row  -> no bottom divider
```

## 4. Implementação

1. Primeiro adicionar testes que falham, cobrindo a chegada de um array authoritative antigo durante o período pending mantendo a ordem de destino.
2. Fazer a reordenação de Model reutilizar `useOptimisticReorder` e projetar os modelos visíveis por `renderedIds`.
3. Fazer os callbacks de edição, ativação e exclusão da linha de Model usarem o Model ID, e não o índice exibido.
4. Remover os ramos de rollback escritos à mão `previous/next/setModels` que existiam na reordenação de Model, evitando dois mecanismos de pending.
5. Manter uma única camada de border na moldura da lista; a separação entre linhas passa a ser um `border-b` explícito, desativado na última linha.
6. Adicionar um E2E de Desktop observando que, após arrastar um modelo, a ordem antiga não aparece entre a soltura e a confirmação do salvamento.

## 5. Verificação

- Testes unitários de UI: atraso controlado, reprojeção por View antiga, rollback em caso de falha, reordenações consecutivas, mudança de membros;
- E2E das configurações de Provider: após um pointer drag real, a ordem do DOM não pisca de volta;
- Testes de estrutura de bordas: uma moldura externa, sem divider na última linha;
- `@zcode/ui`: `typecheck` e testes direcionados;
- E2E de Desktop: `typecheck`;
- Na raiz: `pnpm typecheck`, `pnpm lint`, verificação de formatação e `git diff --check`.

## 6. Resultado da implementação

- A reordenação de Model passou a reutilizar o `useOptimisticReorder` já existente na reordenação de Provider, e a View antiga de Settings já não sobrescreve a ordem de destino que o usuário acabou de soltar antes do alinhamento com a revision oficial; falha de salvamento, mudança de membros e troca de Provider/Environment continuam encerrando o pending.
- Edição, ativação/desativação e exclusão de Model passaram a ser localizadas pelo `modelId` estável, evitando que a variação do índice exibido durante a reordenação faça a ação cair no modelo errado.
- A lista de Models removeu o `divide-y` do contêiner pai; cada linha passa a ter seu divisor explícito e a última linha não desenha divisor inferior; a moldura externa permanece de camada única.
- A cápsula de ativação do Provider permanece inalterada.
- Novo E2E de Desktop `MP-UI-03`, usando pointer drag real e registrando a ordem do DOM, impede que a ordem de destino pisque de volta para a antiga depois de aparecer.

Resultados da verificação (2026-08-28):

- `pnpm exec vitest run packages/ui/test/modelProviderModelRowEditor.test.ts packages/ui/test/useOptimisticReorder.test.ts`:
  43 casos passaram;
- `pnpm exec tsc -p packages/ui/tsconfig.json --noEmit`:passou;
- `pnpm --filter @zcode/desktop typecheck: e2e`:passou;
- `pnpm typecheck`:passou;
- `pnpm lint`:0 error,33 warnings existentes;
- Os arquivos modificados passaram por `oxfmt --write` e `git diff --check` passou; o `pnpm fmt: check` de todo o repositório continua bloqueado pelos problemas de parsing já existentes do HTML fiddle do Electron upstream e de `apps/zcode-cli/tests/gb2312.js`;
- O E2E de Desktop concluiu a build de produção, mas o host Linux atual não tem `xvfb-run`, e o Chromedriver não conseguiu criar sessão por ausência de Display antes mesmo de o código de teste rodar; o caso em si já passou pela validação TypeScript do E2E e aguarda execução em ambiente com gráfico.