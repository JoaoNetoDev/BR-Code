# Todo 72: migração de identidade das configurações de Provider Built-in antigas e da seleção de modelo

> Status: implementação e aceitação de fase concluídas (2026-09-04).
>
> Decisão posterior de 2026-09-08: a migração de Selection descrita aqui, que distinguia pessoal/Team conforme a conta atual, foi substituída por [Todo96](todo-96-selection-offline-migration-and-resolution-consolidation.md); o Coding Plan offline antigo passa a resolver para Individual do mesmo domínio, e o vínculo da conta real passa a ser responsabilidade da resolução da seleção válida. O trajeto de implementação da época é preservado abaixo; a migração das configurações reais de conexão e a complementação de OAuth/Team não são afetadas.
>
> Atualização: 2026-09-03. Origem: após a migração do `config.json` antigo de um colega, o pacote internobuilt-in apareceu incorretamente na lista de suppliers personalizados.
>
> O limite de rollback segue o Todo 69 mais recente: não manter escrita dupla contínua dos campos antigos. Este documento completa a migração de upgrade e não restaura o方案 de escrita dupla cancelado.

## 1. Problemas confirmados

Entradas `builtin:*` na configuração antiga também podem ter sido salvas como `source: "custom"`. Atualmente
`legacyPersonalProviderConfigImporter.ts` filtra principalmente por `source` e, assim, migra essas configurações
internas por completo para `standard-personal`, congelando também o Endpoint do pacote antigo, as credenciais da
conta e os membros de modelo.

Os testes existentes cobrem apenas `source: "builtin"` e não cobrem o formato desses dados reais antigos.

Além disso, a conversão de parte das Model Selections antigas apenas transporta o Provider ID. A versão antiga
compartilhava o Coding Plan ID entre pessoal e Team, e a nova versão já foi dividida em dois Providers; apenas
copiar a string não garante que a seleção migrada ainda aponte para a identidade correta.

## 2. Decisão sobre a migração da configuração de Provider

```text
config.json antigo
      |
      +-- builtin:bigmodel --> bigmodel-api: migrar apenas a API Key
      +-- builtin:zai ------> zai-api: migrar apenas a API Key
      +-- outros builtin:* ---> não importar configuração de Provider antiga
      +-- outras configurações confirmadas de conta/sistema --> não importar configuração de Provider antiga
      `-- Providers realmente personalizados --> manter as regras de migração personalizada já estabelecidas

Built-in / Template atuais + dados de Account atuais
      `--> fornecem o nome interno, Logo, configuração de API, modelos e fatos de pacotes
```

- Identificar primeiro a identidade de Provider reservada pelo sistema antigo e só então tratar o `source`; `source: "custom"` não pode sobrescrever a identidade interna.
- A única configuração antiga preservada para a API interna é a API Key não vazia. Nome antigo, URL, Schema, Headers, endereço de gerenciamento, estado de habilitação, membros de modelo, ordenação, Context e outras Model Rules não são migrados.
- A API Key vai para a configuração Personal correspondente ao `bigmodel-api` / `zai-api` atual. Reutiliza-se o modo de estabelecimento de Template atual; uma identidade atual ou vínculo de Template exigido não é cópia de campo antigo, e não se deve copiar toda a configuração estática do Template por causa disso.
- Sem API Key, não se cria cópia personalizada nem se grava Key vazia sobrescrevendo um valor válido existente.
- Token de pacote, JWT, Headers dinâmicos e estado antigo da conta não são migrados para Personal; são fornecidos novamente pela cadeia atual de credenciais da conta.
- Providers realmente personalizados continuam migrando configuração de chamada, membros/ordem de modelos e Context Window legítimo; as demais capacidades de modelo são descartadas conforme as regras estabelecidas.
- A identidade interna não é determinada pelo nome de exibição nem pela URL. Um Provider personalizado com UUID não pode ser apagado por engano mesmo que se chame "智谱" ou "ZCode".
- O `config.json` antigo permanece como está; não se gera backup, não se restaura o fallback de `model-providers.json` e não se adiciona compatibilidade com versões intermediárias não publicadas.

Este tratamento é para a primeira importação do arquivo antigo. Um `provider_config.json` já gerado não pode ser sobrescrito por nova importação, nem podem entradas "suspeitamente internas" ser apagadas por varredura de nome. **Configurações de usuários que já foram migradas incorretamente recebem apenas correção manual; não se escreve código de correção automática específico.**
Este Todo não varre, apaga nem reseta automaticamente novas configurações já existentes; não se pode afirmar que corrigir a primeira importação corrigirá automaticamente os dados desses usuários.

