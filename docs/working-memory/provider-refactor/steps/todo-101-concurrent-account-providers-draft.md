# Todo 101 Draft：Account Providers específicos coexistindo

> Estado: Draft / implementação adiada; 2026-09-09.
> Decisão do usuário: concluir este lançamento com a arquitetura atual; este item registra apenas a direção futura e não faz parte desta implementação.
> Este documento não é o contrato de execução vigente e não sobrescreve automaticamente o spec atual, as regras de migração nem as decisões de Todo99 ou Todo100.

## I. Direção de produto futuro já definida

1. Plano pessoal, Team A e Team B podem ser conectados e usados simultaneamente, sem mútua exclusão por uma única conexão global corrente.
2. A página de Settings alterna entre pessoal/equipe apenas trocando a página exibida, sem alterar o estado global de execução.
3. Cada ModelSelection explícita deve apontar para um Provider pessoal/equipe específico; elimina-se a lógica de atribuir automaticamente ao outro Provider conforme a conexão corrente.
4. A migração do Provider de ModelSelections antigas precisa ser repensada; não se pode manter «migrar tudo para pessoal e depois o runtime corresponder ao plano corrente».
5. O seletor de modelos ganha uma interface em gaveta, colocando os Account Providers múltiplos no topo. A forma exata da gaveta ainda precisa ser confirmada.
6. Continua sendo possível ter apenas uma conta conectada ao mesmo tempo; a coexistência de vários planos pessoais/equipe não equivale a várias contas conectadas. O Provider ocioso é determinado pela conta conectada, sem ganhar uma escolha de cota ociosa pessoal/Team A/Team B.

```text
Sob uma única conta conectada, múltiplos Account Providers coexistem
├─ Plano pessoal
├─ Team A
├─ Team B
└─ Start Plan（os limites concretos de coexistência/acesso ainda serão detalhados）

Sessão A    -> Team A / Model / Reasoning
Sessão B    -> pessoal / Model / Reasoning
Tarefa agendada -> Team B / Model / Reasoning

Qual plano a página de Settings exibe não afeta a identidade de execução acima
```

## II. Limite entre este lançamento e a futura reformulação

- Este lançamento continua usando a arquitetura de conexão única atual; não se remove antecipadamente o gate de current, não se desliga antecipadamente o mapeamento da seleção válida vigente e não se troca o Provider ID.
- Não se alteram antecipadamente os formatos de persistência de Settings / Selection, a atribuição de autenticação de conta, as regras de template ou o layout do seletor.
- Os problemas de integridade de sincronia, confirmação real e perda de parâmetros de despacho já confirmados no Todo100 ainda precisam ser decididos item a item conforme a exigência deste lançamento; não se pode marcar bugs atuais como desnecessários só porque o current será removido no futuro.
- Os experimentos pausados continuam pausados; este documento não autoriza retomar o Todo99 nem autoriza push ou deploy.
- O estado deste documento não pode ser registrado como «implementado», «escopo deste lançamento» ou «design vigente substituído».

### Orientação para a direção atual de correção

1. Basta corrigir corretamente a sincronia temporária, sem construir para ela uma nova plataforma difícil de remover. O esquema concreto para o titularidade do ciclo de vida do Worker continua sendo decidido à parte, conforme a discussão atual.
2. Manter o snapshot applied público, a verificação de integridade, a proteção da intenção original e o ModelFactory preciso — essas capacidades continuam necessárias no futuro.
3. Se for preciso corrigir agora o mapeamento automático pessoal/Team, reutilizar as regras públicas existentes, sem acrescentar mais casos especiais de negócio; seu limite de remoção futura precisa ficar claro.
4. Não consolidar «trocar o Provider automaticamente conforme a conexão global» dentro do Model.bind ou da Factory de baixo nível. O futuro ainda precisa de criação precisa; não vale ampliar a API pública em torno de uma semântica que será descartada.
5. Não usar a arquitetura futura como motivo para remover funcionalidades hoje corretas, nem introduzir antecipadamente dois conjuntos de identidade/migração de conta.

