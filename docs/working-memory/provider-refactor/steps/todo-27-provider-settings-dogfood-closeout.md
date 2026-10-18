# Todo 27: Encerramento das lacunas de experiência e de execução real das Provider Settings

> Status: concluído (encerramento automatizado; a reverificação real em macOS aguarda a inicialização da mais recente cadeia de desenvolvimento)
>
> Data: 2026-08-27
>
> Pré-requisitos: depois que o Todo 26 concluir a troca de contrato do `access.type + access.mode` da Zhipu, tratar o
> encerramento do Schema de Runtime Headers descrito neste documento. Os demais recortes de UI e de estado do Team Plan
> podem ser implementados de forma independente.

## 1. Objetivo e escopo

Este documento encerra os problemas que, após a primeira rodada de experiência real em macOS do Provider Refactor,
continuavam pendentes e já foram decididos:

1. Expressar com uma representação visual unificada o valor Efetivo das folhas booleanas do Model Config e a origem
   do Personal Overlay;
2. Remover todas as entradas de restauração de campo único, mantendo apenas a restauração de nível de modelo
   "restaurar tudo para o padrão", sempre visível;
3. Unificar o sucesso de salvamento e o sucesso de conexão do modelo na área de notificação do rodapé da janela;
4. Corrigir o diagnóstico incorreto de estado do Team Plan e a inconsistência do protocolo de Account Access durante a
   requisição;
5. Completar a prova automatizada e a regressão real para todos esses comportamentos.

Este documento não trata do mecanismo de atualização de Personal Config / Provider Registry entre processos. Esse problema
envolve Host, Agent, file watcher, confirmação de revision e consistência antes da execução; deve ser concluído em uma
pesquisa e em um Todo próprios, sem introduzir polling temporário ou fallbacks de UI no teste de conexão.

Os seguintes problemas de experiência já foram resolvidos e não serão implementados novamente:

- nomes duplicados no histórico não bloqueiam mais o salvamento de Providers sem relação;
- um Provider incompleto pode ser salvo, mas não executado;
- arrastar linhas inteiras de Provider / Model, o retorno elástico do arrasto e o arrasto que atravessa o Dialog já foram
  corrigidos;
- ativar/desativar Provider foi fundido em um único botão de estado;
- valores herdados de Context, Max Output e JSON usam placeholder;
- o JSON usa uma caixa de texto de altura fixa, com o conteúdo rolando dentro da caixa;
- o Model Dialog e o container de duas colunas do Provider têm altura estável e rolagem independente;
- Providers nacionais aparecem em primeiro lugar no Built-in Config e no menu de adição.

## 2. Expressão unificada dos campos booleanos

### 2.1 Dois fatos ortogonais

Cada folha booleana editável expressa dois fatos que não se substituem:

```text
checked / unchecked
└─ o valor booleano do Effective Model Config atual

borda normal / borda de alta saturação
└─ o valor atual é resultado de herança / existe uma folha explícita de Personal Overlay
```

Não é permitido usar textos adicionais como "padrão" ou "modificado". O Personal Overlay é expresso apenas por
estilo: quando existe uma folha Personal explícita, a caixa de opção externa e a borda do Checkbox interno usam uma
saturação mais alta; valores herdados usam a borda normal.

"Modificado" é determinado pela existência da folha na Personal Model Config Rule esparsa, e não por inferência via
`personalValue !== inheritedValue`. Quando o usuário grava explicitamente um valor igual ao valor atual do Built-in, isso
continua sendo um Personal Overlay.

### 2.2 Escopo dos componentes

Tipo de entrada, tipo de saída e capacidades do modelo usam uniformemente o mesmo componente de opção booleana, tamanho,
Checkbox e estilo de estado:

```text
properties.input_format.support_*
properties.output_format.support_text
properties.supportsToolCall
properties.supportsJsonSchemaOutput
properties.supportsNativeWebSearch
properties.supportsMidConversationSystem
requiresMfjsToolSchema
```

O Text bloqueado expressa apenas que não é editável: mantém o ícone de cadeado e o estilo normal de herança, sem usar
borda de alta saturação para fingir um Personal Overlay.
PDF e Audio continuam ocultos e são preservados sem perdas ao editar outros campos.