## 3. Como migrar seleções de modelo já persistidas

### 3.1 Identidades que podem ser mapeadas diretamente

- `builtin:bigmodel` → `bigmodel-api`.
- `builtin:zai` → `zai-api`.
- `builtin:bigmodel-start-plan` → `account:bigmodel-start-plan`.
- `builtin:zai-start-plan` → `account:zai-start-plan`.
- Providers realmente personalizados mantêm o ID original, em一致ência com o resultado da migração da configuração de Provider.
- `builtin:zapi`, já aposentado e sem identidade atual correspondente, permanece sem vínculo; não se cria um Provider personalizado para forçar uma identidade.

### 3.2 O Coding Plan antigo cai no Provider concreto conforme a conexão de conta atual no momento da migração

O Coding Plan ID antigo expressa o Coding Plan atualmente em uso na mesma Family, e a seleção antiga continua utilizável ao alternar entre pessoal/Team.
Por isso adotamos aqui a decisão mais recente do usuário, **permitindo usar a conexão de conta atual no momento da migração**, sem exigir a recuperação da identidade pessoal/Team da época.

```text
builtin:<family>-coding-plan antigo
                 +
conexão de conta atualmente selecionada no mesmo ambiente e na mesma Family
                 |
                 +-- pessoal --> account:<family>-individual-coding-plan
                 +-- Team --> account:<family>-team-coding-plan
                 `-- indeterminável --> vazio/sem vínculo; os dados principais ainda podem ser abertos