## III. Limitações estruturais confirmadas pela investigação de código

Linha de base da investigação：`86bbe157c88e8e599694afb53c39f6dac125ac08`。A seguir está a base do design, e não o conteúdo já implementado deste item.

| Estrutura atual | Motivo da futura mudança | Entrada no código |
| --- | --- | --- |
| Um único Team Provider ID fixo por domínio | Team A/B compartilham o ID, não permitindo especificar os dois de forma independente em uma Selection | `packages/shared/src/model-provider-types.ts` |
| Cada Family guarda uma selection de conexão | Isso expressa uma conexão corrente mutuamente exclusiva, e não múltiplas instâncias de conta | `packages/shared/src/provider-family-connection-selection.ts` |
| A navegação de Settings grava a connection selection | Navegar entre páginas altera um fato do lado da execução | `persistProviderFamilyModeForNavItem` em `packages/ui/src/settings/ModelProviderSection.tsx` |
| O Account Resolver limita o escopo de execução por current | Com múltiplos Providers específicos coexistindo, o gate de current para contas comuns deixa de ser necessário | `packages/provider/src/resolver.ts`、`packages/services/src/model-provider/accountProviderConnectionResolver.ts` |
| A autenticação da requisição lê a conexão compatível corrente | Mesmo com Team A selecionado na UI, a fase de requisição não pode passar a ler as credenciais do Team B | `resolveCurrentAccountAccess` em `accountProviderConnectionResolver.ts` |
| O Coding Plan antigo mapeia uniformemente para Individual | A correção depende do mapeamento automático posterior; ao remover o mapeamento, a estratégia de migração precisa ser redimensionada | `packages/shared/src/legacy-model-provider-identity.ts` |
| O seletor de Account gera rótulos de grupo por Family/Plan fixos | Instâncias de equipe dinâmicas exigem key única, rótulo preciso e distinção da origem de modelos com o mesmo nome | `packages/ui/src/lib/modelSelectionGroups.ts`、`packages/ui/src/ModelConfigSelect.tsx` |

## IV. Direção de arquitetura sugerida (implementação ainda não congelada)

### 4.1 Identidade específica do Provider e instanciação

```text
Built-in： definições públicas/regras de modelos do tipo de plano
                    |
Account： identidade específica e direitos de pessoal, Team A, Team B
                    |
                    v
             instância específica do Provider
                    |
Personal： overrides de configuração, ativação/desativação e ordem de modelos da instância
                    |
                    v
             Registry / View completo
```

- A instância específica tem um Provider ID estável e não usa nome de equipe, índice de lista ou Token como identidade.
- ModelSelection pode continuar preservando a estrutura providerId/modelId/options; a identidade da equipe vem do fato de instância de conta correspondente ao Provider, sem enfiar credenciais na Selection.
- É preciso verificar a semântica das entidades no servidor para saber quais campos — organização, projeto, produto — participam da identidade estável; a requisição precisar de um campo não significa que esse campo serve necessariamente como ID de longo prazo.
- A responsabilidade de Built-in e Account passa de «fixar um Team Provider + equipe corrente» para «definição pública de tipo + instância específica». Avaliar a reutilização da capacidade de Template existente, sem disfarçar a instância de conta como um Provider comum criado pelo usuário.
- Deve ficar definido se o sujeito logado entra na identidade da instância e como tratar a troca de pessoa no login após logout no mesmo domínio; não se pode deixar uma escolha antiga se ligar silenciosamente ao plano de outra pessoa.

### 4.2 Seleção precisa, autenticação precisa

```text
A Selection aponta para o Provider específico do Team A
                |
                v
Validação de Provider / Model / Reasoning no mesmo snapshot completo
                |
                v
Criação precisa pelo ModelFactory
                |
                v
Obtenção ou renovação das credenciais conforme a identidade do Team A
```

