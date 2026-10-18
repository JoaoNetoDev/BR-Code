# Todo 78: Encerramento Unificado dos Testes E2E de Desktop Pendentes Relacionados a Provider

> Status atual (2026-09-09): este Todo de verificação foi encerrado; os itens restantes são
> assumidos exclusivamente pelo [Todo102](todo-102-verification-debt-closeout.md), sem nova
> programação independente. Os status e falhas abaixo são registros históricos; o encerramento não
> significa que as falhas originais tenham passado.

> Status: concluído (o Air fechou o que dava para executar como regressão; tarefas ociosas mantêm
> bloqueios explícitos de fixture/Account entitlement)
>
> Data: 2026-09-04
>
> Ambiente de execução: uma árvore de trabalho limpa e independente do MacBook Air em
> `/Users/dev/Desktop/projects/z-code-e2e`; todos os Provider/Desktop E2E seguintes passam a ser
> executados de forma unificada nessa máquina.
>
> Baseline: considera-se o commit atual sob verificação sincronizado com essa árvore de trabalho, sem
> reutilizar commits antigos nem alterações não commitadas do diretório `z-code` original do Air.

## 1. Propósito

Reunir aqui tudo o que estava espalhado pelos Todo 34, 40, 62, 73, 75, 77 e pelos Todos relacionados
a tarefas ociosas como "pendente de execução real no Mac". A partir de agora, a lista deste Todo é a
única referência para testes pendentes, sem reprogramar itens nos Todos antigos.

Este Todo é responsável apenas pela execução real, pela localização de falhas e pelas correções
necessárias dos E2E gráficos de Desktop; ele não reabre E2Es centrais de Provider/Conversation que
já têm evidência de aprovação, nem trata typecheck estático, verificação de fixtures ou build bem
sucedido como aprovação de E2E gráfico.

## 2. Falhas Encontradas nesta Rodada

| Caso                                     | Resultado atual | Fenômeno direto                                                             | Tratamento posterior                                                             |
| ---------------------------------------- | --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `MP-UI-06` nível de raciocínio e Mapping das configurações de modelo | falha           | o teste espera o texto em inglês "Model capabilities"; o idioma de execução é chinês e o texto real é "模型能力" (capabilities de modelo) | Verificar se o caso deve afirmar no idioma atual; se for apenas erro de asserção, corrigir o teste e não o texto do produto |
| `QR-E2E-09` lembrete de primeira oportunidade | falha | a página não tem selo de oportunidade, lembrete nem requisição correspondente | Verificar a injeção dos dados de oportunidade e as condições de exibição; confirmar a fixture antes de decidir entre corrigir o teste ou o produto |
| `QR-E2E-10` lembrete de oportunidade próxima | falha | a página não tem lembrete próximo nem requisição correspondente | Investigar junto com o QR-E2E-09, evitando criar duas lógicas de preparação separadas |
| `off-peak-automations-home-layout`       | falha           | o ponto de entrada de criação de tarefa ociosa não aparece                     | Verificar se os pré-requisitos de rollout gradual/mock ainda são válidos; não alterar as asserções de negócio antes de o caso ser atingido |
| `off-peak-create-manage` (dois casos)   | falha           | ponto de entrada de criação ausente; o segundo caso ainda não mudou para o workspace esperado | Verificar separadamente o pré-requisito de entrada e o problema de troca de workspace, e confirmar se pertencem ao mesmo problema de ambiente de teste |
| `off-peak-limit-pre-gate`                | falha           | o ponto de entrada de criação não aparece                                   | Compartilha o mesmo pré-requisito de entrada com os demais casos ociosos; corrigir ou deixar explícita a causa do bloqueio |
| `SE-01` criação/edição de Subagent com persistência | falha | o Markdown do Subagent gerado diverge do conteúdo do formulário | Conferir a semântica atual do formulário e da persistência, e confirmar se o teste ainda usa campos antigos ou snapshot antigo de diretório |
| `SE-02` effort padrão do Subagent         | falha           | o effort padrão, sem nenhuma operação, ainda é gravado em `agents-state.json` | Julgar se é regressão real ou expectativa de teste antiga comparando com a semântica atual do produto |
| `SE-03` remoção do modelo selecionado     | falha           | o Markdown do Subagent gerado diverge do conteúdo do formulário             | Compartilhar o resultado da investigação do SE-01, evitando adicionar um branch de compatibilidade isolado |

Os 30 aprovados, 10 falhas e 1 pulo registrados originalmente vêm do resumo anterior à migração e não
podem ser usados diretamente como resultado de baseline atual.

