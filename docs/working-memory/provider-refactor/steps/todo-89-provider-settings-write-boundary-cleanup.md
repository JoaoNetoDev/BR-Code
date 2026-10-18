# Todo 89: Regras de Escrita das Configurações de Provider e Organization do Rascunho de Edição

> Atualização de atribuição da verificação (2026-09-09): toda a dívida de subtestes/falhas/promoção
> manual remanescente neste documento foi transferida para o
> [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente
> previsto aqui; as evidências históricas são preservadas, e a transferência não significa que os testes
> passaram.

> Status: desenvolvimento e verificação desta rodada concluídos em 2026-09-08. A verificação prática de
> controle remoto pelo celular/SSH e os novos casos pending promovidos manualmente não contam como
> aprovados; ver o registro ao final.
>
> Data: 2026-09-08. Baseline de revisão: `483e51c8459646f07236cbb7181c8d0d151c5430`,
> `provider-refactor-e2e-recovery`.
>
> Pedido do usuário: não basta corrigir a falha ao adicionar modelo em um Account Provider; é preciso
> organizar de forma abrangente esse código confuso e as regras de salvamento.

## 1. Objetivo e Escopo

Fazer com que adicionar, editar, ativar/desativar, renomear, excluir e ordenar sigam regras consistentes
de pertencimento de membro e de escrita. O resultado de uma operação não pode depender de o usuário ter
arrastado um modelo antes.

Este item retoma as pendências R08/R10 do Todo 88, sem refazer migração, direitos de conta, resolução de
Selection ou a arquitetura de execução de requisições. Mantém-se a estrutura atual de
`provider_config.json`, sem migração de dados e sem exigir que o usuário apague o arquivo de
configuração.

Camadas envolvidas: exibição da página de configurações, rascunho, validação, submissão e persistência
Personal. Não é só corrigir um ramo de erro, nem reescrever todo o módulo de Provider.

Base:

- [Página de configurações do Provider](../design/registry/settings.md) — página de configurações de Provider.
- [Pertencimento e ativação de modelos](../design/registry/model-membership-and-enablement.md) — pertencimento e ativação de
  modelos.
- [Todo 88](todo-88-provider-audit-regression-repair.md).

## 2. Problemas Confirmados e Evidências

| Número | Problema                                                                                      | Evidência atual                                                                                       | Prioridade      |
| ------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------- |
| W01   | Sem um registro Personal Provider, a primeira adição de modelo em um Account Provider falha; só depois de arrastar para criar o registro a adição funciona | Reprodução em memória em `config-service.ts`; editar e ativar/desativar conseguem gravar a configuração do modelo isoladamente, mas não desfazem a falha de adição | Alta            |
| W02   | Adicionar modelo regenera a ordem pela lista de membros, perdendo a ordenação existente          | Reproduzido em Provider Account e customizado: `[B,A]` + adicionar C vira `[A,B,C]`                     | Alta            |
| W03   | A atualização de View em background produz um novo objeto de modelo e sobrescreve o rascunho de edição do modelo aberto | Reprodução no DOM: digitar 123456 e voltar a 200000 após o refresh do objeto equivalente             | Alta            |
| W04   | Quando alguns atributos do modelo estão ausentes, os pontos de entrada de edição, ativar/desativar e excluir da linha somem | Reprodução no DOM: sem contextWindow restam apenas o nome do modelo e a mensagem de erro              | Alta            |
| W05   | O formulário de Provider customizado perde os headers estáticos ao reconstruir api; mesmo sem edição ele pode ser julgado como precisando de salvamento | Reprodução em memória na conversão do formulário e no serviço de configuração; a configuração embutida atual e as configs Air verificadas não têm usuários, portanto não se afirma impacto em contas reais | Secundária, mas corrigida neste item |

Os 5 arquivos de teste unitário relacionados aqui aprovado, com 110 casos passando, não cobriam essas
pré-condições. Testes temporários de diagnóstico confirmaram W03/W04 e depois foram removidos; a
implementação deve incluir regressões mantidas de longo prazo. Esses resultados de diagnóstico não
foram tratados como evidência de aprovação de E2E no Electron.

## 3. Camadas Preservadas e Fonte Única de Verdade

```text
Built-in / Template / Account 事实 + Personal 配置
                      |
                      v
             Host 的一致配置快照
                      |
          +-----------+--------------+
          |                          |
          v                          v
     Settings View            成员及来源上下文
     展示、编辑草稿             校验本次写入
          |                          |
          +---- 用户提交操作 ---------+
                                     v
                          Provider Config Service
                          Personal 原子更新
                                     |
                                     v
                         刷新快照 -> 返回保存结果
```

- A existência de um Provider não significa que o arquivo Personal necessariamente já tem um registro
  dele. Sem override do usuário, não haver registro Personal é um estado legítimo e normal.
- `providers[providerId]` guarda a configuração pessoal de nível Provider, incluindo os `modelIds` de
  membros adicionados pessoalmente e o `modelOrder` de ordenação.
- `modelConfigRules` guarda a configuração pessoal de um modelo. Editar um modelo não deve, de quebra,
  criar um registro de Provider sem uso.
- A existência e a origem dos membros vêm do snapshot de resolução de configuração; não se pode
  consultar apenas o Registry executável nem recorrer a uma lista estática no momento da escrita. Uma
  lista de membros dinâmicos de Account vazia também é um fato explícito, e membros estáticos não são
  devolvidos por conta própria.
- O Config Service recebe apenas fatos de membro somente-leitura e confiáveis fornecidos pela Facade;
  não consulta a rede da conta e não depende de implementações específicas do Runtime. O Renderer não
  submete declarações de pertencimento de membro que ele próprio possa forjar.
- Reaproveita-se o `ProviderModelMembership` existente, a fila de escrita por Provider e a atualização
  atômica do repositório; não se cria um segundo resolvedor de membros nem outra fila de salvamento.

## 4. Convergência das Regras de Escrita

### 4.1 Tratar uniformemente o Provider gravável, em vez de preencher objetos vazios espalhados

Dentro do Config Service, convergem a existência do Provider, a obtenção do registro Personal e o
julgamento sobre a criação sob demanda de um override esparso, para reutilização pelas operações que
precisam gravar campos do Provider.

Quando um Provider embutido/de conta existe legitimamente mas falta o registro Personal, a adição ou a
ordenação pode criar um override esparso sob demanda; é proibido copiar o Effective Config inteiro, e
ainda menos transformar membros dinâmicos de Account, credenciais e informações de conexão em
configuração pessoal.

Se o Personal Provider da instância customizada/de modelo já foi excluído, a operação atrasada precisa
falhar e não pode ressuscitá-lo por essa regra. As verificações de snapshot de membros e de revision
Personal são mantidas na fronteira real de submissão, e não apenas no momento do clique no botão.

### 4.2 Cada operação altera apenas o que lhe pertence

| Operação                  | Conteúdo modificado atomicamente                                                   | O que não pode acontecer                                    |
| ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Adicionar modelo pessoal  | modelIds pessoais, novo membro acrescentado ao final da ordem atual, config inicial do modelo e enabled=true | Exigir ordenação prévia; resetar a ordem antiga; copiar membros da conta |
| Editar modelo existente   | A configuração pessoal desse modelo e o modo de acompanhamento                       | Reescrever a lista de membros ou a configuração de outros modelos |
| Ativar/desativar modelo   | A folha enabled desse modelo                                                         | Reenviar a configuração antiga inteira sobrescrevendo outras edições; mudar o modo de acompanhamento |
| Ordenar por drag           | modelOrder                                                                            | Gravar membros herdados como pessoais; mudar ativação        |
| Renomear modelo pessoal   | ID do membro pessoal, referência de ordenação, identidade da mesma configuração do modelo | Renomear membro herdado; perder modo ou outra configuração |
| Excluir modelo pessoal    | Membro pessoal, referência de ordenação e configuração correspondente                | Excluir membro herdado; excluir a configuração de outros modelos |
| Editar campo do Provider  | Os campos explicitamente alterados nesta operação                                  | Limpar conteúdos como headers não gerenciados pelo formulário; materializar valores herdados |

Prioriza-se o reaproveitamento das operações de domínio existentes, extraindo apenas regras realmente
comuns; não se adiciona um framework CRUD genérico nem uma interface arbitrária de JSON Patch. Para
ativar/desativar, recomenda-se uma operação de semântica estreita que atualize enabled dentro de uma
transação com base na configuração mais recente, evitando-App de salvar pelo pop-up completo do modelo.
Na implementação, todos os chamadores são verificados junto, para que formas antiga e nova não coexistem
com comportamentos diferentes.

A ordenação reaproveita a semântica de `owned-order.ts`: membros herdados ainda não ordenados à
frente, preservando a ordem válida já existente do usuário, e membros pessoais não ordenados atrás. A
ordem relativa dos membros originais antes e depois da adição não muda, e o novo membro pessoal é
acrescentado ao final. Deduplicação, proteção de membros herdados e regras de renomeação não são
implementadas em conjuntos separados.

O formulário de Provider usa o Personal Draft como base de submissão, preservando campos não tocados; o
subobjeto api não pode ser reconstruído só a partir de type/baseURL na UI e perder headers. Não se pode
usar o Effective Config inteiro como fallback de salvamento. Sem edição real, não há salvamento.

## 5. Rascunho e Recuperação de Erros

```text
打开模型弹窗 -> 捕获该模型草稿 + 基线 revision
                    |
       +------------+------------------+
       |                               |
外部 View 刷新                     用户编辑
更新列表事实                       只改变草稿
不覆盖打开中的草稿                      |
                                  点击保存
                                       |
                     +-----------------+----------------+
                     |                                  |
                  提交成功                         校验/版本冲突
                  结束本次编辑                     保留草稿并解释原因
```

- O pop-up gerencia o ciclo de vida da edição pela abertura/fechamento e pela identidade do modelo, e
  não usa a mudança da referência do objeto model como condição de reset.
- O salvamento segue a validação de revision já existente. Um rascunho desatualizado não pode
  sobrescrever silenciosamente a configuração mais recente, nem ser resetado ou mesclado em background
  com a entrada do usuário. Quando for preciso recarregar, isso é uma ação explícita do usuário; esta
  rodada não introduz uma mesclagem automática de conflito campo a campo.
- O salvamento automático na linha do Provider e o salvamento explícito no pop-up de modelo mantêm
  fronteiras diferentes; o switch de recomendação de acompanhamento ainda só altera o rascunho do
  pop-up, e apenas o clique em salvar persiste.
- Configuração incompleta não é igual a não poder editar. A página de configurações mantém a linha do
  modelo e os controles de reparo adequados; entradas ausentes são exibidas com segurança como vazias e,
  depois de reparadas, salvam normalmente.
- Um modelo herdado ainda não pode ter o ID alterado nem ser excluído; um modelo pessoal pode ser
  excluído mesmo incompleto. Ativar um modelo incompleto não o faz contornar a validação do Registry e
  entrar no conjunto executável.
- Em caso de falha, a entrada do usuário é preservada; uma operação atômica que falha não deixa metade
  de membros, ordem ou configuração de modelo. A lista otimista acaba consistente com o resultado do
  Host.

## 6. Superfície de Impacto e Pontos de Implementação

| Entrada/relação                        | Implementação compartilhada e responsável                                          | Foco de verificação deste item                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Formulário de campos do Provider       | `ProviderDraftSave.ts`, `providerPersonalSave.ts`; o card mantém o rascunho         | Salvamento parcial de campos sem perder configuração não editada      |
| Adição/edição/ativação de modelo      | `InlineEditableProviderCard.tsx`, `ProviderFormControls.tsx`                        | Operações estreitas, ciclo de vida da edição, preservação em falha   |
| Linha do modelo e drag                 | `ProviderCardSections.tsx`, hook de ordenação otimista existente                    | Modelo incompleto reparável; a ordem não é resetada por adição       |
| Todas as operações de configurações, obrigatório verificar | `packages/provider/src/facades.ts`, `config-service.ts` | Fatos de membro confiáveis, fronteira serial, submissão atômica |
| Configuração herdada e execução, obrigatório preservar | Resolução de configuração, snapshot de Account, Registry                            | Separação entre editabilidade nas configurações e disponibilidade para execução; sem copiar a camada herdada |
| Seleção de modelo a jusante, deve verificar | Cadeia de atualização da Selection View existente                                   | Refresh correto após salvar, sem alterar suas regras de restauração de seleção ou de nível padrão |
| Multiplataforma e remoto, verificação condicional | Service de configurações do Host alvo, UI comum                                   | Não escrever no ambiente errado; layout e operações no celular       |
| Fluxo de sessão, apenas verificação de invariantes | desktop continuous / web replayable                             | Este item não muda o protocolo de Session, a fila, o reconexão ou a sincronização de envio remoto |

Não foi possível usar codegraph nesta rodada; foram usadas busca precisa e leitura de cadeia de chamadas,
até chegar à Facade, ao Config Service, à escrita Personal e ao retorno da View. O seed antigo
`modelProviderServiceStorage.ts` do grafo de relações foi atualizado para o
`NodePersonalProviderConfigRepository` atual, e Facade/Config Service foram completados; o Service
antigo não é restaurado com base no grafo desatualizado.

## 7. Plano de Regressão e Poda

Os casos abaixo, que seguem a semântica de produto existente, entram neste item; as evidências reais e
as fronteiras ainda não verificadas estão na seção 8, e nenhuma combinação planejada é apresentada como
executada.

| Caso    | Pré-condição e operação                                                                        | Resultado que precisa ser observado                                                                 | Camada de evidência          |
| ------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- |
| W89-01  | Account Provider sem registro Personal, adicionando modelo direto; testar também editar/ativar antes de adicionar | Ambas as ordens têm sucesso; só o override necessário é criado, sem copiar modelos da conta | Serviço de configuração + Electron |
| W89-02  | Ordenar como B,A e adicionar C; cobrindo Account, instância de modelo e customizado         | B,A,C; salvar, reabrir e reiniciar são consistentes                                                   | Serviço de configuração + Electron |
| W89-03  | Account devolve membro fora da lista estática; editar e ordenar                                  | Salvamento normal; membros herdados continuam sem exclusão/mudança de ID; adição duplicada é rejeitada | Facade + UI                   |
| W89-04  | Abrir o pop-up e editar, empurrando um View equivalente e uma mudança externa real              | O rascunho não se perde; salvamento desatualizado não sobrescreve a mudança externa e, após o erro, o rascunho continua | DOM + representante Electron |
| W89-05  | Modelos pessoal/herdado com atributos ausentes                                                | Abre para reparo; o pessoal pode ser excluído, o herdado não; sem reparo não vira modelo executável | DOM + Registry + representante Electron |
| W89-06  | Provider customizado com headers, testando sem edição, com renomeação e com mudança de Base URL | Sem edição não salva; outras edições preservam headers; campos herdados não são materializados | Formulário + serviço de configuração |
| W89-07  | Ativação e edição de configuração concorrentes; modelo em modo fixo/seguindo                    | Só os campos próprios mudam; enabled e modo não se contaminam                                      | Facade/serviço de configuração |
| W89-08  | Snapshot de membros desatualizado, modelo/Provider excluído, adição duplicada, falha de escrita no repositório | Falha clara sem ressuscitar nem escrever parcialmente; a página não mostra sucesso falso | Testes de falha de serviço + DOM |
| W89-09  | Salvar com o Service de configurações do ambiente alvo e verificar o outro ambiente              | Só o alvo muda; a UI compartilhada é operável em tela estreita                                        | Teste de isolamento de serviço + smoke multiplataforma |

Base da poda: Personal/Team/Start reaproveitam o mesmo algoritmo de membros de Account, sem fazer o
produto cartesiano completo por marca; mantêm-se pelo menos dois representantes, uma Account comum e
os membros dinâmicos do Start. Off-Peak hidden não ganha nova entrada de configurações comuns, e apenas
se verifica que as regras de ocultar seguem iguais. Tema claro/escuro, zh/en e tela estreita usam
representantes, sem produto cartesiano com cada tipo de Provider. Direitos de conta reais, migração,
sincronização de envio e recuperação de Session não são alvos de teste dos novos E2E deste item.

O E2E atualiza primeiro o catalog/matrix correspondente, mantendo pending, fixture independente e
asserções de operação real conforme `e2e-case-lifecycle`; não se usam dados nem credenciais de usuário
real. Formulações históricas como backfill de catálogo e nível padrão em documentos antigos de teste não
podem ser tomadas diretamente como contrato deste item. O MacBook Pro executa o Electron real; um teste
de DOM não substitui a conclusão de aprovação no desktop, e não se adicionam grandes asserções sobre
detalhes de implementação de CSS.

## 8. Fases de Execução e Registro de Revisão

| Fase | Entrega                                                                        | Status/Evidência |
| ---- | ----------------------------------------------------------------------------- | ---------------- |
| 1    | spec e regressões vermelha/verde de W01–W05                                   | Concluída; evidência real de falha de W06–W09 a complementar |
| 2    | Regras de escrita do Config Service, operações de membro, ordenação e Facade  | Concluída; override esparso criado sob demanda; ativar/desativar só atualiza enabled; snapshot/revision validados dentro da transação |
| 3    | Campos do Provider, transação de edição de modelo, controles de reparo        | Concluída; rascunho fixado na abertura; preservação em falha; lista somente lê o Host View, mantendo a ordem pending de drag existente |
| 4    | Electron, verificações multiplataforma/ambiente, caminhos de falha          | Concluída; execução final dos 3 arquivos Pro, 12 casos aprovados, 1 SSH pulado; execução anterior isolada do Start com 4 casos aprovados |
| 5    | Documentação, matriz de cobertura, grafo, revisão e commit                    | Concluída; revisão das diferenças arquivo a arquivo e do ciclo de vida de escrita/rascunho, com este registro no mesmo commit da implementação |

### 8.1 Problemas relacionados encontrados e corrigidos na implementação

| Número | Causa raiz e correção                                                                                         | Evidência |
| ------ | -------------------------------------------------------------------------------------------------------------- | --------- |
| W06    | Os detalhes de Account/pré-configuração não montavam o callback de exclusão, então a exclusão só mudava a UI; as operações de detalhe foram uniformizadas | A asserção de leitura em disco da exclusão falhou na primeira adição no Pro; a exclusão real foi verificada após o callback |
| W07    | A cópia local de membro era sobrescrita por salvamento atrasado/rollback de falha; o novo pop-up fechava sem esperar a escrita | Adição externa durante falha atrasada no DOM; a entrada foi preservada quando a adição falhou; o estado de membro duplicado foi removido |
| W08    | O refresh de cota do Start virava temporariamente checking, desmontando a área de edição de uma conta já confirmada como available | Reproduzido de fato no refresh do arquivo Pro; a área de edição é mantida pelo estado já confirmado da Account, e o card de cota continua atualizando de forma independente; 200 casos de teste de exibição de planos aprovados |
| W09    | Modelos com o mesmo nome em Providers diferentes reutilizavam o rascunho aberto                           | Vermelho/verde no DOM; a subárvore de edição é isolada pela identidade do Provider |
| W10    | Esc fechava e reabria antes de o salvamento terminar, e o retorno do salvamento antigo fechava o novo rascunho | Falha seguida de aprovação no DOM; adição e edição bloqueiam o fechamento durante o salvamento, com ref síncrono impedindo envio duplicado |

### 8.2 Verificação automática e aceite item a item

2026-09-08 local:

- 27 arquivos de teste unitário, 541 casos aprovados: `packages/provider/test`,
  `packages/provider-node/test`, `providerRuntime`, `providerFacadeServices`,
  `modelProviderDraftSave`, `modelProviderModelRowEditor`, `providerSettingsFormBoundary`,
  `modelProviderCodingPlan`.
- `pnpm typecheck` e `pnpm exec tsc --noEmit -p packages/desktop/tsconfig.e2e.json` aprovados.
- `pnpm lint`: 0 errors, 40 warnings já existentes.
- Grafo: 336 nós únicos, 672 arestas; as 4 arestas pendentes já existentes são iguais às do baseline.
  Este item atualiza o seed de salvamento/persistência das configurações, sem estender conteúdo
  alheio ao grafo.

| Caso        | Evidência de aceite                                                                                                                     | Fronteira |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| W89-01/02  | Adição sem registro raiz no ConfigService, ativar/desativar antes de adicionar, ordenação Account/modelo/customizado; primeira adição e adição após ordenação em Account dinâmica no Electron | Verificação por arquivo e reabertura da lista; o processo não foi reiniciado uma vez por tipo de Provider |
| W89-03     | Integração de membros dinâmicos na Facade; no Electron, edição, ordenação e exclusão de membro pessoal com leitura em disco            | Modelo herdado não ganha permissão de mudar ID ou de exclusão |
| W89-04     | View equivalente/mudança real e conflito de versão no DOM, cancelar e reabrir; refresh de arquivo externo no Electron                    | Também se testou refresh temporário de cota do Start e modelo homônimo entre Providers |
| W89-05     | Atributo ausente/valor vazio e controles de reparo no DOM; no Electron, editar, ativar/desativar e excluir após reparar um modelo pessoal | A validação de integridade executável do Registry não muda |
| W89-06     | Formulário sem edição, com renomeação, com mudança de endereço e exibição implícita de default; regressões de salvamento do serviço   | Não foi usada uma conta real que dependa de headers estáticos; nenhuma requisição de modelo adicional |
| W89-07/08  | Concorrência/revision/invalidação de membro na Facade; falha atrasada no DOM e preservação do rascunho na adição; recusa de adição duplicada sem duplicata em arquivo no Electron | Falha explícita ao salvar pelo pop-up só é retentada no rascunho original; nenhuma notificação externa abre um salvamento independente |
| W89-09     | O Service de configurações espera o alvo ficar ready e chama só a Facade alvo; zh/en, tema claro/escuro e viewport 390×844 do polish de UI | Controle remoto pelo celular e SSH Host não foram verificados na prática; o caso SSH foi pulado por não haver alvo configurado. A cadeia continuous/replayable não foi modificada |

Os testes de concorrência cobrem explicitamente: ao salvar o rascunho completo antes de ativar/desativar,
as modificações dos dois lados são preservadas; ao submeter a ativação antes, o rascunho com revision
antiga é recusado ao sobrescrever; mudanças de membro durante a fila recusam a submissão; um Provider já
excluído não é ressuscitado.

O novo `provider-settings-write-recovery.test.ts` permanece em manual-review/pending; passar não
equivale a revisão humana nem a promoção ao gate oficial. Os casos de Start estendidos reaproveitam o
cenário existente de gestão dinâmica de modelos, sem adicionar requisições reais de modelo.

Evidência final do Electron (MacBook Pro, workspace isolado
`/Users/dev/zcode-todo88-pro-e2e`):

- Comando do grupo completo:
  `ZCODE_E2E_MANUAL_REVIEW=1 ZCODE_E2E_SKIP_AGENT_BUILD=1 pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec ./test/e2e/start-plan-manual-claim-experience.test.ts --spec ./test/e2e/settings/manual-review/pending/provider-settings-write-recovery.test.ts --spec ./test/e2e/settings/settings-ui-polish.test.ts`.
- Relatório final: `packages/desktop/.e2e-artifacts/desktop-e2e-20260908-062431-556/summary.md`;
  12 passed, 1 skipped, 3 arquivos de spec aprovados. O item pulado é um caso existente sem alvo SSH.
- Reexecução isolada do fix de refresh do Start: `/tmp/todo89-start-repeat.log`, 4 passed; em seguida,
  com a proteção W10 adicionada, o grupo completo acima passou novamente.
- A cada execução, desktop main/host/renderer foram reconstruídos. O Agent não teve mudança de código,
  usando o build existente; as interfaces de configuração e cobrança usam fixtures de teste isolados, sem
  dados nem credenciais de usuário real.
- Logs finais no Linux: `/tmp/todo89-submit-unit.log`, `/tmp/todo89-submit-typecheck.log`,
  `/tmp/todo89-submit-lint.log`; verificação de tipos do E2E independente
  `/tmp/todo89-ready-e2e-types.log`. Esses caminhos temporários são apenas um registro da execução nesta
  máquina; os casos e asserções de longo prazo ficam salvos junto com o código.

### 8.3 Revisão e Exceções da Execução

- Não há novo formato de persistência, migração ou compatibilidade de campos antigos, e não é preciso
  apagar configuração do usuário. Nada de credenciais de Account, membros dinâmicos ou Effective Config
  inteiro foi copiado para o Personal.
- O Config Service não consulta interfaces de conta nem depende da implementação de Runtime; a Facade
  continua fornecendo o contexto confiável de membros. Não há nova fila de salvamento, protocolo
  App–Agent ou barreira de sincronização de envio.
- Em W08 chegou a passar ao adicionar log de diagnóstico e voltar a falhar depois de removê-lo, então
  aquela passagem não foi usada para declarar o fix. Depois de acrescentar a regra e o teste de manter a
  área de edição quando a Account está disponível, a reexecução ocorreu sem código de diagnóstico.
- Um comando de formatação chegou a varrer o repositório por engano por causa de uma lista de arquivos
  vazia. Após verificar arquivo a arquivo que `format(HEAD) == conteúdo atual`, as 3.719 mudanças
  puramente de formatação foram revertidas; 17 arquivos com mudanças originais de nomenclatura foram
  mantidos comparando antes e depois da formatação; o acréscimo original do plano não foi tocado. O
  conteúdo anterior à restauração ficou temporariamente em
  `/tmp/todo89-format-recovery-W789JG`. Arquivos não relacionados não entraram no commit; depois disso,
  apenas listas explícitas e não vazias de arquivos são formatadas.
- Não há novo comportamento de produto a decidir. Permissões de conta, restauração de seleção,
  migração e semântica de requisição não são estendidas; o escopo multiplataforma realmente não verificado
  é preservado na tabela acima, sem se passar por aprovado.