# Todo 28：Fechamento da Precedência de Model Rule e da Canonicalização de Ordem de Provider/Model

> Estado: Concluído
>
> Data: 2026-08-27
>
> Origem: Revisão reversa da implementação após a conclusão do Todo 21/23
>
> Tarefas relacionadas: [`Todo 21`](./todo-21-zcode-builtin-config-ownership-and-model-activation-order.md)、
> [`Todo 23`](./todo-23-provider-refactor-decision-gap-closure.md)、
> [`Bugfix 02`](./bugfix-02-provider-reorder-drop-flicker.md)

## 1. Posicionamento da Tarefa

O Todo 21 já estabeleceu a sobrescrita posterior das Model Rules e a ordem de três segmentos de Provider/Model, e o Todo 23 já concluiu o Host Preview e o salvamento atômico da edição de Model. A revisão posterior à conclusão encontrou dois pontos de implementação mecânica que ainda não satisfazem por completo a semântica já decidida:

1. As Effective Model Rules ainda concatenam diretamente o array original das Personal Rules, sem garantir que as Personal Rules exatas fiquem sempre por último;
2. A canonicalização do lado de escrita de Provider/Model põe a ordem solicitada em primeiro lugar e depois acrescenta os membros esquecidos, o que é inconsistente com a semântica de três segmentos do Resolver, "Built-in não ordenado vem primeiro".

Este Todo é um bugfix de fechamento de um design já existente, e não reprojeta Rule, Overlay, Settings Preview ou a interação de arrastar e soltar.

## 2. Fronteira com os Todos mais recentes

Após a verificação não há conflito de design de produto, e a fronteira fica fixa assim:

- O Todo 23 já concluiu o Host Preview: o Host lê o `api.type/baseURL` real do Effective Provider de acordo com `providerId` e, no estado de preview, move primeiro a Personal Rule exata; este Todo apenas mantém a prova de regressão e não cria uma segunda interface de Preview;
- O Todo 25 já concluiu a aposentadoria da entrada de produto ZAPI, que não entra neste Todo;
- O Todo 26 apenas muda o Access Type/Mode da Zhipu, sem alterar a precedência das Model Rules nem a semântica de membros de ordem;
- O Todo 27 trata do visual do Model Overlay, do feedback de sucesso, do estado de Team e dos Runtime Headers, sem modificar o algoritmo de domínio deste Todo;
- O Bugfix 02 gerencia apenas a projeção otimista de curto prazo entre o soltar da operação de arrastar e a confirmação no Host View; este Todo apenas corrige a ordem autoritativa gravada no Personal Config e não cria um segundo estado Pending na UI.

## 3. Precedência das Model Rules

A única ordem de composição das Effective Model Rules é fixa como:

```text
ZCode Built-in Rules（完整保留 Built-in 内部顺序）
                       +
Personal Match Rules（保留 Personal Match 内部顺序）
                       +
Personal provider-model Rules（保留 Personal 精确 Rule 内部顺序）
```

Essa ordem é usada simultaneamente por:

- Registry/Resolver produzindo o Effective Model Config;
- Preview de novo modelo em Settings;
- Preview do Personal Model Draft em Settings;
- teste de conexão, ModelFactory e outras cadeias que consomem indiretamente o Effective Model Config.

As próprias ZCode Built-in Rules não são reordenadas; dentro do Built-in, as especializações genérica, de API, de Provider e de Endpoint continuam determinadas pela ordem do autor no arquivo Built-in. Não implemente a precedência reescrevendo a disposição física do JSON Personal; deve-se fazer um agrupamento determinístico na fronteira de domínio que compõe o array de Effective Rules.

## 4. Algoritmo Único de Ordem de Três Segmentos em Provider/Model

Para qualquer conjunto ordenado que possua membros Built-in e Personal, o resultado é fixo como:

```text
未出现在 requestedOrder 中的 Built-in 成员
                       +
requestedOrder 中仍然有效的成员
                       +
未出现在 requestedOrder 中的 Personal 成员
```

Ao mesmo tempo, respeita-se:

- Quando Built-in e Personal têm o mesmo ID, Built-in vence e existe apenas um membro;
- IDs duplicados tanto no array de membros quanto na requested order mantêm apenas a primeira ocorrência;
- IDs stale são descartados diretamente;
- O resultado é a ordem completa de todos os membros válidos atuais;
- `modelOrder` e `providerOrder` apenas ordenam: não criam membros, não habilitam membros e não alteram a atribuição de origem.

Por exemplo:

```text
Built-in = [A, B]
Personal = [P, Q]
Requested = [P, B, stale, P]

Canonical = [A, P, B, Q]
```

Para Provider, esse algoritmo atua apenas sobre os segmentos ordenáveis `standard-builtin/standard-personal`; os Family Provider Z.ai/BigModel mantêm o segmento fixo inicial e não são gravados no Personal `providerOrder`. Model não possui segmento fixo adicional.