## 3. "Restaurar tudo para o padrão" em nível de modelo

Remover os pequenos botões de restauração ao lado de campos individuais como Context, Max Output, formato de entrada,
capacidades do modelo e outros. O Model Dialog Footer passa a ter apenas uma entrada "Restaurar tudo para o padrão",
sempre exibida para modelos de membros Built-in e de Personal Provider:

```text
ZCode Built-in Model Config Rules
                  |
                  v
       Personal Model Config Rule (Overlay esparso)
                  |
                  v
        Effective Model Config
```

Os modelos de Personal Provider também são primeiro resolvidos pelas Built-in Model Config Rules genéricas e só então
sobrepostos pela Personal Rule, portanto também possuem uma baseline herdada restaurável.

A semântica do botão é fixa: limpar o Personal Model Config Overlay completo do `providerId + modelId` atual e voltar a
exibir os valores Efetivos resolvidos pelas Built-in Rules; ele não remove Provider, membros de modelo, Model ID, ordem
dos modelos nem ordem dos Providers. Sem nenhum Personal Overlay o botão permanece visível, porém desabilitado; fica
habilitado quando existe qualquer folha Personal explícita. A limpeza altera apenas o rascunho do diálogo, e o
commit atômico continua sendo feito por "Salvar"; cancelar não deve fazer commit.

## 4. Feedback de sucesso em nível de janela

O feedback de salvamento de Provider/Model e de conexão de modelo entra uniformemente na camada de notificações do
rodapé da janela do aplicativo, e não na área de conteúdo do Provider, na lista de modelos ou no topo da página:

```text
Application viewport
┌─────────────────────────────────────────────┐
│                                             │
│         Provider Settings scroll area       │
│                                             │
│                         ┌─────────────────┐ │
│                         │ mensagem de     │ │
│                         │ sucesso mais    │ │
│                         │ antiga          │ │
│                         ├─────────────────┤ │
│                         │ mensagem de     │ │
│                         │ sucesso mais    │ │
│                         │ recente         │ │
│                         └─────────────────┘ │
└─────────────────────────────────────────────┘
```

- a mensagem mais recente fica fixa na parte inferior, e mensagens diferentes se empilham para cima;
- não exibir o texto `dirty`; saving, success e failure do mesmo alvo de salvamento usam a mesma chave estável e são
  substituídos no lugar;
- saving não desaparece sozinho, success permanece por pouco tempo e failure permanece por mais tempo, oferecendo
  retry/fechar;
- o sucesso de salvamento de Provider precisa permitir identificar o Provider correspondente; as mensagens de salvamento
  de modelo e de conexão de modelo devem exibir o Model ID e, para modelos homônimos, mostrar também o nome ou o ID do
  Provider;
- mudanças na quantidade de Providers/modelos e a rolagem dos painéis esquerdo e direito não podem deslocar a posição
  da notificação;
- o container de Toast deve estar totalmente dentro do viewport; o desvio para o título do topo não deve ser aplicado
  mecanicamente ao container do rodapé.

O componente de notificação precisa reutilizar a infraestrutura existente de feedback em nível de janela; se a
infraestrutura atual não suportar empilhamento e substituição, deve-se estender o mesmo store, sem criar um segundo
conjunto privado de estado de Toast para Provider Settings.

## 5. O estado do Team Plan deve distinguir desconhecido de indisponível

Atualmente a página do Team Plan funde os dois fatos a seguir em `teamPlanUnavailable`:

```text
a API Key do projeto é explicitamente julgada unavailable pelo servidor
                         +
a quota do Team não tem snapshot / está em requisição / a requisição falhou
                         |
                         v
              "plano de equipe não alocado"
```

Isso reporta incorretamente "ainda não temos o fato" como "o servidor já confirmou indisponibilidade". Pior: o cartão de
status usa esse resultado para bloquear as atualizações seguintes de Usage entitlement, criando um auto-bloqueio: na
primeira vez sem quota -> exibe não alocado -> não atualiza mais -> sempre não alocado.

O estado precisa ser dividido:

```text
checking / unknown / request-failed
└─ não deve exibir "plano de equipe não alocado" e não deve impedir retry ou refresh

explicit unavailable
└─ só exibe "plano de equipe não alocado" quando a resposta autoritativa da API Key do projeto ou da quota indica
   explicitamente indisponibilidade

available
└─ exibe o estado conectado/comprado e permite que o Account Overlay seja publicado normalmente
```

A UI não deve forçar `enabled=true` no Provider só porque a Team quota teve sucesso, nem montar o Account Overlay por
conta própria. O Account Resolver continua sendo o único projetor do estado executável do Provider; este recorte apenas
corrige a máquina de estados de exibição e o gate de atualização.

## 6. Runtime Headers usa o Schema oficial do Registry Access

A causa direta das falhas de requisição do Team Plan em máquina real não é o plano inexistente, mas o fato de a
requisição de Runtime Headers enviada pelo Agent carregar o `providerConfig.access` completo do Registry, enquanto o
App Protocol usa outro Schema escrito à mão com um subconjunto estrito. Depois que os dois Schemas divergiram, o
Protocol rejeitou os parâmetros antes de a requisição do modelo ser enviada, e no final apenas apareceu
`Model request failed`.

Depois do Todo 26, o `accountAccess` da requisição de Runtime Headers precisa reutilizar diretamente o ramo `zhipu-account`
correspondente ao Schema oficial de Provider Registry Access, sem manter mais `{ type, family, planKind }` nem outras
projeções escritas à mão:

```text
Effective Provider Config.access
          |
          | mesmo Schema oficial / mesma forma de serialização
          v
Runtime Headers request.accountAccess
          |
          v
o Host obtém o material de período de requisição por family + mode
```

Este recorte não deve:

- afrouxar o Protocol com `.passthrough()` para engolir campos desconhecidos;
- manter um DTO de Access em cada um dos lugares Adapter, Protocol e UI;
- gravar de volta no Provider Config materiais de validação de segurança, Ticket, JWT ou Headers temporários;
- inferir o Access Mode a partir do Provider ID, Model ID, Endpoint ou pathname.

A requisição de Runtime Headers continua carregando apenas os fatos estáticos de Access necessários para localizar e
explicar esta requisição de autenticação; o Secret real de período de requisição é devolvido pela resposta do Host e
vinculado a aquela requisição de modelo.

## 7. Ordem de implementação

```text
Todo 26: troca de contrato Access Type/Mode
                 |
                 v
Runtime Headers Schema reutiliza o Access oficial
                 |
                 v
regressão de requisição real do Team Plan

unificação do estilo do Overlay booleano
                 |
                 v
restauração de padrão em nível de modelo
                 |
                 v
feedback de sucesso em nível de janela

a divisão da máquina de estados do Team pode ser implementada em paralelo de forma independente
```

Cada recorte começa com um teste que falha e depois faz a alteração mínima no código de produção. Se os testes
revelarem que é preciso alterar a semântica de Config, Overlay, Registry ou de seleção de modelos além do que está
neste documento, pare a implementação e peça uma decisão.

## 8. Plano de testes

### 8.1 UI e Overlay

- entrada, saída e capacidades do modelo usam o mesmo DOM de Boolean option e o mesmo estado visual;
- checked é determinado apenas pelo valor Efetivo, e o estilo Personal apenas pela existência de folhas esparsas;
- quando o valor explícito é igual ao herdado, o estilo Personal continua sendo exibido;
- campos de Text bloqueados mantêm o estilo normal; PDF / Audio são preservados sem perdas;
- não existe nenhum botão de restauração de campo único;
- "Restaurar tudo para o padrão" existe sempre para modelos Built-in e Personal, e fica desabilitado sem Overlay;
- depois de restaurar tudo, a Personal Model Config Rule completa é limpa, cancelar não faz commit e, após salvar, a
  herança das Rules Built-in genéricas/específicas é restaurada.
- as duas áreas de edição de JSON complexas usam apenas a borda da própria caixa de altura fixa, sem borda externa,
  fundo ou padding adicionais; o grupo "Outras configurações" é exibido antes do MFJS.