Resultados da primeira rodada concluídos em 2026-09-05 na árvore de trabalho independente do
MacBook Air:

- Página de configurações `settings-ui-polish.test.ts`: 7 passing, 1 skipped. Durante o trabalho foram
  limpas asserções antigas de idioma, de linhas de modelo habilitadas, de contagem de capacidades e
  de valores padrão; nenhum código de produto foi modificado.
- Configurações e geração do Repo Wiki: os 2 specs passaram.
- Tarefas ociosas, 3 specs: todos pararam no pré-requisito de entrada de criação / troca de workspace,
  ainda sem entrar nas asserções de negócio; especificamente, a entrada de灰度 não apareceu e o
  workspace não foi trocado.
- Configurações de Subagent: entraram nas asserções de negócio, mas 3 itens falharam, envolvendo
  snapshot de campos do Markdown e se o effort padrão sem operação é gravado no estado; é preciso
  continuar a verificação conforme o contrato de persistência atual.
- A suíte completa de casos de QR opportunity ainda não produziu resultado válido; a execução anterior
  no Air foi bloqueada por processos Electron E2E residuais e precisa ser refeita isoladamente após
  a limpeza.

Execução complementar de QR e Subagent em 2026-09-05, após remover os processos residuais:

- `coding-plan-team-usage.test.ts`: 16 passing, QR-E2E-09/10 falhando. Ambos já chegaram ao Composer,
  mas a página atual não tem o trigger de Context usage, o selo de oportunidade nem o reminder;
  por enquanto o código de produto não é alterado e o item é mantido como teste pendente independente
  de dados de oportunidade do QR / condições de exibição.
- Subagent `settings-subagent-create-edit-persistence.test.ts`: o teste original usava snapshots
  antigos de Markdown com `model`/`thoughtLevel`. O teste foi atualizado conforme o contrato de
  serialização atual `modelSelection`, e o pré-requisito incorreto `skipProvider` foi removido; o
  SE-01 passou. A expectativa original do SE-02 era o oposto do design atual: trocar de modelo
  materializa o raciocínio padrão do catálogo daquele modelo (nesta rodada verificado como `max`), e
  foi alterado para validar essa semântica. O SE-03 continua bloqueado em execução isolada porque a
  entrada de remoção de modelo não encontra o modelo alvo; é preciso adicionar diagnóstico de UI
  antes de decidir se é problema de localizador.
- Tarefas ociosas, 3 specs: mesmo executados isoladamente, param no pré-requisito da entrada de
  criação de灰度 e não entram nas asserções de negócio; o registro atual é bloqueio de fixture E2E /
  disponibilidade de Account Provider, sem alteração do código de negócio ocioso.

A evidência de runtime do bloqueio de Off-Peak (log da primeira rodada no Air) foi confirmada
adicionalmente: na inicialização do Host o Registry contém dois Off-Peak Providers ocultos, mas o
snapshot de conexão da conta marca todos eles, assim como os demais providers da conta, como
`entitled:false`; `resolveOffPeakClientConfig` ainda exige, mesmo em modo mock, que o Registry
projetado tenha modelos disponíveis, e o mock substitui apenas exposição/pacote, sem forjar Account
entitlement. Portanto a ausência da entrada ocorre na camada de disponibilidade de Account Provider e
ainda não entrou na cadeia de disponibilidade de ticket nem no negócio de tarefas. Para continuar
depois, é obrigatório fornecer uma fixture/mock de disponibilidade independente de Coding Plan
entitlement; não se pode alterar apenas as asserções de UI ociosa ou a lógica de seleção de modelos
de produção.

Nova execução de `coding-plan-team-usage.test.ts` no Air em 2026-09-05: 18/18 aprovados, incluindo
CTP-01～11 e QR-E2E-01/02/03/04/09/10. Para que os casos de lembrete de oportunidade reflitam o
caminho real do usuário, o teste passa a selecionar BigModel Coding Plan pelo controle de seleção de
modelo do Composer e depois recarrega o Renderer; além disso, o mock de oportunidade urgente passa a
fornecer 120 segundos no futuro em cada resposta de status, evitando que o tempo fixo de início da
oportunidade de 179 segundos expire por causa do tempo de reinício completo do Electron/build. Ambas
as mudanças são correções de fixture/preparação de E2E; nenhum código de produção foi alterado.

Nova execução do spec de Subagent no Air em 2026-09-05 (após sincronizar o helper de teste mais
recente):

- `settings-subagent-create-edit-persistence.test.ts`: 3/3 aprovados.
- Desta vez apenas o contrato de E2E foi corrigido: a linha de modelo hoje é exibida por um elemento
  de texto com `data-testid`, e o helper de remoção lê tanto o conteúdo de texto quanto o valor do
  input; sem raciocínio explícito, o design atual materializa o nível máximo `max`. Nenhum código de
  runtime do produto foi modificado.