- Eliminar o mapeamento automático em runtime pessoal→Team e Team A→Team B.
- É possível manter a Selection View pública no formato de entrada e o resultado de validade, mas sem trocar o providerId de entrada; quando Provider/Model estiver indisponível, a intenção original é preservada e a execução falha explicitamente ou a UI fica temporariamente vazia conforme as regras definidas.
- Atualização dinâmica de Token/Key não equivale a mudar dinamicamente a atribuição da requisição. A falha do Team A não pode continuar a execução com as credenciais do Team B.
- Subagent implícito continua herdando o Active Model do pai; a seleção explícita usa o Provider específico; execução fixa, retry e override interno mantêm as fronteiras já definidas.
- Account availability/entitled continua tendo uso; current para contas comuns deixa de ser gate de execução. O item atualmente visualizado na página de Settings pertence apenas ao estado de UI.

### 4.3 UI com múltiplas entradas

- Exibir separadamente o estado, os direitos e os modelos de pessoal, de cada Team e do Start; a navegação entre páginas não altera o estado de execução.
- O seletor coloca os Account Providers no topo; expandir o Provider e escolher o modelo são ações distintas; apenas expandir não pode alterar a escolha do rascunho.
- Modelos com o mesmo nome precisam distinguir a origem pessoal/Team A/Team B; o ID interno não serve diretamente como texto para o usuário.
- Composer, Automation, Bot, Wiki e Subagent reutilizam as regras de candidatos e agrupamento, cada um mantendo seus próprios limites de rascunho, submissão e salvamento.
- Desktop e celular compartilham a semântica de seleção; a forma da gaveta, a busca, a navegação por teclado, o tema, os dois idiomas e nomes longos de equipe serão definidos juntos no design formal.

## V. Especial de migração: precisa ser rediscutido

### 5.1 Deixar de depender do mapeamento automático em runtime

| Evidência nos dados originais | Direção de tratamento sugerida |
| --- | --- |
| Provider comum personalizado/API com identidade explícita | Preservar a identidade original e migrar no formato normal |
| Identidade pessoal explícita ou de equipe completa | Migrar para o Provider específico correspondente, sem exigir que ele tenha direitos/modelos executáveis no momento |
| Apenas o ID antigo genérico de Coding Plan, sem atribuição específica | Não é possível recuperar historicamente a equipe; é preciso decidir uma estratégia de atribuição única |
| Overrides/ordem de modelos pessoais sob o Team Provider antigo | É preciso decidir a qual instância pertencem; não podem ser copiados por padrão para todos os times |

Opções candidatas: priorizar as próprias informações do registro / as antigas informações de associação verificáveis; quando insuficientes, usar a conexão antiga salva antes da atualização como padrão de migração única. Esse padrão não representa a atribuição histórica real de execução e ainda não foi confirmado pelo usuário. Se ainda assim não for possível determinar, como preservar o registro original e avisar o usuário é uma decisão à parte.

### 5.2 Este lançamento muda o alcance de compatibilidade futuro

- O princípio anterior de «não dar compatibilidade a formatos intermediários não lançados neste branch» não pode ser usado para ignorar **os dados realmente gravados após este lançamento oficial**.
- Antes da implementação futura, a origem da migração precisa ser confirmada pela versão efetivamente lançada, incluindo o Provider ID pessoal/Team fixo e as informações da conexão antiga salvos na época.
- Se a seleção antiga genérica já tiver sido migrada para pessoal e a evidência original de atribuição não existir mais, no futuro não se pode inferir a qual equipe ela pertencia apenas pelo ID pessoal; é preciso reconhecer a insuficiência de informação e exigir confirmação do usuário ou uma estratégia de mapeamento única.
- Não se modificam dados nem se acrescentam campos de migração por causa disso neste lançamento. Antes da implementação oficial, reauditar as evidências de dados e o alcance de compatibilidade, sem copiar as premissas deste Draft.
- Na fase de migração, identificar campos antigos; em operação normal, não reler continuamente a conexão antiga para decidir o Provider; indisponibilidade temporária de rede/Registry não é motivo para apagar a seleção persistida.

## VI. Limites de Off-Peak, sincronia e isolamento