### 8.2 Salvamento e feedback de sucesso

- o feedback de salvamento de Provider/Model e de conexão de modelo é exibido na parte inferior da barra de detalhes do
  Provider à direita e não acompanha a rolagem do conteúdo;
- dirty não é renderizado; saving, success e failure usam a mesma chave e se substituem, failure permanece por mais tempo
  e permite retry/fechar;
- as mensagens de salvamento de modelo e de conexão de modelo contêm o Model ID, e modelos homônimos contêm a
  identidade do Provider;
- várias mensagens diferentes se empilham para cima e mensagens repetidas são substituídas;
- a rolagem dos painéis esquerdo/direito do Provider, listas longas de modelos e o layout móvel não alteram a âncora da
  notificação;
- os temas claro/escuro, os idiomas zh/en e o comportamento de fechamento por teclado são consistentes.
- Nome do Provider, Base URL e API Key compartilham um temporizador de salvamento ocioso durante a digitação contínua,
  com flush imediato ao perder o foco e sem envio duplicado;
- o Model Metadata Dialog continua sendo controlado por salvamento/cancelamento explícitos, sem que o salvamento ocioso
  quebre a fronteira transacional.

### 8.3 Team Plan

- quota ausente, loading e falha de requisição não exibem "plano de equipe não alocado" e permitem refresh;
- somente unavailable autoritativo exibe não alocado; available restaura o estado normal;
- a troca de estado não é feita pela UI modificando diretamente o enabled do Provider;
- o Registry Access completo de `zhipu-account/team-coding-plan` passa pela validação estrita do Protocol;
- os parâmetros de Runtime Headers de Start, Individual, Team e Off-Peak estão todos de acordo com o contrato de Mode do
  Todo 26;
- a requisição do Team Plan obtém com sucesso o material de período de requisição antes da chamada de rede do modelo;
  quando o material está ausente, retorna um erro de autenticação preciso, e não um erro de Schema.

### 8.4 Limites de regressão

- um Provider `api-key` comum não entra na cadeia de requisição de Runtime Headers;
- o Account Overlay, as restrições de modelo da conta Start e os membros do Provider Registry não são modificados pela
  máquina de estados da UI;
- Desktop local e Web Remote continuam recebendo o material de período de requisição do Environment Host de destino;
- a semântica de congelamento de Modelos Ativos já criados não muda;
- arrastar de Provider / Model, rolagem independente, máscara do Dialog e editor de JSON de altura fixa não regridem.

## 9. Critérios de conclusão

- todas as configurações booleanas de modelo em Settings têm aparência unificada e expressam com precisão a origem do
  Personal Overlay;
- existe apenas uma entrada sempre visível de restauração de padrão em nível de modelo;
- o feedback de sucesso de salvamento e de conexão fica ancorado de forma estável na parte inferior da barra de detalhes
  do Provider à direita, e as mensagens de sucesso de modelo carregam a identidade;
- os campos de texto do Provider suportam simultaneamente salvamento ocioso e salvamento imediato ao perder o foco, sem
  gerar escritas duplicadas;
- o Team Plan não reporta mais desconhecido ou falha de requisição como não alocado, nem se autobloqueia na atualização;
- a requisição de Runtime Headers do Team Plan reutiliza estritamente o Schema oficial de Registry Access e consegue
  concluir uma requisição real de modelo;
- testes unitários direcionados, `pnpm typecheck`, `pnpm lint`, E2E de UI afetados e regressão real em macOS passam;
- não se cria um segundo conjunto de fatos sobre Model Config, Account Access, Registry, Toast ou estado de conexão.

## 10. Resultado da implementação

- Formatos de entrada/saída, campos de capacidade e MFJS usam uniformemente o mesmo Boolean Model Option; o valor
  Efetivo determina checked, e a folha Personal esparsa é expressada apenas pela moldura externa de alta saturação e
  pela borda do Checkbox, com o Text bloqueado sem se passar por Personal;
- Todas as entradas de restauração de campo único foram removidas; o "Restaurar tudo para o padrão" em nível de modelo é
  sempre exibido, desabilitado sem Overlay, e no commit limpa atomicamente o Personal Model Config completo daquele
  modelo sem remover membros nem identidade;