```

- `<family>` é apenas `bigmodel` ou `zai`; não é possível escolher a conta atravessando Families.
- Usa-se o estado autoritativo da conexão de conta existente, sem escrever um conjunto separado de prioridade "se houver Team, escolha Team" e sem adivinhar pelo primeiro item da lista de modelos.
- A identidade de organização/pacote do Team continua pertencendo à conexão de Account; credenciais de conta ou campos de Team não são colocados dentro de ModelSelection.
- Esta é uma regra de upgrade para uma identidade dinâmica antiga, e não um fallback Account-first do runtime atual. Depois de migrada e salva como nova identidade, a restauração normal reconhece apenas os campos novos e não reinterpretar os campos antigos a cada troca de conta.
- Quando a conta não está autenticada ou a conexão ainda não está clara, não se bloqueia a abertura do histórico, não se adiciona uma barreira de espera infinita pela autenticação; o controle de seleção fica vazio, permite reselecionar e não exibe aviso de valor vazio.
- A identidade antiga não é adivinhada a partir do Default configurado, de outra Family, de um modelo com o mesmo nome ou de qualquer Provider executável.

Após a conversão bem-sucedida da identidade dinâmica, a nova Selection é fixada no ponto de salvamento já existente do registro correspondente. A Session salva a seleção atual durante este restauro bem-sucedido, sem esperar o próximo envio; a importação de arquivo fixa na primeira escrita do novo arquivo. Reasoning vazio não impede que Provider/Model já confirmados sejam fixados.
Não se reescreve a identidade de requisições históricas nem se reescreve o histórico em massa; a escrita deve proteger as seleções do usuário atualizadas no interim. Falhas mantêm o tratamento normal de erro de armazenamento, não alegam migração concluída, não bloqueiam a abertura do histórico e não criam outro agendador de migração.

### 3.3 Campos, modelos e Reasoning atuais

- Quando já existe uma ModelSelection atual, os campos atuais prevalecem e não são sobrescritos por campos antigos por serem incompletos. Não é possível julgar antigo/novo apenas pelo nome do campo: a versão antiga também pode já ter escrito `modelSelection`, e uma ID interna antiga explícita ali presente ainda precisa ser convertida no limite de upgrade. A conversão usa apenas a identidade da própria seleção e o contexto de conta permitido nesta seção, sem completar valores a partir de campos antigos vizinhos; uma ID desconhecida comum ou falha de busca no Registry não constituem evidência de formato antigo.
- Preservar os IDs de modelo que possam ser confirmados; quando o Provider de destino não oferece o modelo, manter sem vínculo e não copiar membros de modelos internos antigos para forçar o atendimento da seleção.
- O Reasoning que o campo antigo consiga determinar com segurança é convertido em um Decoder unidirecional. Quando o campo novo está ausente ou inválido, deixar vazio conforme o Todo 70, sem escolher sorrateiramente `values[0]`, `values.at(-1)` ou outro nível.
- As informações de chamada realmente registradas nas mensagens históricas são tratadas separadamente da seleção da próxima execução; não se reescreve "Team está selecionado agora" como "a requisição histórica realmente usou Team".
- Modelo/Reasoning irrecuperáveis ficam vazios, sem substituição automática e sem Toast, modal ou banner extra de invalidez; não se pode recusar abrir a Session inteira ou a lista de tarefas por causa de falha de vínculo. Falhas de execução reais mantêm o retorno de erro normal.

## 4. Escopo de implementação e fronteiras de reuso

Primeiro mapear os formatos antigos reais em cada ponto e depois reutilizar funções de conversão de identidade de escopo pequeno; elas servem apenas à entrada de migração e não viram tabela de aliases de runtime nem um segundo Registry.
Entradas que precisam da conexão de conta recebem explicitamente o contexto de migração já resolvido, sem deixar o armazenamento底层 ler diretamente o estado global de UI.

Interface de implementação: a função de migração compartilhada converte apenas o Provider ID antigo e recebe explicitamente o `ZCodeAccountAccess` resolvido pelo serviço de contas do ambiente atual (que pode ser nulo); não lê disco, não espera autenticação e não consulta nem varre o Registry.
IDs atuais comuns são entregues como estão à validação de cada domínio, e `builtin:*` desconhecido retorna sem vínculo. A validade dos membros de modelo e do Reasoning continua sendo julgada pelo domínio de pertencimento usando o Registry de destino. O contexto de conta segue as regras de identidade e conexão do `resolveCurrentAccountAccess` existente; não se pode tratar uma preferência de Family apenas salva como um fato de conta autenticada.

Verificar item a item os pontos de persistência abaixo, registrando se já há conversão, as lacunas e os testes correspondentes; não é permitido corrigir apenas a importação da configuração de Provider:

- Provider Config: corrigir a classificação de identidades internas e a exceção de API Key das APIs internas.
- Account Settings: conferir a conversão da seleção de conexão antiga, garantindo que a migração do Coding Plan obtenha a conexão atual correta da mesma Family.
- Session: de responsabilidade do Todo 70 o Decoder único, a prioridade dos campos atuais e o restauro sem vínculo; este documento fornece as regras de conversão de identidade e não adiciona um Decoder paralelo.
- Definições de automação e Run: conferir o formato antigo de seleção de modelo; o `provider` antigo pode representar o backend de Agent e não pode ser tratado diretamente como ID de Provider de modelo.
- Tarefas ociosas: preservar a semântica exclusiva de Provider/credenciais de operação ociosa e não migrar mecanicamente a seleção de execução para um Coding Plan comum; quando for indeterminável, manter a tarefa, deixar a seleção vazia e não exibir aviso de valor vazio; não é permitido entregar uma seleção incompleta à execução do modelo.
- Subagents internos/personalizados: cobrir seleções antigas explícitas no arquivo de estado e no Markdown; a semântica de herança permanece inalterada.
- Bot Config/State: integrar a importação única de v3 do Todo 69, sem sobrescrever mais os arquivos antigos diretamente.
- Wiki, Default configurado, Recent e Drafts que realmente tenham formato antigo persistido: conferir os Reader reais; não é possível assumir migração automática só porque o tipo é compartilhado.
- Ambiente remoto: usar a configuração e o contexto de conta desse ambiente; não se pode usar a conexão de outro ambiente para vincular a identidade de uma seleção histórica.

Cada entrada precisa distinguir "migração de estrutura antiga" de "campo atual corrompido". Quando não há identidade antiga confiável, deixar vazio e não adicionar atalhos como correspondência única por nome de modelo.
Comentários de migração novos ou ajustados são escritos em chinês, explicando a origem do formato antigo, o limite da leitura única e que os dados antigos são preservados para rollback e não como fonte de verdade atual.

### Relação com Todo 69 / 70 / 71

- Todo 69: limite de rollback de downgrade, isolamento dos arquivos de Bot; os demais domínios não mantêm escrita dupla contínua.
- Todo 70: Decoder de upgrade de Session e restauro sem vínculo, adotando as regras de identidade deste documento.
- Todo 71: Draft/Submission atuais do Composer; não assume a inferência de identidades de Provider antigas.
- Todo 72: classificação da configuração de Provider, conversão de identidades antigas e verificação de integração em cada ponto de persistência.

Na implementação, determinar primeiro as entradas e os testes da conversão compartilhada e depois conectar os pontos de armazenamento de cada Todo; se a tarefa relacionada já estiver implementada, reutilizá-la diretamente e não criar uma camada de migração duplicada.

Ordem de execução conjunta:

```text
68 encerramento: consistência de modelos na execução
        |
