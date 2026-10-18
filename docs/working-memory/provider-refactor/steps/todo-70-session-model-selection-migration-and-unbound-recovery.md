# Todo 70: Migração de Session Model Selection e recuperação não vinculada

> Atualização de atribuição de verificação (2026-09-09): as pendências de teste/falhas/promoções manuais remanescentes neste documento foram transferidas uniformemente para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente neste documento; a evidência histórica é preservada e a transferência não significa que os testes passaram.

> Status: implementação e aceitação por fases concluídas (2026-09-04).
>
> Origem: retrospectiva das falhas de recuperação de Sessions existentes antes do lançamento da refatoração de Provider
>
> Ordem de execução: primeiro concluir a base de conversão de identidade do Todo 72, depois conectar com a fronteira de armazenamento do Todo 69; em seguida implementar este documento e, por fim, conectar com o Todo 71.
> Respeitar a fronteira prática de rollback do Todo 69 de "não dual-write contínuo", sem depender de codificadores que reescrevam campos antigos.

## 1. Problema

Na recuperação de Sessions existentes, o Model Selection persistido pode estar:

- ainda na estrutura antiga;
- sem `reasoningLevel` na estrutura nova;
- com Provider, Model ou Reasoning já salvos que não existem mais;
- com campos novo e antigo simultâneos, mas com conteúdos diferentes.

A cadeia de recuperação atual entrega cedo esse tipo de Selection incompleto ao ModelFactory estrito, o que faz a Session nem conseguir abrir o conteúdo histórico, por exemplo:

```text
Reasoning level is required for provider/model
```

Isso não é falha de requisição de modelo, é o fato de a recuperação de Session não estar separada do vínculo do modelo de execução.

## 2. Objetivo

Este Todo faz apenas duas coisas:

1. Na fronteira de leitura da persistência, migrar Sessions antigas para o Model Selection atual tanto quanto possível; não reescrever o histórico em lote e não adicionar dual-write de campos antigos para rollback degradado;
2. A recuperação de Session lê apenas os campos novos já migrados. Informação que pode ser determinada é recuperada normalmente; a que não pode fica não vinculada, mas sem impedir a abertura da Session e a visualização do histórico.

Este Todo é responsável apenas pela leitura de atualização e pela recuperação de Sessions; não replica a lógica de atualização de outras áreas. O escopo do Todo 69 já foi reduzido à fronteira de compatibilidade física do rollback degradado, e sua única mudança de produção hoje é o isolamento de arquivos de Bot Config/State; ele não promete mais dual-write contínuo por área, e também não se pode concluir por ele que as migrações de atualização das outras áreas estão todas concluídas.

A conversão da identidade de Provider antigo adota uniformemente o [Todo 72](./todo-72-legacy-builtin-provider-and-model-selection-migration.md).
Nele, a identidade dinâmica do antigo Coding Plan permite converter conforme a conexão pessoal/Team selecionada na mesma Family no momento da migração; essa é uma regra de atualização da estrutura antiga, e não um fallback Account-first após a Selection atual ficar inválida. Este documento continua responsável pelo único Decoder da Session e pela recuperação não vinculada, sem adicionar entradas de conversão paralelas e sem usar campos antigos para remendar estruturas atuais já existentes.

## 2.1 Princípios comuns

Este Todo e o Todo 69 obedecem aos seguintes princípios:

1. Dados antigos são migrados tanto quanto possível;
2. Não se faz limpeza destrutiva em lote dos dados brutos antigos, mas também não se gera continuamente campos antigos; a degradação por rollback é aceita conforme o Todo 69;
3. A recuperação atual só reconhece campos novos;
4. Valores ausentes que podem ser determinados são preenchidos diretamente;
5. Os que não podem podem ficar vazios;
6. Não se substitui automaticamente uma escolha inválida; quando o Model ou Reasoning fica vazio não aparece aviso, e o estado vazio do controle expressa isso;
7. Não se pode impedir a abertura de toda a Session por corrupção dos dados de escolha de modelo.

É preciso distinguir aqui três comportamentos:

- **Migração**: quando campo antigo e campo novo podem corresponder um a um, mover mecanicamente o mesmo valor;
- **Preenchimento**: quando o novo campo pode ser determinado unicamente a partir de um mesmo fato persistido, gravar diretamente;
- **Substituição**: quando o valor original já está inválido e o sistema passa a usar outro Model, Provider ou Reasoning.

Migração e preenchimento determinístico não alteram a escolha do usuário. O plano atual não faz substituição automática de Model/Provider/Reasoning inválidos e, em vez disso, mantém não vinculado esperando o usuário escolher, sem aviso de invalidez. Configured Default, valor default das regras de modelo, `values[0]`, `values.at(-1)`, o primeiro item da lista e mensagens históricas não podem ser tratados como "valor ausente determinístico".

```text
Dados persistidos da Session antiga
        |
        v
Fronteira de leitura da persistência
├─ estrutura realmente antiga ------> converte para o Model Selection atual
└─ estrutura atual já existente -----> adota somente a estrutura atual
        |
        v
Recuperação da Session
├─ Selection completa e válida --------> vincula o Model de execução
└─ Selection ausente ou inválida -------> mantém não vinculada, abre a Session normalmente
                                      |
                                      v
                              Após o usuário escolher de novo, vincula
```

## 3. Migração de armazenamento unidirecional e escrita atual

### 3.1 Prioridade de leitura

- Existindo o Model Selection atual, ler somente os campos atuais;
- Não se usa mais o antigo `thoughtLevel`, os campos antigos de mensagem, dicas de recuperação ou qualquer outro bypass para completar a Selection atual;
- Somente quando os dados não têm nenhuma estrutura atual e podem ser claramente julgados como Session antiga é que o Decoder compatível lê os campos antigos e converte;
- Provider, Model e Reasoning que os campos antigos conseguem determinar são convertidos normalmente; a informação que a estrutura antiga não tem permanece ausente e não é adivinhada.

"Estrutura atual" não pode ser julgado apenas pela existência do campo `modelSelection`: versões antigas também podem já ter escrito esse campo, mas usando identidades `builtin:*` explicitamente antigas. Dados com formato antigo ou com base de identidade reservada são convertidos no limite de atualização conforme o Todo 72 e só então a recuperação usa a seleção atual.
A prioridade do campo atual continua valendo: converta a própria identidade que ele consiga determinar, sem remendá-lo a partir de campos antigos vizinhos como o antigo `thoughtLevel`; IDs desconhecidos comuns ou Registry temporariamente indisponível também não podem servir de base para tratar como dado antigo.

Os campos antigos só fornecem entrada de atualização no Decoder dos registros realmente antigos e não são uma segunda fonte de fato para a lógica de recuperação atual. Os campos antigos já existentes no armazenamento bruto não precisam ser removidos em lote, mas assim que a versão atual enxerga a estrutura atual precisa ignorar os campos antigos, mesmo que a estrutura atual em si seja incompleta.

### 3.2 Regras de escrita

A escrita atual continua passando pela fronteira única do Session Store:

- O Model Selection atual é o campo autoritativo;
- Só se escreve a estrutura atual, sem derivar dela aliases de mensagens antigas nem o antigo `thoughtLevel`;
- O objeto de domínio devolvido pelo Decoder atual não expõe aliases antigos;
- Os comentários em chinês do Decoder unidirecional explicam a origem da estrutura antiga e a regra de prioridade do campo atual; não se adiciona Encoder de rollback nem abstrações de compatibilidade genéricas.

Não se adiciona migração de tabela de banco de dados nem reescrita em lote de todo o histórico de Sessions. As mensagens históricas migram gradualmente na leitura e na gravação normal posterior.
Mas, se a Selection atual da Session converter com sucesso a identidade dinâmica do antigo Coding Plan, a nova identidade precisa ser fixada nesta recuperação pela entrada de salvamento existente, sem esperar o usuário enviar outra mensagem; um Reasoning que não possa ser determinado pode continuar vazio. Só se escreve a seleção atual, sem mexer na identidade das requisições históricas e sem reescrever campos antigos.
Antes da escrita vale a serialização/proteção de concorrência existente, para não sobrescrever uma escolha nova salva pelo usuário durante a recuperação; uma falha de escrita não pode reportar a migração como concluída nem por isso impedir a abertura do histórico. A falha é tratada pelo log/feedback de erro de armazenamento já existente e não é a mesma classe de erro do "vazio sem aviso".