- O resultado aprovado do SE-03 confirma que, após remover o modelo selecionado, o Subagent mantém o
  texto do modelo histórico e não restaura os candidatos; a falha anterior era problema do
  localizador do teste e de asserções antigas, não uma regressão de produto em Provider/Registry.

Nova execução de `coding-plan-team-usage.test.ts` no Air em 2026-09-05 (após adicionar o CTP-02B):

- `desktop-e2e-20260905-051133-051`: 19/19 aprovados.
- O CTP-02B confirma de forma independente que, ao lado do avatar da barra lateral, é exibida a tag
  do Team Plan (`团队`) já confirmado. Este caso cobre o requisito de verificação gráfica do Todo 73;
  nenhum código de produto foi modificado.

## 3. Escopo Encerrado a Partir dos Todos Antigos

### 3.1 Encerrados

- Todo 34: os três E2E oficiais do Repo Wiki passaram neste baseline.
- Todo 40: upgrade de Provider, os principais cenários de cota do Coding Plan e a criação/gestão de
  Automation passaram; QR-E2E-09/10 continuam tratados conforme a tabela acima.
- Todo 62, 75, 77: os E2E gráficos relacionados a configurações de modelo, criação de Template e
  níveis de raciocínio são cobertos de forma unificada por `settings-ui-polish.test.ts`; resta apenas
  o problema de asserção de idioma do `MP-UI-06`.

### 3.2 Bloqueios de ambiente já registrados

- Todo 73: coberto de forma independente pelo CTP-02B e aprovado no Air; deixa de ser reprogramado
  como item pendente.
- Todo 09 e o encerramento relacionado a tarefas ociosas: três specs não entraram nas asserções de
  negócio porque a entrada de灰度/mock não foi atingida; permanecem registrados conforme a tabela
  acima como bloqueio de fixture/Account entitlement.
- Persistência das configurações de Subagent: SE-01～03 passaram no Air; deixam de ser reprogramados
  como itens pendentes.

As 45 evidências de execução de Provider/Conversation em macOS registradas antes no Todo 57 continuam
válidas; os casos reais de SSH Remote permanecem blocked por falta de credenciais, e não são
aprovados artificialmente neste Todo.

## 4. Ordem de Execução

1. Resolver primeiro os pré-requisitos de teste ou as asserções de idioma que não envolvem semântica
   de produto, e confirmar executando isoladamente.
2. Em seguida, investigar os dados de mock/灰度 de QR e das tarefas ociosas e confirmar se é problema
   de preparação do teste ou mudança nas condições de exibição do produto.
3. Por último, conferir os resultados da execução complementar do spec de persistência de Subagent e
   do caso de barra lateral do Todo 73; alterar o código de produção somente quando a evidência for
   clara.
4. Ao fim de cada grupo, reavaliar se as falhas realmente entraram nas asserções de negócio e se
   introduziram novos branches de Provider/Selection, antes de passar ao próximo grupo.
5. Executar novamente todos os casos listados neste Todo na árvore de trabalho independente do
   MacBook Air e registrar aprovações, falhas, skips e bloqueios de ambiente; itens não resolvidos
   devem manter a causa registrada.

## 5. Portão de Aceitação

- Cada caso deste Todo tem um resultado WDIO independente no MacBook Air, ou um bloqueio de
  pré-requisito explicitamente registrado.
- Falhas de teste, pré-requisitos de teste não atingidos e bloqueios de ambiente são registrados de
  forma separada.
- Não alterar a semântica de Provider, Registry, Overlay ou seleção de modelos apenas para deixar as
  asserções verdes.
- Se o código de interação for modificado, completar os E2E de Desktop correspondentes e rodar os
  testes unitários afetados, `pnpm typecheck` e `pnpm lint`.
- Ao concluir, alterar as descrições de "pendente de execução real no Mac" nos Todos antigos para que
  apontem para este Todo, evitando listas duplicadas de testes pendentes.

## 6. Registro das Condições de Execução Atuais (2026-09-04)

- O workspace de código atual é Linux; os E2E oficiais de Desktop são executados de forma unificada
  na árvore de trabalho independente do MacBook Air, sem reutilizar o diretório `z-code` original do
  Air.
- Verificações estáticas no Linux ou resultados de commits antigos não são apresentados como evidência
  gráfica; os casos reais de SSH Remote continuam registrados conforme o bloqueio de credenciais do
  Todo 57.