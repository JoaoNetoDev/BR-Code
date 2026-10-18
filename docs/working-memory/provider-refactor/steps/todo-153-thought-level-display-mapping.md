# Todo153: Mapeamento de Exibição dos Níveis de Pensamento e Alinhamento da Ordem de Configuração

> Status: implementado, com testes unitários locais, interação de navegador e verificação visual concluídos; não enviado. A cadeia completa nativa/de controle remoto do celular não foi reexecutada.
> Data: 2026-09-16.
> 2026-09-16 o usuário autorizou a implementação: modificar o controle compartilhado de UI e os textos em chinês e inglês; a configuração do modelo e os parâmetros de requisição permanecem como estão.

## Objetivo e Escopo

Unificar os textos em chinês e inglês dos níveis de pensamento, distinguir minimal de low, completar ultra e remover a classificação forçada do front-end que não tem contrato explícito. O menu e a troca cíclica respeitam a ordem declarada pela configuração do modelo, sem mais adivinhar a intensidade pelo nome.

Relacionado: [spec do controle de nível de pensamento](../../../ui/chat-thought-level-control.md), [Todo66 formato de exibição de opções](./todo-66-option-map-variable-naming-and-display-formatting.md), [Todo138 fallback de raciocínio genérico](./todo-138-reasoning-level-ui-and-api-defaults.md). Este item cobre o mapeamento de exibição antigo e a convenção de ordenação do front-end; não reabre as decisões sobre Model Config, seleção padrão e mapeamento de requisição.

## Mapeamento de exibição confirmado

| Valor original                                                                | Chinês | Inglês        |
| ----------------------------------------------------------------------------- | ----- | ----------- |
| `disabled`、`false`、`no`、`none`、`nothink`、`no-think`、`no_think`、`off` | Desligado | Off        |
| `enable`、`enabled`、`on`、`true`                                           | Ligado | On         |
| `minimal`                                                                   | Mínimo | Minimal    |
| `low`                                                                       | Baixo   | Low        |
| `medium`                                                                    | Médio   | Medium     |
| `high`                                                                      | Alto   | High       |
| `xhigh`、`extra-high`、`extra_high`                                         | Muito alto | Extra high |
| `max`                                                                       | Máximo | Max        |
| `ultra`                                                                     | Extremo | Ultra      |

- “不思考 / No thinking” é unificado em “Desligado / Off”; apenas o texto é unificado, sem mesclar, remover ou reescrever os valores de opção originais.
- minimal passa a ser exibido de forma independente como “Mínimo / Minimal”, sem mais compartilhar o nome com low.
- `extra-high` e `extra_high` já existiam, e a decisão final é mantê-los; este item não acrescenta outros apelidos de grafia.
- Ao casar o texto, mantém-se o comportamento existente de remoção de espaços nas pontas e conversão para minúsculas; seleção, salvamento e envio continuam usando o value original.
- ultra recebe apenas suporte de exibição, sem adicionar automaticamente essa opção aos modelos e sem assumir que todas as interfaces aceitam o `ultra` original.

## Remoção da classificação fixa e do fallback de valores desconhecidos

Removem-se do front-end o mapeamento fixo de texto e a ordenação por inferência de nome para os seguintes valores:

`light`、`shallow`、`balanced`、`default`、`normal`、`standard`、`deep`、`maximum`、`very-high`、`very_high`。

Esses valores continuam podendo existir como níveis personalizados válidos; exibe-se o `entry.name` fornecido pela origem, mantendo o caminho de fallback genérico existente. Valores desconhecidos são tratados do mesmo modo, sem filtrar as opções e sem substituí-las pela opção conhecida mais próxima. Em particular, default deixa de ser interpretado como medium.

## Limites de ordem e interação

- O array de níveis na configuração do modelo é a fonte de ordem; o front-end mantém a ordem das opções recebidas, sem criar uma tabela de rank por nome e sem adivinhar o nível a partir de `entry.name`.
- A configuração deve ser declarada do mais baixo ao mais alto: Desligado, Mínimo, Baixo, Médio, Alto, Muito alto, Máximo, Extremo; isto é, minimal antes de low e ultra depois de max. Essa convenção não é um algoritmo de reordenação do front-end e este item não reescreve em massa as configurações existentes.
- “Ligado” tem semântica de interruptor; modelos de dois níveis exibem “Desligado → Ligado” conforme a configuração, sem inserção fixa entre “Alto” e “Muito alto”.
- Menu dropdown, botão de ciclo e `Ctrl+T` usam a mesma ordem de origem, voltando ao primeiro item ao chegar ao fim; a seleção atual não muda por causa de alterações no nome de exibição.
- A barra em degraus expressa a posição relativa conforme a ordem real das opções; níveis do tipo desligado têm intensidade zero. Mantêm-se as regras existentes de placeholder e progresso zero para valores não selecionados/inválidos, seleção somente leitura em nível único e impossibilidade de submeter valores inválidos.
- Desktop e celular compartilham o contrato de exibição; é preciso validar em chinês/inglês, temas claro/escuro, teclado e toque; as outras páginas que reutilizam o componente passam a valer junto.

## Base da investigação e limites de compatibilidade

Em 2026-09-16 foram conferidos, além das configurações internas, a CLI, a projeção de protocolo, migrações históricas, testes e documentação externa. Não se pode deduzir “ninguém externo usa” a partir de “não aparece na configuração interna”.