A integração de armazenamento usa uma operação estreita `migrateLegacyModelSelection`: o Adapter reconhece a estrutura bruta antiga, a conversão de identidade é injetada pelo chamador reutilizando as regras do 72 e o Adapter não lê arquivos de conta nem adivinha a ordem do Registry.
Lê-se primeiro o candidato e obtém-se de forma assíncrona o resultado da conversão de identidade; dentro da transação de escrita o candidato e a seleção atual são reconferidos e, se já mudaram, o resultado antigo é descartado.
A entry atual existente (inclusive dados incompletos) tem prioridade sobre mensagens históricas. Só quando não há entry atual e a evidência de escolha mais recente for de fato de estrutura antiga é permitido importar a partir dessa mensagem antiga. Depois de sucesso, salva-se como entry de seleção atual existente, sem modificar a mensagem nem o tempo de atividade da Session.

O host de protocolo devolve o ID atual correspondente ao Provider antigo por meio do `session/resolveLegacyModelProvider`, usado apenas para atualização, com entrada apenas `sessionId/providerId` e sem credenciais. A requisição vincula a conexão Workspace CLI/Host que a produziu;
o Host interpreta o antigo Coding Plan com a conexão de conta do seu próprio Environment, sem encaminhar para a cadeia de resolução de preferências da UI do desktop. Um Standalone sem host de conta ainda pode converter identidades estáticas antigas, e o Coding Plan dinâmico permanece não vinculado.
Essa não é uma interface de alias de Provider para uso em execução normal: só a importação de estrutura realmente antiga a chama, e depois que a nova entry está fixada ela não é mais chamada.
Não se altera a assinatura, o roteamento de owner ou a fila de Desktop continuous / Mobile replayable, nem se deixa o celular iniciar outro Host.

## 4. Comportamento de recuperação de Session

### 4.1 Completa e válida

Quando Provider, Model e Reasoning ainda são válidos, a Seleção é restaurada como está e o Model de execução é vinculado.

### 4.2 Reasoning ausente ou inválido

Preserva-se a identidade Provider/Model ainda válida, mas a Selection é considerada incompleta:

- Limpa-se apenas o `reasoningLevel` ausente ou que já não pertença ao `values` atual, sem mexer no `providerId/modelId` ainda válido;
- Não se usa `values[0]`, `values.at(-1)` ou Configured Default para escolher o nível automaticamente;
- Não se lêem campos antigos nem mensagens históricas para adivinhar o nível;
- A Session abre normalmente;
- A UI mostra uma escolha de modelo ainda não concluída, e o usuário precisa escolher o Reasoning de novo para poder continuar a execução.

### 4.3 Provider ou Model inválido

Reutiliza-se a mesma semântica de recuperação de "Selection não vinculada":

- Não se substitui automaticamente pelo primeiro modelo do Account Provider, pelo Configured Default ou por outro candidato;
- Limpa-se o vínculo de execução não resolvível;
- A Session abre normalmente e preserva todo o histórico;
- O usuário continua depois de escolher de novo um modelo atualmente disponível.

Reasoning inválido e Provider/Model inválido não são dois sistemas de recuperação. A diferença está apenas em o primeiro ainda poder preservar a identidade do modelo, enquanto o segundo nem a identidade do modelo consegue vincular. Ambos reutilizam o mesmo Selection validator e as mesmas regras de estado vazio do controle, mas essa diferença de nível precisa ser preservada e não se pode, por causa de um Reasoning inválido, limpar a Selection inteira ou mudar para outro Provider/Model.

A recuperação histórica e o Draft ativo do Todo 71 unificam o "vazio", sem distinguir mais duas estratégias de fallback para invalidez. Quando o Model ou Reasoning fica vazio não aparece Toast, diálogo nem banner extra de invalidez, e não se mantém estado de deduplicação de notificação correspondente; o usuário completa pelo controle de seleção e continua.
O que foi cancelado é o aviso de campo vazio, não o feedback de erro normal de execução, envio ou falha de armazenamento.

### 4.4 "Não vinculada" não é um Model pela metade

Uma Selection incompleta não pode entrar no ModelFactory:

```text
Recuperação do histórico da Session
        |
        +--> pode ser concluída sozinha, sem exigir Model Ativo
        |
        `--> o usuário inicia a próxima execução
                  |
                  +-- Selection completa --> cria Model Ativo
                  `-- Selection não vinculada -> exige que o usuário complete a seleção
```

Não se pode resolver o problema afrouxando o ModelFactory, restaurando fallback do Runtime ou construindo um Model Ativo sem Reasoning.

### 4.5 Representação concreta de "não vinculada" e atribuição de estado

"Não vinculada" não é um novo formato de persistência nem um Model Ativo pela metade. Ela apenas descreve que o histórico da Session já foi recuperado mas que no momento não existe uma Selection completa que possa ser entregue ao ModelFactory:

```text
Session aberta com sucesso
├─ mensagens históricas: já recuperadas
└─ vínculo de execução
   ├─ Selection completa e válida ------> Runtime mantém a Selection completa da Session
   ├─ Reasoning ausente/inválido ------> mantém Provider/Model para o Composer corrigir
   `─ Provider/Model inválido ----------> Runtime não tem Selection da Session por enquanto
```

Restrições concretas:

- O Decoder de persistência continua devolvendo o candidato de Selection atual que ele consiga determinar recuperar; não se adiciona um campo de banco de dados do tipo `unbound: true`;
- Somente uma Selection completa e validada pelo `ModelSelectionView` atual é gravada na Session Selection do Runtime, e só essa permite criar Model Ativo;
- Quando o Reasoning está ausente ou inválido, o resultado da recuperação mantém o `providerId/modelId` ainda válido e apenas esvazia o `reasoningLevel`, como seleção pendente de correção pelo Composer; o Runtime não pode vinculá-la antecipadamente como Model executável;
- Quando Provider/Model estão inválidos, a Selection executável do Runtime e do Composer é esvaziada; a identidade original só pode servir para log de diagnóstico e não pode continuar como roteamento de requisição;
- O nível de invalidez é recalculado na recuperação com o Registry mais recente e a UI apresenta o estado vazio correspondente pelo resultado de recuperação existente; não há notificação de invalidez nem uma `selectionIssue` possivelmente desatualizada é persistida;
- A exibição do histórico na UI não depende da Selection. Só depois que o usuário escolhe novamente Provider/Model/Reasoning completos é que a Session Selection é atualizada e a execução retomada.

A implementação pode expressar esses estados com os campos opcionais e o resultado de recuperação já existentes, sem adicionar um `UnboundSelection` público, Execution Binding ou outro DTO de modelo.

Na implementação, a Session Selection do Runtime pode estar ausente, e o ponto de entrada de execução rejeita uma seleção ausente antes de chamar o ModelFactory estrito.
O campo de origem do modelo das mensagens históricas também pode estar ausente: dados antigos podem não ter origem e a linha do tempo sintética gerada pela recuperação talvez nunca tenha executado uma requisição de modelo. Não se pode forjar origem com um modelo default só para satisfazer o tipo da mensagem; a saída real do modelo continua registrando a origem a partir do Model Ativo da rodada.

## 5. Fronteiras com o comportamento existente

- Session nova e a seleção normal de modelo pelo usuário continuam gerando uma Selection completa pelas regras oficiais de seleção; este Todo não muda a regra de nível default;
- Testes de conexão, geração de título, Git e outras requisições auxiliares continuam usando o `values[0]` definido pelo Todo 67, sem relação com a recuperação de Sessions existentes;
- Um Model Ativo, uma vez criado, continua congelado; atualizações de Registry não modificam um Turn já em execução;
- Modo de sessão, conteúdo das mensagens, Compact, fila e recuperação de ferramentas não entram nesta correção de escolha de modelo;
- O Todo 69 já decidiu que Session, tempo ocioso e automação não fazem dual-write contínuo; este Todo mantém o Decoder unidirecional de Sessions antigas e não restaura a lógica de escrita degradada.

## 6. Testes primeiro

Antes de modificar o código de produção, fixar os seguintes cenários de falha:

1. Uma Session só com campos antigos pode ser convertida pelo Decoder em Model Selection atual;
2. Quando campos novo e antigo existem simultaneamente, o campo atual é o único efetivo e o antigo não pode complementar nem sobrescrevê-lo;
3. Valores da estrutura antiga que correspondem um a um são migrados mecanicamente e os campos que não podem ser determinados permanecem ausentes;
4. Quando a Selection atual está sem Reasoning, a Session abre, o histórico fica completo, Provider/Model permanecem inalterados e a execução segue não vinculada;
5. Quando o Reasoning atual já não está nos `values` do modelo, só o Reasoning é limpo, Provider/Model permanecem inalterados e o usuário precisa escolher de novo;
6. Quando Provider ou Model já não existem, a Session abre e não muda sozinha para outro modelo;
7. Depois que o usuário conclui a escolha de modelo e Reasoning, um Model Ativo pode ser criado normalmente e a conversa continua;
8. O estado não vinculado e a razão da invalidez não são gravados como um novo fato persistente; reabrir a Session depois da recuperação do Registry revalida pela View mais recente;
9. A recuperação a frio, a reconexão, o fork e a continuação de execução de uma Selection atual completa não regridem;
10. A gravação de volta usa apenas a estrutura atual, sem novos aliases de mensagens antigas; o Decoder unidirecional de registros antigos continua válido, de acordo com a fronteira de não-dual-write do Todo 69.
11. Model/Reasoning vazio não gera aviso; depois de passar pelo Composer, trocar de página ou reiniciar, a inicialização default não completa automaticamente.
12. Quando a versão antiga já tem `modelSelection` mas usando identidades antigas de builtin explícitas, a conversão funciona normalmente; identidades atuais desconhecidas não disparam adivinhação e campos antigos de bypass não preenchem valores.
13. Depois de migrar pela primeira vez para a conexão pessoal, fechar sem enviar mensagem; ao trocar para Team e abrir de novo, ainda lê a identidade pessoal já fixada (vazia se indisponível),
    sem migrar de novo para Team; falhas de escrita e novas escolhas concorrentes não são registradas como sucesso nem sobrescritas pelo resultado antigo.

Quando houver interação de Desktop, acrescentar E2E: abrir uma Session existente com Selection inválida, ver o histórico, escolher o modelo de novo e continuar enviando.

## 7. Ordem de implementação

1. Auditar todos os Decoders e pontos de entrada de codificação de Model Selection atual/antigo na Session;
2. Fixar com testes a fronteira de armazenamento "campo atual primeiro, só estrutura realmente antiga é migrada";
3. Desacoplar a recuperação do histórico da Session da criação do Model de execução;
4. Consolidar Reasoning ausente, Reasoning inválido e Provider/Model inválido na mesma semântica de recuperação não vinculada;
5. Remover da cadeia de recuperação os bypasses que completam a Selection atual a partir de campos antigos, mensagens ou outras dicas;
6. Verificar que o usuário pode continuar a execução e persistir corretamente depois de escolher de novo;
7. Verificar em conjunto com o Todo 69 que nenhuma escrita de campo antigo foi acrescentada por engano e que a entrada de atualização unidirecional de Sessions antigas não foi quebrada;
8. Executar testes direcionados, E2E, `pnpm typecheck`, `pnpm lint` e `git diff --check`;
9. Produzir o registro de implementação, listando os bypasses efetivamente removidos, as entradas de compatibilidade preservadas e os resultados reais de verificação.

## 8. Critérios de conclusão

- Nenhuma ausência ou invalidez de Model Selection impede a abertura da Session e a visualização do histórico;
- A lógica de recuperação atual consome apenas o Model Selection atual e não retransforma campos antigos em fonte de fato;
- Sessions realmente antigas ainda podem ser migradas pelo único Decoder de armazenamento;
- O sistema não escolhe Model ou Reasoning silenciosamente pelo usuário;
- Quando fica vazio não aparece aviso de invalidez, e depois de passar pelo Todo 71 o estado vazio é mantido sem preencher modelo default;
- Uma Selection não vinculada não entra no ModelFactory estrito;
- Depois que o usuário completa a escolha, pode continuar na Session original;
- A capacidade prática de rollback do Todo 69 continua válida;
- Testes, verificação de tipos, Lint, verificação de diff e E2E relacionados passam inteiramente.