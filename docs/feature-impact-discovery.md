# Descoberta de Impacto de Funcionalidade (Feature Impact Discovery)

## Status

- Este documento é a especificação factual que o `feature-boundary-planner` usa para executar varredura de funcionalidades e análise de impacto antes da implementação.
- Este documento descreve o método de análise e o contrato de saída, sem modificar o comportamento de runtime do produto.
- O grafo semântico de funcionalidades está em `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`; os fatos de código seguem o workspace atual e o índice codegraph.

## Objetivo

Quando o desenvolvedor se prepara para modificar uma funcionalidade, responder às seguintes
perguntas antes de ler muita implementação ou começar a codificar:

1. Em quais entradas de UI, processos de background e modos de execução essa capacidade aparece?
2. Quais entradas compartilham componentes, fontes de opções ou serviços, e quais são apenas
   semelhantes em nome ou campo?
3. Onde ficam, para cada entrada, o estado de rascunho, os defaults, a validação, a ação de commit e
   a posse do estado final?
4. Após a modificação, quais funcionalidades vizinhas, limites de protocolo, caminhos de
   persistência, cadeias de recuperação e testes precisam ser observados?
5. Quais relações vêm da semântica de produto estável e quais são apenas evidência de alcançabilidade do código estático?

O produto final é um **Impact Brief** pesquisável. Só se expande para o produto cartesiano de
estados e a poda de casos quando for preciso definir comportamento de produto ou planejar testes.

## Modelo de grafo em duas camadas

Depender apenas do grafo de chamadas estático espalha funções utilitárias, componentes genéricos e
código auxiliar de teste por todo o resultado; manter apenas documentação manual escrita deixa o
material easily desatualizado conforme a implementação evolui. Por isso a varredura de
funcionalidades usa duas camadas de evidência:

```text
Intenção de mudança do desenvolvedor
        |
        v
Grafo semântico de funcionalidades (capacidades, entradas de UI, posse de estado, efeitos colaterais de commit, invariantes)
        |
        v
UI Surface Matrix (rastreamento de comportamento por entrada)
        |
        v
codegraph (chamadores atuais, caminhos de implementação, testes e drift do grafo)
        |
        v
Impact Brief (impacto classificado, evidências, itens a confirmar)
        |
        +----> Opcional: matriz de limites, poda de casos, passagem para E2E
```

### Grafo semântico de funcionalidades

O grafo semântico de funcionalidades mantém as relações no nível de produto, e seus nós contêm ao
menos os seguintes tipos:

- `capability`: capacidade que usuário ou desenvolvedor consegue descrever, por exemplo seleção de modelo, tarefa de automação, Subagent.
- `ui-surface`: entrada onde a capacidade realmente aparece, por exemplo barra de ferramentas da conversa, página de edição de automação.
- `shared-ui`: componente, construtor de opções ou hook reutilizado por várias entradas.
- `state-owner`: dono do rascunho, do estado de execução, do default ou da projeção autoritativa.
- `service`: limite de serviço para comandos de commit, validação ou origem de dados.
- `persistence`: ponto de persistência em banco de dados, arquivo de configuração ou Markdown.
- `delivery-boundary`: limites de entrega como desktop contínuo, mobile replayable, workspace remoto.
- `evidence`: testes, specs ou outras evidências verificáveis.

As arestas semânticas usam verbos dirigidos, por exemplo:

- `renders-in`、`shares-component`、`options-from`
- `owns-draft`、`inherits-from`、`validates-with`
- `commits-to`、`persists-to`、`projects-to`、`recovers-via`
- `covered-by`、`must-not-mutate`、`must-remain-isolated-from`

O grafo guarda apenas semântica de alto valor e pontos de partida do codegraph; ele não tenta
copiar o grafo completo de chamadas de código.

### Como os resultados da varredura são consolidados

Cada varredura deve listar separadamente as diferenças entre o "grafo atual" e os "fatos de código
atuais":