- Já decidido: a única conta conectada determina o uso do Provider ocioso existente correspondente ao BigModel ou Z.ai. Providers pessoais/de equipe comuns podem coexistir, mas não se acrescenta a operação de produto «escolher a conexão de cota ociosa pessoal/equipe para tarefas ociosas».
- O item visualizado na página de Settings e a seleção comum de modelo não participam da escolha do Provider ocioso; o que se elimina é a seleção global mutuamente exclusiva dos planos comuns, e não a identidade da conta conectada.
- Os Tickets já obtidos mantêm o vínculo definido; trocar de conta conectada não pode religar automaticamente Tickets já existentes. Elegibilidade, credenciais e Ticket continuam sendo obtidos conforme o protocolo ocioso já existente; na implementação futura, conferir a dependência do código antigo em relação à current connection comum, sem transformá-la em um novo item de escolha do usuário.
- A sincronia precisa transmitir os fatos completos da instância de conta; o campo antigo de current sairá, mas o recebimento completo, a aplicação correta, o ciclo de vida do Worker e a recuperação em caso de invalidação continuam tendo valor.
- Manter a autoridade do Host de destino, o isolamento por workspaceIdentity, o shared-host attachment do celular e a fronteira desktop continuous / web replayable.
- Esta rodada não amplia a capacidade de conta da CLI independente; múltiplas contas conectadas simultaneamente estão explicitamente fora do escopo deste item.

```text
Única conta conectada
    ├─ pessoal / Team A / Team B dessa conta -> Provider comum independente para cada um
    `- sistema ao qual a conta pertence BigModel / Z.ai   -> Provider ocioso correspondente -> Ticket
```

## VII. Pontos ainda pendentes de decisão

1. Após o login, descobrir/habilitar automaticamente todos os planos elegíveis, ou o usuário conecta cada um explicitamente? Apenas visualizar uma página não pode implicar efeitos colaterais como conectar ou criar Key.
2. A restrição de conta única já está definida; mas, ao trocar de pessoa após o logout, como a identidade do Provider específico e as escolhas persistidas são isoladas, preservadas e restauradas ainda precisa ficar explícito no design de identidade.
3. Granularidade da identidade estável de uma instância de Team: que papel desempenham organização, projeto e produto? Como renomear, renovar e relogar mantêm a estabilidade das escolhas?
4. Padrão de migração das escolhas antigas genéricas, tratamento quando a informação é insuficiente e atribuição dos overrides pessoais de Team antigos.
5. «Em forma de gaveta» significa expandir o Provider dentro do seletor, ou um painel lateral/inferior completo? Fechar e cancelar afetam apenas o estado de navegação?

A questão de atribuição ociosa já foi decidida e não entra mais como opção em aberto: ela é determinada pela única conta conectada, preservando o vínculo de Ticket já existente.

## VIII. Ordem futura de implementação e direção de aceitação

Antes de implementar, reinvestigar o código e os dados reais após o lançamento e então completar o spec formal e os testes; a ordem abaixo é apenas uma sugestão:

1. Estabilizar a identidade da instância, o ciclo de vida da conexão e a instanciação de configuração.
2. Consultar direitos e obter credenciais por instância específica; eliminar a dependência de conexão global na fase de requisição.
3. Definir a origem da migração e as regras de migração única, além da atribuição dos overrides pessoais.
4. Remover current e o mapeamento automático entre Providers do Registry / Selection.
5. Deixar Settings apenas como navegação, com a gaveta do seletor comum e rótulos de origem precisos.
6. Despacho multi-entrada, tarefas em segundo plano, Tickets, sincronia, atribuição e verificação em desktop/celular/SSH.

Aceitação essencial: requisições paralelas de A/B são faturadas corretamente; visualizar outra página não afeta nenhuma escolha; a falha de A não redireciona para B; modelos com o mesmo nome são distinguíveis; reinício/renomeação não perde a instância; overrides pessoais não vazam entre times; migração indefinida não destrói os dados originais; execuções fixas e Tickets não são substituídos.

Concluir o registro deste Draft não significa iniciar a implementação. O contrato de execução oficial só é atualizado depois que o usuário reiniciar este item e os limites pendentes de decisão forem concluídos.