- O salvamento de Provider/Model e a conexão de modelo foram concentrados na faixa inferior da barra de detalhes do
  Provider à direita; saving, success e failure do mesmo objeto são substituídos no lugar por chave, objetos diferentes
  se empilham para cima e as mensagens de modelo contêm a identidade de Provider/Model; dirty não é mais exibido, falha
  é estendida para oito segundos e oferece retry ou fechar;
- Os rascunhos de texto de Nome do Provider, Base URL e API Key são salvos automaticamente após 800ms sem digitação,
  com flush imediato ao perder o foco, ao pressionar Enter ou na troca; há um único temporizador por Provider e nenhum
  reenvio do mesmo rascunho, e o salvamento ocioso não dispara durante a composição do IME em chinês;
- As duas áreas de edição de JSON complexas tiveram borda externa, fundo e padding duplicados removidos, mantendo apenas a
  caixa de altura fixa; o switch MFJS foi movido para a seção "Outras configurações";
- A máquina de estados do Team Plan diferencia loading, erro de requisição e unavailable explicitamente confirmado pelo
  servidor; a página de detalhes não bloqueia mais o entitlement refresh com o estado "não alocado", eliminando o
  autobloqueio permanente após a primeira ausência de quota;
- A requisição de Runtime Headers usa diretamente `zcodeProviderAccountAccessSchema`. Os cinco Registry modes — API
  Key, Start, Individual, Team e Off-Peak — passam pelos testes estritos do Protocol, e o formato antigo `planKind` é
  rejeitado;
- A página de configurações, o Usage e a restauração de login não usam mais o `zcodeAccountAccessSchema` dinâmico para
  fazer o parse do Registry Access. A UI transmite apenas os fatos estáticos `{ type, family, mode }`, e o Account
  Request Auth Service do Host resolve o `planKind` dinâmico e o escopo de Team com base na conexão atual; a Team usage
  source é combinada do mode estático `team-coding-plan` com o fato de projeto inscrito, sem gravar a identidade do
  projeto de volta no Provider Config;
- O agrupamento de seleção de modelo e a resolução de credenciais do Official MCP também migraram para o Schema
  oficial estático de Registry Access. O Official MCP resolve a conexão dinâmica atual no limite de chamada do Host e
  inclui as duas Account Access (antes e depois) na verificação de consistência; quando o mesmo Family habilita plano
  comum e Off-Peak simultaneamente, Settings e Usage resolvem pelo Provider ID exato e não exigem mais "Provider único
  sob o Family";
- A entrada duplicada de JSON de Token de saída máxima do Bugfix 03 também foi removida, e a única entrada numérica
  produz deterministicamente um `LimitOptionSpec` completo a partir do limite herdado;
- A pré-visualização da Config Rule de um novo Personal Model serve apenas como `inheritedConfig` e placeholder de
  entrada, sem ser preenchida de volta como input do usuário; no commit, o context, os formatos de entrada/saída e as
  capacidades fornecidos pelas regras Built-in genéricas não são gravados por engano como Personal Overlay;
- Os testes direcionados de UI, Team Plan, Shared Protocol, Model Selection e Official MCP passaram; o `pnpm typecheck`
  e o `pnpm lint` da raiz passaram (o lint mantém apenas 34 warnings já existentes no repositório), e a verificação de
  formatação dos arquivos alterados nesta rodada passou;
- A suíte Unit completa teve `12,463 passed / 25 skipped`; apenas dois casos do Server CLI ZIP, sem relação com esta
  rodada, falharam com `ENOENT` ao iniciar um comando externo porque o executável `zip` não está instalado no host
  atual; não houve falhas na regressão de Provider/Model/Account/Settings;
- O Linux Desktop E2E concluiu a build, mas o host não tem `xvfb-run`, e o Electron saiu antes de entrar nas asserções
  dos casos. Esse bloqueio de ambiente e a reverificação real em macOS na mais recente cadeia de desenvolvimento não são
  falsificados como aprovação automatizada e continuam como itens de verificação real antes do lançamento.