- Quando o pedido é apenas varrer, explicar ou diagnosticar, entregar o graph delta sugerido no Impact Brief, sem modificar o grafo diretamente.
- Ao entrar em planejamento de funcionalidade ou passagem para implementação, confirmar primeiro a semântica de produto e depois escrever de volta no grafo semântico as capabilities, UI surfaces, owners, commit sinks, invariantes e code seeds confirmados.
- Uma surface representa um conjunto independente de cenário de usuário e semântica de estado/commit; vários pontos de chamada de componentes dentro da mesma interface podem ser vários code seeds da mesma surface.
- Manter os IDs de nó estáveis. Ao renomear textos de produto, preferir adicionar alias para não quebrar buscas históricas.
- Escrever no grafo apenas relações de produto confirmadas; alcançabilidade puramente estática, dependências de teste e novos chamadores ainda não explicados permanecem como drift/evidence.

Assim, desenvolvedores posteriores conseguem tanto pesquisar as relações de produto confirmadas quanto
descobrir, pelo codegraph, as partes em que o grafo ficou atrás da implementação.

### Fatos de código do codegraph

O codegraph serve para validar a implementação atual, e não para substituir a semântica de produto:

- Começar a exploração pelas seeds de symbol/file declaradas no grafo semântico.
- Procurar os chamadores diretos de componentes, construtores, hooks, stores e métodos de serviço compartilhados.
- A partir de cada entrada de UI, rastrear "estado local -> default/herança -> validação -> ação de commit -> estado autoritativo ou persistência".
- Expandir por padrão 2 níveis; só ir a 3 níveis quando uma atribuição-chave ainda estiver incerta.
- `affected tests` serve apenas como evidência e não prova diretamente dependência de funcionalidade de produto.
- Quando os chamadores atuais divergirem do grafo semântico, registrar como `graph-drift-candidate` e só atualizar o grafo após confirmação humana.

Para indexar código, preferir codegraph; `rg` serve para localizar docs, configurações, arquivos gerados ou conteúdo que ainda não entrou no índice.

## Classificar a camada da mudança primeiro

A mesma "mudança de funcionalidade" produz superfícies de impacto completamente diferentes em camadas
distintas. Antes de varrer é obrigatório classificar:

| Camada da mudança | Pergunta típica | Escopo padrão de atenção |
| --- | --- | --- |
| `presentation` | texto, layout, visibilidade, controles de interação | todas as entradas que reutilizam a UI, tema, responsividade, internacionalização |
| `option-source` | origem dos candidatos, agrupamento, ordenação, filtragem | construtores compartilhados, provider registry, filtragem secundária por entrada |
| `draft-default` | valor inicial, herança, fallback | dono do rascunho por entrada, defaults de workspace/session |
| `validation` | disponibilidade, permissões, condições de bloqueio | gating em nível de entrada, validação pré-commit, apresentação de erros |
| `commit-effect` | o que realmente muda ao clicar | command/serviço, dono do estado de execução, invariantes de isolamento |
| `persistence` | onde salva, como carrega e migra | repo/config/Markdown, isolamento entre janelas ou workspaces |
| `recovery` | reconexão, snapshot, fila, recuperação | limite desktop contínuo versus web remoto replayable |

Se o usuário não informar a camada, primeiro faça a varredura de baixo custo e só então pergunte as
ambiguidades que mudariam a conclusão de impacto.

## UI Surface Matrix

Sempre que uma capacidade aparece em mais de uma interface, é obrigatório registrar por entrada os
campos abaixo:

| Campo | Pergunta a responder |
| --- | --- |
| Cenário do usuário | Por que o usuário usa essa capacidade aqui? |
| Entrada de UI | Onde fica: página, painel, modal ou barra de ferramentas? |
| Implementação compartilhada | Qual componente, construtor de opções, hook ou serviço é reutilizado? |
| Estado exibido/rascunho | Quem exibe o valor atual e quem segura o valor editado localmente? |
| Default/herança | De onde é resolvido quando não há configuração explícita? |
| Validação/gating | Quais condições ocultam, desabilitam, fazem fallback ou geram erro? |
| Ação de commit | Qual command/serviço é chamado por último? |
| Owner/persistência autoritativa | Onde o estado de execução ou a persistência é escrito por fim? |
| Limite de modo | desktop/web/mobile, local/remote são diferentes? |
| Invariantes de isolamento | O que esta entrada nunca pode alterar por acidente? |