- `extra-high` e `extra_high` são grafias de apelido de xhigh já existentes em ferramentas externas e em configurações de usuários, por isso ambas são mantidas; default é usado para restaurar o padrão e não pode ser fixado como nível médio.
- Nomes de exibição como Balanced e Deep são comuns em ferramentas externas, com valores reais normalmente medium e high; isso apenas mostra que o vocabulário existe e não estabelece um contrato de equivalência de value válido para todas as origens.
- Neste projeto, `packages/shared/src/model-config.ts` aceita qualquer string não vazia e sem duplicatas como nível (isto é, nomes personalizados pelo usuário), e não é possível restringir o domínio de valores de configuração estreitando a tabela de exibição.
- Em ferramentas externas, ultra também pode conter semântica de orquestração em runtime. Aqui, “Extremo / Ultra” é uma decisão de exibição; não se importa a política de execução externa para o ZCode nem se altera o `reasoningLevel.map` da camada de requisição.
- Para as demais palavras cujo mapeamento foi removido, nesta rodada não se encontrou base suficiente para uma classificação forçada global; não se afirma que essas palavras nunca foram usadas.

Mantêm-se a seleção salva, o value original, a validação de legalidade, a identidade de Provider/modelo, a estratégia de seleção do nível padrão e o mapeamento de parâmetros de requisição. Não se adicionam schema, migrações, revisão de builtin, estado de runtime ou mecanismo de sincronização entre plataformas.

## Pontos de entrada da implementação e aceitação

Principais pontos de entrada: `packages/ui/src/chat-input-toolbar/thoughtLevelOptions.ts`, `ThoughtLevelCycleControl.tsx` e os locales em chinês e inglês; verificar o composer V4 e as outras páginas que reutilizam o controle. A projeção de configuração está em `packages/ui/src/lib/modelThoughtOption.ts` e `zcodeSessionProjection.ts`.

- [x] Atualizar primeiro o spec existente do controle de nível de pensamento, conferindo os chamadores do controle compartilhado em sessão, tarefas temporizadas/de ociosidade, Subagent e Repo Wiki; acrescentar itens de aceitação TL-01/02.
- [x] Primeiro acrescentar os testes esperados, depois alterar a implementação: conferir item a item o mapeamento final em chinês e inglês; minimal e low presentes ao mesmo tempo têm textos diferentes; ultra exibe corretamente; todos os apelidos de desligado são unificados em Off/Desligado.
- [x] Verificar que extra-high/extra_high são mantidos; os dez valores sem mapeamento e outros valores desconhecidos exibem o nome da origem, continuam selecionáveis e enviam o value original.
- [x] Validar com uma ordem personalizada explícita que o menu e a troca cíclica não reordenam; cobrir minimal/low, max/ultra, desligado/ligado e o retorno ao primeiro item no ciclo.
- [x] Cobrir a barra em degraus, valores vazios/inválidos, leitura única em um nível, confirmação de mesmo valor e demais limites existentes; a normalização de texto não altera a seleção atual nem a deduplicação de opções.
- [x] A interação de navegador no controle compartilhado real e no campo de Subagent cobre tamanhos desktop/celular por toque, chinês/inglês e temas claro/escuro; testes unitários direcionados dos chamadores, como tarefas automáticas, passaram. A cadeia completa nativa e de controle remoto do celular não foi reexecutada, o candidato de navegador permanece pending e não é promovido automaticamente.
- [x] typecheck, lint, verificação de arquitetura e testes afetados passaram, com revisão do diff concluída; o escopo de validação e as limitações de ambiente estão descritos abaixo.

## Entregas desta rodada

- 2026-09-16: apenas este Todo e o índice de implementação foram acrescentados; a implementação de produto e as aceitações acima ainda não foram executadas.
- Implementação subsequente em 2026-09-16: remoção das funções de rank/ordenação por nome do front-end; unificação do texto de desligado, inclusão de minimal/ultra e preservação dos dois apelidos extra-high; fallback para o nome da origem em valores desconhecidos. A verificação de desligado lê apenas o value original, e a barra em degraus calcula a posição dos itens não desligados na array de origem, evitando progresso incorreto quando itens desligados ficam no meio. Strings desconhecidas também cobrem constructor/`**proto`, sem atingir por engano atributos de prototype do mapa.

## Registro de verificação

- Antes da modificação, 45 testes direcionados falhavam e a execução real no navegador reproduzia `minimal` exibindo Low em vez de Minimal; após a modificação, os três arquivos de nível/controle/confirmação de mesmo valor passaram com 102 testes, e os seis arquivos de teste dos chamadores passaram com 90 testes, totalizando 192.
- `node --test packages/ui/test/browser/manual-review/pending/thought-level-display.test.mjs`: oito grupos aprovados (390/1200 × chinês/inglês × Zai Light/Dark), cobrindo menu real, toque, seleção por teclado, hook de atalho de produção, clique cíclico e campo de Subagent. Capturas e logs estão no diretório temporário de artefatos `todo153-thought-level-display`, mantendo os quadros de menu e de seleção.
- O Linux atual usa a biblioteca isolada existente e fontes chinesas, fornecidas via `LD_LIBRARY_PATH` e `FONTCONFIG_FILE`, sem modificar o ambiente de execução do produto. Problemas de validação da primeira rodada com o fixture chinês, que usava a prop locale e teclado antes do foco do Radix, foram corrigidos; as capturas foram refeitas após o fim da animação de entrada, e a fonte chinesa e as imagens representativas dos quatro tamanhos/temas foram verificadas visualmente.
- `pnpm typecheck`, `pnpm lint` e `pnpm architecture:check --changed` passaram; o lint teve 47 avisos preexistentes e 0 erros. Formatação, links e verificação de diff passaram.
- Não foram executados o Electron completo, a reconexão de controle remoto do celular ou requisições reais a provedores; nada nessa cadeia foi alterado. A evidência de navegador não substitui as verificações acima nem a admissão formal de E2E desktop.