72 base: classificação de Provider, API Key, conversão de identidades antigas e contexto de conta
        |
69: primeira importação de Bot v3 conectada diretamente à conversão correta
        |
70: restauro sem vínculo de Session, escrita de volta da identidade dinâmica
        |
71: Draft persistente, Submission, unificação de valor vazio sem aviso
        |
72 segunda metade: verificação de integração nos demais domínios, validação conjunta de upgrade/restart/rollback e relatório de implementação
```

A primeira importação de Bot/Session precisa ser aceita depois que a conversão final de identidade estiver integrada; não se pode escrever o arquivo novo primeiro e depois depender da releitura do arquivo antigo, já proibida, para corrigir a identidade.

## 5. Testes e aceitação

Escrever os testes primeiro e depois alterar a implementação. Criar fixtures anonimizados com base na estrutura do anexo de um colega, usando valores falsos para todas as Keys e sem versionar credenciais originais nem informações de contas privadas.

- Uma ID interna com `source: "custom"` ainda não gera pacote personalizado; um Provider personalizado real com UUID não é afetado.
- A API interna deixa apenas a Key e o Template atual fornece o restante da configuração normalmente; Key vazia não sobrescreve uma configuração válida.
- Após a primeira importação o arquivo antigo não é reescrito; um novo carregamento não importa de novo nem sobrescreve edições Personais atuais.
- Cobrir pessoal, Team e ausência de conexão de conta explícita para BigModel/Z.ai; validar a identidade dos modelos e os resultados sem vínculo, olhando apenas se o fornecedor aparece na página não é suficiente.
- Em conflito entre campos novo e antigo, o novo prevalece; quando o modelo não existe ou o Reasoning está ausente/inválido, o histórico de Session e a lista de tarefas ainda abrem.
- Identidades internas antigas explícitas no `modelSelection` antigo também são convertidas; não é possível，判断 indevidamente que a migração está concluída só porque o campo existe.
- Seleção vazia não exibe aviso e não é completada com valor padrão pela inicialização do Composer ou pelo restauro após restart.
- Arquivos novos de Provider existentes permanecem inalterados e não iniciam migração de correção automática; usuários já migrados incorretamente passam por tratamento manual.
- Cada ponto de persistência tem teste direcionado, em especial o backend antigo de automação, a identidade exclusiva de operação ociosa, o Bot v3 e a seleção explícita de Subagent.
- E2E de interação cobre a lista de fornecedores após o upgrade da configuração antiga, o uso da API e a abertura de sessões antigas/re-seleção para continuar; atualizar sincronamente as asserções antigas que conflitam com as decisões acima.
- O rollback valida apenas o escopo de leitura prometido pelo Todo 69 e não reexpande "sem escrita dupla contínua" em restauração precisa de todas as novas seleções.

Após a execução, gerar um relatório de implementação: listar o resultado de cada entrada, os comandos/resultados de validação reais, os itens não verificados e as questões que precisam de decisão.
Defeitos determinados são corrigidos diretamente; mapeamentos de identidade que não possam ser determinados com naturalidade são discutidos primeiro, sem usar suposições de fallback para forçar a aprovação. Migrações incorretas já existentes recebem apenas correção manual e não entram como pendência de correção automática deste Todo.

## 6. Checklist de execução

### Primeira metade: base de migração anterior a 69 / 70

- [x] anonimizar a configuração antiga real e adicionar testes de classificação/API Key.
- [x] corrigir a primeira importação de Provider no Desktop e no Standalone; a CLI permite Key vazia na configuração antiga.
- [x] concluir a conversão de identidades antigas e os testes de contexto de migração pessoal/Team; a integração do salvamento de cada domínio segue a segunda metade e os itens 69/70.

### Segunda metade: integração nos domínios após 69 / 70 / 71 e aceitação conjunta

- [x] integrar/verificar item a item os pontos de persistência acima, sem duplicar o que já existe em Todo 69/70/71.
- [x] validar que a identidade dinâmica é fixada no limite de escrita já existente; fechar e trocar a conexão de conta não reinterpreta a seleção já migrada.
- [x] executar os testes unitários relacionados, o E2E de interação, typecheck e lint.
- [x] revisar se restaram atalhos de runtime para campos antigos, substituições silenciosas, vínculos entre ambientes e escritas no arquivo antigo.
- [x] gerar o relatório de implementação e versionar as alterações validadas.