"Componente compartilhado" não é o mesmo que "comportamento compartilhado". Um campo `model` com o
mesmo nome também não é o mesmo estado: o modelo da conversa pode alterar a session atual, o modelo
de automação é salvo no automation record e o modelo de Subagent é salvo no agent Markdown.

## Classificação de impacto

As relações do Impact Brief são ordenadas pelos seguintes níveis:

1. `must-inspect`: ponto de modificação compartilhado ou mesmo estado/caminho de commit autoritativo; omitir provavelmente gera regressão direta.
2. `should-inspect`: fonte de candidatos, validação, default ou invariante de produto compartilhada; normalmente exige confirmação de regressão.
3. `conditional`: relevante apenas sob um modo de execução, tipo de workspace ou camada de mudança específico.
4. `invariant-only`: não exige mudança de código, mas é obrigatório provar que não foi alterado por acidente.
5. `evidence-only`: nós de teste ou alcançabilidade estática, usados apenas para verificação, sem alegar dependência de produto.

Cada conclusão deve trazer o tipo de relação, o motivo e ao menos uma evidência de código/doc. É
proibido achatar todos os nós alcançáveis do codegraph como "funcionalidades afetadas".

## Exemplo de seleção de modelo

A seleção de modelo é uma capacidade típica que atravessa várias UIs:

```text
                         +-> barra de ferramentas da conversa -> session/draft runtime
candidatos de modelo e controle de seleção ------+-> edição de automação -> automation record
                         +-> Subagent do usuário -> agent Markdown
                         +-> Subagent embutido -> built-in override
```

Ao varrer essa capacidade, é obrigatório verificar ao menos:

- Os chamadores atuais de `ModelConfigSelect` e `buildModelSelectGroups`.
- Se cada entrada usa o mesmo provider registry e se existe filtragem em nível de entrada.
- Se os draft owners e commit sinks de conversa, automação e Subagent continuam separados.
- Se abrir ou cancelar a edição de automação não altera o modelo de workspace/session.
- Se, ao alterar a lógica compartilhada de geração de candidatos, a semântica de default/herança de cada entrada não é indevidamente unificada.
- Se ao adicionar um chamador que não tem UI surface correspondente no grafo semântico, o drift do grafo é reportado.

## Encadeamento com o planejamento de limites

A descoberta de impacto de funcionalidade responde "o que mais precisa ser olhado"; o planejamento
de limites responde "qual deve ser o comportamento de produto para cada combinação de estados". Os
dois se encadeiam nesta ordem:

1. Produzir o Impact Brief e a UI Surface Matrix.
2. Converter relações indefinidas ou conflitantes em perguntas de limite e confirmá-las com o usuário.
3. Escrever de volta no grafo semântico as capabilities, surfaces, owners, commit sinks e invariantes confirmados.
4. Enumerar combinações de estados apenas para o escopo confirmado.
5. Marcar as combinações como `accepted`、`undefined`、`pruned`、`ignored` ou `bug-candidate`.
6. Atualizar primeiro a spec, o case catalog e o coverage matrix correspondentes, e só então entrar na implementação ou na escrita de E2E.

Se o usuário pediu apenas varredura, explicação ou diagnóstico, parar no Impact Brief, sem modificar
código de produto nem specs existentes.

## Contrato de saída

Cada varredura de funcionalidade deve produzir no mínimo:

- Resumo da funcionalidade e da camada da mudança.
- UI Surface Matrix.
- Implementação compartilhada e comportamentos diferenciados.
- Relações de funcionalidades upstream/downstream classificadas.
- Owners de estado, pontos de validação, commit sinks e pontos de persistência.
- Invariantes que precisam ser mantidos.
- Seeds do codegraph, chamadores diretos, profundidade de expansão e evidência de testes relacionados.
- `graph-drift-candidate`.
- Perguntas em aberto que mudariam o escopo de implementação ou de testes.

Quando for preciso seguir com o planejamento de limites, acrescentar as dimensões de estado, decisões
de poda, casos de formal-proof e material de passagem para E2E.