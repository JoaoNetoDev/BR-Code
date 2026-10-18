# Sidebar Coding Plan Usage

## Contexto

A entrada de cota restante no rodapé da sidebar do workspace é próxima do workspace atual, e por isso deve expressar "aquela parcela do Coding Plan que o modo de conexão de modelo atual consome", e não uma visão geral da conta.

## Regras

- A cota restante da sidebar mostra apenas uma origem, sem alternar várias origens pessoais/equipe no menu do rodapé.
- Quando o modo de conexão do workspace atual é um Coding Plan pessoal, consulta e exibe a cota restante do Coding Plan pessoal; sem direito, a entrada não é exibida.
- Quando o modo de conexão do workspace atual é um BigModel Team Plan, consulta e exibe a cota restante daquele projeto de equipe; sem direito ou sem contexto de projeto de equipe, a entrada não é exibida.
- Quando o modo de conexão do workspace atual é API Key, Start Plan, um provider personalizado comum ou um provider nativo, a cota restante do Coding Plan não é exibida.
- Ter direito em outras origens da conta não pode acionar a exibição de fallback da entrada da sidebar; por exemplo, quando a conexão atual é um Coding Plan pessoal mas a pessoa não tem direito e a equipe tem, a sidebar não mostra nada, evitando induzir o usuário a pensar que o envio atual consome cota da equipe.

## Header

- O header do painel exibe o título Coding Plan à esquerda.
- No header do painel, o rótulo de atribuição vem logo após o título Coding Plan:
  - Coding Plan pessoal: `Individual` / `个人`
  - Team Plan: `Team` / `团队`
- O rótulo expressa apenas a atribuição da cota e não oferece capacidade de troca.
- O nome da origem Team Plan é exibido uniformemente como `BigModel - <nome da organização>`; sem `organizationName`, nenhuma origem de usage do Team Plan é gerada, evitando continuar exibindo o `BigModel - Coding Plan` genérico ou uma origem em branco.

## Popover de Usage no campo de entrada

- O popover mantém um layout compacto de uma a três colunas de cota.
- O popover prioriza o nome da cota, a porcentagem restante e a barra de progresso. O tempo de reset é medido via JavaScript a partir da largura atual da coluna: exibe o formato completo "porcentagem · tempo" quando couber e oculta apenas o tempo quando exceder.
- Após mudanças de fonte ou de tamanho do popover, a medição é refeita via `ResizeObserver`, evitando que a quebra de linha da data em fontes grandes comprima a coluna de cota; a informação completa de tempo permanece sempre na página de configurações, em "Estatísticas de uso".

## Badge de perfil na sidebar

- O pequeno badge ao lado do avatar na sidebar é o badge de Coding Plan no nível da conta e não acompanha mais o modo de conexão do workspace atual.
- Quando a conta tem Coding Plan pessoal, exibe o level do pacote pessoal, por exemplo `Pro` / `Max`.
- Quando a conta não tem Coding Plan pessoal mas tem Team Plan, exibe uniformemente `Team` / `团队`.
- Quando a conta tem Coding Plan pessoal e Team Plan ao mesmo tempo, prioriza o level do pacote pessoal.
- A entrada "Estatísticas de uso" no menu do avatar da sidebar fica acima da entrada de upgrade, abre a página de configurações em "Estatísticas de uso" e prioriza cair na origem do pacote de programação.

## Coding Plan em Uso nas Configurações

- "Estatísticas de uso" nas configurações é uma visão de estatísticas no nível da conta e não acompanha mais o modo de conexão do workspace atual.
- A tab superior expande todas as origens de estatística disponíveis na conta: `应用用量`, o `个人套餐` pessoal e cada nome de organização de Team Plan.
- Quando a conta tem Coding Plan pessoal, exibe a tab `个人套餐` pessoal; quando há várias origens de Coding Plan pessoal, elas podem ser distinguidas pelo nome do provider.
- Quando a conta tem Team Plan, cada projeto de equipe é exibido de forma independente como uma tab, e o texto da tab mostra apenas `organizationName`, sem fallback para project, id ou product.
- Ao clicar na tab do Coding Plan pessoal, exibe apenas a cota e as estatísticas de uso daquela origem pessoal.
- Ao clicar na tab de um projeto Team Plan, exibe apenas a cota e as estatísticas de uso daquele projeto de equipe, e a requisição deve levar `organizationId` / `projectId`.
- Quando o modo de conexão atual é API Key, Start Plan, um provider personalizado comum ou um provider nativo, isso não afeta a exibição, na página de estatísticas de uso, das origens de Coding Plan que a conta já possui.

## Restrições de implementação

- O modo de conexão atual segue o `selectedSupplierKey` do workspace.
- O BigModel Team Plan continua reutilizando o provider `builtin:bigmodel-coding-plan`; o projeto de equipe específico vem da selected key `team-plan:*` em `modelProviderFamilySelectedKeys.bigmodel`.
- A consulta de cota do Team Plan deve levar `organizationId` / `projectId`, para que a camada de serviço copie e use a API Key do projeto de equipe.