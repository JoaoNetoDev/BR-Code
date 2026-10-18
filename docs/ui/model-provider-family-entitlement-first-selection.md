# Prioridade do Entitlement na Seleção do Model Provider Family

Na seção de detalhes à direita do provider family Z.ai / BigModel, o `entitlement snapshot` é a fonte principal de decisão sobre o método de conexão. Enquanto os dados do family ainda não estiverem prontos, a UI deixa de adivinhar entre API Key, Start Plan, Coding Plan ou Team Plan e exibe primeiro o estado de loading.

## Regras

- Os detalhes do Family devem aguardar que settings, o cache de providers e o entitlement snapshot correspondente estejam prontos antes de renderizar os detalhes finais.
- `UsageEntitlementSnapshot.context` expressa o contexto de plano usado nesta consulta de entitlement:
  - `personal` indica a cota pessoal de Coding / Start Plan.
  - `team` indica a cota do BigModel Team Plan e carrega `organizationId` e `projectId`.
- Quando o snapshot contém a identidade completa da equipe, o item de conexão do Team Plan passa a ser gerado a partir do context do snapshot.
- O enterprise pricing / customerInfo do BigModel serve apenas para corrigir ou completar metadados do Team Plan: nome de exibição, ID do produto, nomes da organização/projeto, além de projetos já assinados que o snapshot não cobre, mas que o backend confirma que existem.
- Quando os dados de correção chegam atrasados, o Team Plan já derivado do entitlement não pode desaparecer nem voltar temporariamente para o Coding Plan.
- Falha na leitura das Settings é um estado de erro, não de loading. A UI pode exibir o aviso existente de falha na leitura dos métodos de conexão, mas não pode, com base nisso, inferir outro tipo de plano.

## Limite de Loading

Ao abrir um nó de family Z.ai ou BigModel, os detalhes à direita mantêm o loading card atual até que:

- as app settings tenham concluído a primeira leitura;
- os model providers tenham concluído a primeira leitura;
- o método de conexão do family atual possa ser determinado a partir das settings e do pending state;
- no modo OAuth, o entitlement do provider do family atual tenha concluído a primeira rodada de resolução, ou um erro de entitlement tenha sido retornado explicitamente;
- a selected connection key salva consiga ser resolvida em um item de conexão, a menos que essa key já seja inválida para o family atual.

Providers personalizados e Add Provider não usam esse limite de loading de family.

## Exibição de Saldo no Hover do Context

No hover de context da caixa de entrada do chat, "Saldo de hoje" e "Quota restante" só devem ser exibidos quando as três condições abaixo forem satisfeitas:

- o model provider realmente em uso no momento pertence ao Plan provider correspondente;
- o método de conexão do family atual nas Settings é do mesmo tipo de conexão;
- o entitlement correspondente ao método de conexão atual possui direitos exibíveis.

Matriz de exibição:

| Model provider em uso no momento | Conexão atual              | Estado do entitlement  | Exibido no hover de context        |
| -------------------------------- | ------------------------- | --------------------- | ---------------------------------- |
| API Key provider                  | Qualquer                  | Qualquer              | Não exibe "Saldo de hoje" nem "Quota restante" |
| Provider personalizado           | Qualquer                  | Qualquer              | Não exibe "Saldo de hoje" nem "Quota restante" |
| Coding Plan provider pessoal     | Coding Plan pessoal       | Com direito pessoal   | Exibe "Quota restante"             |
| Coding Plan provider pessoal     | Coding Plan pessoal       | Sem direito pessoal   | Não exibe                          |
| BigModel Coding Plan provider    | Coding Plan de equipe     | Com direito da equipe | Exibe "Quota restante"             |
| BigModel Coding Plan provider    | Coding Plan de equipe     | Sem direito da equipe | Não exibe                          |
| Start Plan provider              | Start Plan                | Com entitlement Start | Exibe "Saldo de hoje"              |
| Start Plan provider              | Start Plan                | Sem entitlement Start | Não exibe                          |
| Coding Plan provider             | API Key / Start Plan      | Qualquer              | Não exibe                          |
| Start Plan provider              | API Key / Coding Plan     | Qualquer              | Não exibe                          |

Princípios de implementação:

- O método de conexão é lido de `modelProviderFamilyModes` e `modelProviderFamilySelectedKeys`.
- O provider realmente em uso é resolvido a partir do model value atual na barra de ferramentas ou da supplier key.
- API Key e providers personalizados não leem nem exibem saldo de Plan.
- Coding pessoal, Coding de equipe e Start Plan não servem de fallback uns para os outros; o entitlement do backend preenche somente os dados do método de conexão atual.