A leitura no Resolver e a escrita no Config Service devem reutilizar a mesma função pura de domínio de Provider ou compartilhar o mesmo conjunto de vetores de teste sob teste, e não continuar mantendo dois algoritmos de aparência semelhante mas com posições de membros omitidos diferentes.

## 5. Fronteira de Escrita

A canonicalização acima precisa cobrir todas as operações de Personal Config que alteram membros ou ordem:

- Adicionar um Personal Overlay de um Built-in Provider;
- Criar um Provider somente-Personal;
- Reordenar e excluir Provider;
- Ao salvar o Provider, canonicalizar membros e ordem históricos/manuais;
- Adicionar, renomear, excluir e reordenar Personal Model;
- Atualização de membership/order no salvamento atômico do Model Draft.

Após qualquer escrita, o `providerOrder/modelOrder` físico já deve ser o resultado canônico completo, deduplicado e sem IDs stale. O lado de leitura mantém a canonicalização tolerante a falhas, para tratar escritas manuais do usuário ou estados intermediários anormais; não se cria migration nem dual-read para branches não publicados.

## 6. Princípios de Implementação

- Primeiro provar com testes que falham a prioridade de Personal Match/Exact e a diferença de escrita dos três segmentos, e só então modificar o código de produção;
- Priorizar a remoção de algoritmos duplicados, sem adicionar novos helpers só-Resolver e só-ConfigService;
- Não criar novo Rule Registry, Order DTO, objeto de conflito, Config sombra ou autoridade de ordenação no Renderer;
- Não alterar a ordem interna das Personal Match Rules nem a ordem interna das regras exatas;
- Não alterar `enabled` de Model, visibilidade de Provider, executável/selecionável, congelamento do Active Model nem a semântica de ModelSelection;
- Não afetar a fronteira de autoridade Local/Remote Host e não tocar nas cadeias Desktop continuous ou Mobile replayable.

## 7. Plano de Testes

### 7.1 Precedência de Rules

- Quando uma Personal Rule exata está antes das Match Rules no array físico, a resolução efetiva ainda resulta em Match primeiro e exata depois;
- Múltiplas Personal Match mantêm sua ordem interna original de sobrescrita;
- Múltiplas Personal Rules exatas mantêm sua ordem interna original de sobrescrita;
- O array de Built-in Rules mantém a ordem completa, e Personal ainda sobrescreve somente depois do Built-in;
- A resolução do Registry, o Preview de novo modelo e o Preview de Personal Draft obtêm resultados consistentes para a mesma entrada.

### 7.2 Canonicalização de Ordem

- Built-in não ordenado fica antes da requested order, e Personal não ordenado fica depois;
- IDs stale/duplicados na requested order são removidos;
- Quando Built-in e Personal têm o mesmo ID, apenas a posição do Built-in é mantida;
- Provider e Model usam o mesmo conjunto de semântica dos três segmentos;
- Após adicionar, renomear, excluir, arrastar e salvar o Model Draft, a ordem canônica completa é persistida;
- Quando o salvamento falha, o Pending de UI do Bugfix 02 sofre rollback e não é quebrado pelo algoritmo de domínio deste Todo.

### 7.3 Regressão de Autoridade

- `baseURLMatch` continua acertando corretamente no Host Preview;
- Um Provider com API incompleta retorna um issue de validation real, e o Renderer não adivinha `anthropic-messages`;
- O Preview não modifica o Personal Config, a ordem nem a revision do Registry.

## 8. Critérios de Conclusão

- As Effective Rules respeitam `Built-in + Personal Match + Personal provider-model` em todas as faces de resolução;
- Resolver e Config Service não possuem mais dois helpers de ordem com semânticas diferentes;
- Todas as fronteiras de escrita de ordem produzem a ordem canônica completa, deduplicada e sem IDs stale;
- A fronteira de Host Preview concluída no Todo 23 permanece inalterada;
- Atualizar simultaneamente `configuration.md`, a visão geral do sistema de configuração e o Feature Graph relacionado, sem continuar afirmando que a canonicalização de escrita está concluída enquanto o código ainda usa outro conjunto de algoritmos;
- Os testes unitários direcionados de Provider, `pnpm typecheck`, `pnpm lint`, a verificação de formatação dos arquivos modificados e `git diff --check` passam;
- Ao final, é submetido um Conventional Commit.

## 9. Resultado da Implementação

- `ModelConfigRules.composeEffective()` tornou-se a única fronteira de composição de Effective Rules para o Resolver e os dois Previews de Settings, e o JSON Personal físico não altera mais a prioridade Match/exata;
- `resolveOwnedOrder()` atende simultaneamente a leitura no Resolver e a canonicalização de escrita de Provider/Model, removendo o algoritmo duplicado requested-first do lado de escrita; os Family Provider continuam fora do segmento fixo;
- Foram adicionados testes de regressão de Personal Rule exata fisicamente antecipada, de escrita dos três segmentos de Provider e de consistência Facade/Registry;
- 155 testes de `@zcode/provider`, typecheck, lint e `git diff --check` passaram.