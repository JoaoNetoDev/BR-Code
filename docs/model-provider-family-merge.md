# Z.ai / BigModel Provider Family Merge

> Fonte do plano histórico e do comportamento de staging; não é o contrato atual da estrutura de dados de Provider. Auditoria de restauração de 2026-09-06:
> atualmente são usados `providerFamilyDomain` / `providerFamilyConnectionSelections`; os Providers de conta foram
> divididos em Start, Individual e Team, e a API comum é criada por Template. Os trechos abaixo sobre o antigo
> `builtin:*`, mode/selectedKey, cache de Provider Key e troca automática da seleção da sessão não podem servir
> como base para restaurar a arquitetura antiga.
> O comportamento de produto mantido nesta rodada é o menu de conexão da Family, a consulta independente de
> entitlement do Start e o atalho de contagem.
> Adaptações específicas e comportamentos em aberto estão na [tabela de auditoria do Todo 85](working-memory/provider-refactor/plan/staging-conflict-restoration-audit.md).

## Objetivo

Z.ai e BigModel hoje expõem seis ids de model provider built-in:

```txt
builtin:zai
builtin:zai-start-plan
builtin:zai-coding-plan
builtin:bigmodel
builtin:bigmodel-start-plan
builtin:bigmodel-coding-plan
```

A experiência de produto deve fundi-los em duas provider families voltadas ao usuário:

```txt
Z.ai
BigModel
```

Os seis provider ids precisam continuar sendo as identidades de runtime e de persistência. Eles são
usados por configs de provider salvos, refs de modelo de tarefas históricas, sincronização do
provider registry, valores de seleção de modelo, credenciais derivadas de OAuth, verificações de
cota, logs e roteamento do agent runtime. Esta mudança funde apenas o modelo de seleção de
provider voltado ao usuário.

## Mapeamento de Provider Family

```txt
Z.ai
├─ API Key     -> builtin:zai
├─ Start Plan  -> builtin:zai-start-plan
└─ Coding Plan -> builtin:zai-coding-plan

BigModel
├─ API Key     -> builtin:bigmodel
├─ Start Plan  -> builtin:bigmodel-start-plan
└─ Coding Plan -> builtin:bigmodel-coding-plan
```

Cada family tem uma identidade visível e um alvo interno de provider resolvido.
O alvo interno é selecionado entre os provider ids existentes pelo modo de conexão,
pelo estado de login OAuth e pelo estado de entitlement.

## Navegação de Settings e Menu de Conexão

A navegação lateral de Model Providers é apenas um seletor de provider family. Families
built-in são mostradas com uma entrada por family, por exemplo `Z.ai` e `BigModel`.
A navegação lateral não deve renderizar `Start Plan`, o `Individual Plan` pessoal,
o `Team Plan` de equipe nem `API Key` como entradas irmãs separadas.

A troca de conexão vive dentro da página de detalhe da family selecionada. Esse menu é
o único lugar onde os modos de conexão são listados:

- Deslogado: mostrar o `Individual Plan` pessoal e `API Key`; uma seleção salva obsoleta
  de `Start Plan` cai para o detalhe de `Individual Plan` desconectado, em vez de deixar o
  detalhe da family em estado de carregamento permanente.
- Logado: mostrar `Start Plan` sempre que a conta tiver entitlement de Start ativo,
  inclusive quando o Coding entitlement pessoal ou de equipe também estiver ativo. Start e
  Coding são escolhas independentes e não ramos de prioridade mutuamente exclusivos.
- Logado: sempre mostrar o `Individual Plan` pessoal.
- Logado: mostrar uma entrada `Team Plan` por team plan obtido.
- Sempre mostrar `API Key`.

Os rótulos de conexão são localizados como `Individual Plan` / `个人套餐` para o
Coding Plan provider pessoal e `Team Plan` / `团队套餐` para as entradas de equipe.

A página de detalhe da family não deve renderizar uma página de conexão concreta antes de
as configurações de conexão da family terem concluído a primeira leitura. Enquanto essa
leitura estiver pendente, a área de detalhe permanece no estado de carregamento, em vez de
adivinhar `Start Plan`, `Coding Plan` pessoal ou `API Key`.

Se a primeira leitura das configurações de conexão falhar e não houver um snapshot de
configurações utilizável, a página de detalhe cai para o provider `API Key` da family. Este
é um estado de UI degradado, não uma escolha do usuário persistida: o rótulo do menu de
conexão mostra um ícone de informação e o texto de aviso localizado `connection settings
failed` com a cor do texto de aviso, enquanto o valor do select em si mostra `API Key`.

Os rótulos de conexão de Team Plan não devem cair para o rótulo genérico `Team` quando o
app ainda consegue ler um snapshot de entitlement de assinatura. Se o pricing enterprise
estiver indisponível mas os dados de assinatura provarem que existe um Team Plan, o item de
fallback deve usar o rótulo de plano derivado do entitlement antes de cair para `Team`.

As mensagens de disponibilidade de Team Plan são estados conclusivos. Enquanto o seu
provider key, entitlement ou atribuição de projeto está carregando, a página de detalhe
mostra o estado de verificação e não deve exibir a mensagem de administrador `Team Plan is
not assigned`. Essa mensagem aparece somente depois que o carregamento termina e o projeto
continua explicitamente indisponível.

As transições de conexão preservam um snapshot de entitlement pessoal já resolvido enquanto
a atualização de provider key e entitlement continua em segundo plano. Um detail em cache
`purchased` ou um `notPurchased` confirmado permanece visível com seu indicador de
carregamento; o placeholder completo `checking` fica reservado para transições que não têm
snapshot de entitlement resolvido. Isso evita que o detalhe pisque de dados em cache para
`checking` e de volta.

Selecionar um Team Plan na página de upgrade do Coding Plan exige o OAuth do provider antes
de entrar na configuração de equipe. Se o usuário estiver deslogado, a Team Plan key
selecionada fica pendente enquanto o OAuth roda. Depois de um callback bem-sucedido, o app
atualiza o purchase token e o pricing enterprise autenticado e então retoma aquela seleção
de Team Plan exatamente uma vez. A seleção pessoal/de equipe pendente fica vinculada ao id
concreto da requisição de login que a iniciou. Cancelamento de login, falha ou substituição
por outra requisição de login limpa essa seleção pendente; um login posterior e não
relacionado não pode fazer avançar a intenção de compra antiga.

A seleção do Coding Plan pessoal segue a mesma fronteira de autenticação. A key de plano
pessoal selecionada fica pendente durante o OAuth e retoma uma única vez, indo para o passo
de seleção do ciclo de faturamento, somente depois que o preview autenticado do produto
está pronto. Seleções pendentes de equipe e pessoais são isoladas e não podem retomar o
caminho de compra uma da outra. Uma expiração posterior do OAuth durante a confirmação de
pagamento pode manter o produto concreto pendente e retomar essa ação de pagamento mais
estreita separadamente, mas essa ação de pagamento está vinculada ao id concreto da
requisição de login sob as mesmas regras de cancelamento/falha/substituição. Requisições
específicas de provider só são concluídas a partir de um sinal de sucesso de OAuth do
Provider correspondente; um app user global preexistente não pode concluir uma tentativa de
login de Provider recém-iniciada.

A conclusão do login OAuth atualiza a seleção de conexão no callback da Root depois que os
modos de conexão disponíveis são resolvidos, usando esta prioridade: `Individual Plan`
comprado, primeiro `Team Plan` comprado, `Start Plan` comprado e então a entrada
`Individual Plan` como fallback sem entitlement. A key de navegação lateral selecionada
continua sendo a key da provider family; o modo de conexão concreto é armazenado
separadamente em `modelProviderFamilyModes` e a entrada de conexão específica é
armazenada em `modelProviderFamilySelectedKeys`. O login por API Key é um caminho explícito
separado: grava `modelProviderFamilyModes[family] = "apiKey"` e não participa da prioridade
de entitlement do OAuth.

A hidratação das credenciais de compra distingue carregamento ativo de leitura falha.
Apenas leituras não resolvidas/em voo bloqueiam ações de plano. Uma leitura falha mostra um
erro recuperável com uma ação explícita de retry e não pode deixar os controles de compra
pessoal ou de equipe em estado de carregamento indefinido. A ação de recuperação permanece
visível mesmo enquanto os produtos estão carregando, indisponíveis ou vazios.

A entrada normal nas configurações de Model Provider restaura um
`modelProviderFamilySelectedKeys[family]` salvo e válido. A página de configurações não deve
executar sua própria inicialização por prioridade de entitlement nem sobrescrever a selected
key salva ao montar; o frescor de login/re-login é tratado pelo callback da Root, que grava
configurações compartilhadas.

A troca de conexão iniciada pelo usuário deve tratar `modelProviderFamilyModes` e
`modelProviderFamilySelectedKeys` como um único estado de UI. Enquanto a gravação das
configurações está em voo, os dois valores precisam de pending state local e a página de
detalhe precisa ler os valores efetivos combinados. A prioridade de inicialização é apenas um
fallback para dados de seleção ausentes fora da página de configurações; ela não pode
sobrescrever o item de conexão que o usuário acabou de escolher.

O cabeçalho da family também expõe a contagem de assinaturas de Start Plan da family atual
quando a conexão selecionada não é Start Plan. A contagem vem apenas de
`subscription.details.length` do snapshot de entitlement de Start Plan existente; não pode
disparar outra requisição. Uma contagem positiva renderiza uma ação compacta `Start Plan × N`
imediatamente à esquerda do seletor de conexão. Clicar nela precisa reutilizar a mesma
transição de conexão de propriedade do usuário que selecionar Start Plan pelo seletor.
A ação fica oculta quando a contagem é zero ou desconhecida, quando a leitura de entitlement
falhou, quando a family não tem item de navegação de Start Plan ou quando Start Plan já
está selecionado. Z.ai e BigModel resolvem seu próprio provider de Start Plan
independentemente. O atalho permanece no controle de modo de conexão. Ele e o rótulo visível
`Connection mode` são mutuamente exclusivos: quando o atalho está disponível, ele substitui
esse rótulo imediatamente antes do seletor sempre visível; caso contrário, o rótulo normal
permanece. O ícone de tickets na frente e as cores reutilizam a paleta do badge de campanha
`150% Quota` existente, incluindo o fallback já estabelecido para tema escuro. Quando
visível, um prefixo externo `Switch to` (`切换至`) substitui o rótulo normal `Connection
mode`, seguido pelo botão `Start Plan × N` (`体验套餐 × N`) inalterado. O controle não renderiza
Tooltip.

```text
Start entitlement snapshot for selected family
  |-- details.length <= 0 / unavailable ----------------------> no shortcut
  `-- details.length = N > 0
        |-- selected connection is Start Plan ----------------> no shortcut
        `-- selected connection is API/Individual/Team
              -> Switch to [tickets Start Plan × N] [current ▼]
                    `-- click -> existing family selection transition -> Start Plan
```

A ação do usuário é dona da transição de conexão. Trocar para uma conexão de Plan
persiste o mode e a selected key e então realiza no máximo uma atualização de provider key
e entitlement para o provider selecionado. Estados de apresentação temporários como
`checking`, `disconnected` ou `purchased` não podem iniciar nem identificar outra transição.
Quando as configurações abrem com uma conta OAuth já ativa mas um provider key que ainda
não hidratou, a reconciliação em segundo plano usa a tupla estável
`providerId + activeOAuthProvider` e roda no máximo uma vez por página de configurações
montada. Esta regra se aplica igualmente a Z.ai e BigModel.

### Limite de Credencial da Verificação de Conectividade

A verificação de conectividade das configurações de Model Provider precisa usar a credencial
efetiva da conexão da family selecionada. Para um Team Plan selecionado, o serviço do host
resolve a credencial do provider a partir do snapshot atual do provider registry, que tem
escopo por `modelProviderFamilySelectedKeys[family]`, em vez de usar a key de Coding Plan
pessoal persistida no config do provider.

Se o Team Plan selecionado não conseguir produzir uma credencial de provider de runtime, a
verificação de conectividade falha de forma fechada e não pode cair para uma key de Coding
Plan pessoal pertencente a um sujeito de entitlement diferente. O modelo selecionado, o
endpoint, o formato de API, o corpo da requisição e o mapeamento de erros de conectividade
existente permanecem inalterados. Esta regra se aplica igualmente a Z.ai e BigModel.

## Limite do Domínio de Provider Family

Z.ai e BigModel são domínios de runtime de provider family mutuamente exclusivos. O domínio
de runtime ativo é armazenado em `AppSettings.providerFamilyDomain`, e não derivado
diretamente de `oauth:active_provider`.

```txt
No providerFamilyDomain
├─ WelcomeScreen shows Z.ai and BigModel
└─ The user can connect either provider with OAuth or API Key

providerFamilyDomain = zai
├─ Settings shows Z.ai
├─ Settings hides BigModel
└─ The model menu hides BigModel built-in models

providerFamilyDomain = bigmodel
├─ Settings shows BigModel
├─ Settings hides Z.ai
└─ The model menu hides Z.ai built-in models
```

Este limite se aplica à family built-in inteira, não apenas ao sub-provider de OAuth. Quando
Z.ai é o provider family domain selecionado, as entradas BigModel API Key, Start Plan e
Coding Plan não são mostradas como escolhas built-in. Providers customizados não são afetados.

`oauth:active_provider` continua sendo o fato de autenticação OAuth e uma fonte de migração
legada. Ele não decide mais diretamente qual family built-in é visível nem entra no provider
registry de runtime.

Uma task ou draft existente ainda pode carregar o runtime de provider selecionado antes de
uma mudança de modo de conexão. Antes de uma sessão ser criada ou retomada para o próximo
prompt, o app precisa projetar esse modelo de runtime obsoleto sobre o provider selecionado
pelos fatos de conexão atuais da family. `apiKey` seleciona o provider built-in de API Key da
family; `oauth` seleciona o provider codificado pela selected plan key da family. O nome do
modelo é preservado quando o provider alvo o expõe; caso contrário, o primeiro modelo
disponível do provider alvo é usado. Esta reconciliação se aplica a Z.ai e BigModel e é
necessária nas duas direções de transição; uma task não pode reutilizar um runtime de plano
expirado após trocar para API Key, nem um runtime de API Key inválido após trocar para um plano
disponível. Prompts enfileirados locais do Renderer resolvem esses fatos de conexão novamente
quando a fila drena, porque o usuário pode trocar de conexão enquanto o turno anterior ainda
está em execução.

## Regras de Resolução

A UI mantém um modo de conexão por family:

```ts
type ProviderFamilyId = "zai" | "bigmodel";
type ProviderFamilyConnectionMode = "oauth" | "apiKey";
```

O mode é persistido como uma preferência de UI em nível de app em
`AppSettings.modelProviderFamilyModes`, armazenado em `~/.zcode/v2/setting.json`:

```json
{
  "modelProviderFamilyModes": {
    "zai": "oauth",
    "bigmodel": "apiKey"
  }
}
```

O domínio de runtime selecionado é persistido separadamente:

```json
{
  "providerFamilyDomain": "zai",
  "providerFamilyDomainUpdatedAt": 1780984123000,
  "providerFamilyDomainMigrated": true
}
```

`providerFamilyDomain` é gravado somente depois que uma conexão OAuth ou por API Key na
WelcomeScreen tem sucesso. Logout, unlink ou a remoção da última credencial utilizável no
domínio selecionado limpa o campo e atualiza `providerFamilyDomainUpdatedAt`.

Este campo intencionalmente não faz parte de `ModelProviderConfig` e não cria novos provider
ids. Os seis provider ids existentes continuam sendo os únicos alvos de credencial,
salvamento, teste, registry e runtime. Valores de mode de family ausentes têm `oauth` como
padrão para preservar o comportamento existente Start/Coding primeiro.

A family selecionada resolve para um alvo interno de provider:

```txt
API Key mode
└─ Use the family API Key provider id

OAuth mode
├─ Not signed in to the family OAuth provider
│  └─ Show sign-in
├─ Saved selected connection is still available
│  └─ Preserve its concrete Start / personal Coding / Team provider target
├─ Saved Start connection is conclusively inactive
│  └─ Use the family Coding Plan provider id
└─ No saved connection can be restored
   └─ Resolve the existing login/default priority and persist the result
```

A descoberta de entitlement do Start roda independentemente da descoberta de entitlement do
Coding. Uma assinatura de Coding não pode suprimir a consulta do Start nem remover uma
conexão de Start ativa. Quando o Start está conclusivamente inativo, o fallback continua
sendo a entrada de Coding Plan pessoal, para que o usuário veja o estado de assinado,
indisponível ou de compra em vez de um detail obsoleto de plano free.

Quando o usuário troca uma family para o modo API Key ou salva uma API Key não vazia para o
provider de API Key da family, a página de configurações trata essa ação como um pedido
explícito para usar o provider de API Key. Se o provider ainda carrega um valor local
`enabled: false` de uma desativação manual mais antiga ou de um snapshot obsoleto, o
salvamento das configurações precisa restaurá-lo para `enabled: true` e limpar
`systemDisabledReason`. Essa recuperação se aplica apenas ao provider de API Key da family
(`builtin:zai` ou `builtin:bigmodel`) e não pode reativar providers de Start Plan ou Coding
Plan desativados por estado de entitlement.

Quando o modo de conexão da family selecionada é API Key e o provider de API Key não está
ativo porque sua key está vazia, a página de detalhe mostra um banner inline próximo ao
formulário do provider: definir uma API Key habilitará o provider. Esse banner é limitado ao
provider de API Key da family e não deve aparecer para Coding Plan, Start Plan, Team Plan nem
para um provider que já tem key mas foi desativado manualmente.

## UI da Página de Settings

A navegação de providers predefinidos mostra apenas as provider families:

```txt
Preset Providers
├─ Z.ai
└─ BigModel
```

Não deve mostrar estes como itens de navegação separados:

```txt
Z.ai - API Key
Z.ai - Coding Plan
Z.ai - Coding Plan
BigModel - API Key
BigModel- Coding Plan
BigModel - Coding Plan
```

Selecionar `Z.ai` ou `BigModel` abre uma única página de detalhe de family. O conteúdo do
detalhe usa uma estrutura fixa:

```txt
<provider icon> Z.ai / BigModel        <status>        <enabled switch>

<Plan Card>

<URL / Format / API Key>               // API Key mode only

<Models>
```

O controle de mode vive no Plan Card, não no cabeçalho da página. É um switch de dois
estados:

```txt
Switch on  -> Coding Plan mode
Switch off -> API Key mode
```

O switch grava apenas `AppSettings.modelProviderFamilyModes`. Ligar o switch seleciona o item
de navegação Start/Coding atualmente resolvido para a family. Desligá-lo seleciona o item de
navegação do provider de API Key da family.

## Plan Card

O Plan Card está sempre visível. Ele resume o plano de conta atual e também é dono do switch
Coding Plan/API Key:

```txt
┌────────────────────────────────────────────────────────────────┐
│  Plan Name                              Coding Plan  [ switch ] │
│  no entitlement / renew / expire · Manage · Upgrade            │
└────────────────────────────────────────────────────────────────┘
```

Regras de nome do plano:

- Com entitlement: mostrar o nome real do plano.
- Sem entitlement: cair para `Coding Plan`.

A segunda linha é uma única row. Texto de status e ações ficam em linha:

```txt
no entitlement / renew / expire · Manage · Upgrade
```

Quando o switch está ligado, os campos de conexão de API ficam ocultos:

```txt
┌────────────────────────────────────────────────────────────────┐
│  Coding Pro                           Coding Plan  [ on  ]     │
│  Renews Jun 30, 2026 · Manage · Upgrade                        │
│────────────────────────────────────────────────────────────────│
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │  5h usage      │  │  1w usage      │  │  Total tokens   │    │
│  │  12.4k / 50k   │  │  83k / 500k    │  │  1.28M          │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└────────────────────────────────────────────────────────────────┘

<Models>
```

O modo Coding Plan renderiza o estado resolvido:

- Não conectado: card de login para a family selecionada.
- Coding entitlement: mostrar o resumo do Plan Card, depois um divisor e três cards de uso:
  `5h usage`, `1w usage`, `Total tokens`.
- Apenas Start entitlement: mostrar o resumo do Plan Card, depois um divisor e três cards de
  uso diário.
- Sem Coding e sem Start entitlement: mostrar apenas o resumo do Plan Card; não renderizar o
  divisor nem os cards de uso.

Quando o switch está desligado, o Plan Card permanece visível, os cards de uso ficam ocultos e
o formulário existente do provider de API Key é mostrado abaixo dele:

```txt
┌────────────────────────────────────────────────────────────────┐
│  Coding Plan                          Coding Plan  [ off ]     │
│  No entitlement · Manage · Upgrade                            │
└────────────────────────────────────────────────────────────────┘

<URL / Format / API Key>

<Models>
```

O formulário detalhado do provider pode reutilizar os componentes de card de provider
existentes, mas a identidade de produto visível deve ser family-first:

```txt
Provider: Z.ai
Mode: Coding Plan
```

em vez de:

```txt
Z.ai - Coding Plan
```

Os provider ids podem continuar visíveis apenas em affordances avançadas/de debug.

## UI do Menu de Modelo

O menu de modelo da caixa de chat não deve apresentar a family built-in ativa como um grupo
aninhado de providers. Os modelos da family built-in ativa são escolhas planas de primeiro
nível e mantêm seus nomes de modelo inalterados:

```txt
GLM-5.1
GLM-5-Turbo
model3 name
Custom Provider >
```

ou:

```txt
GLM-5.1
GLM-5-Turbo
model3 name
Custom Provider >
```

O rótulo exibido é apenas o nome do modelo, enquanto o valor da opção mantém o provider id
real:

```txt
label: GLM-5.1
value: builtin:zai-coding-plan/GLM-5.1
```

```txt
label: GLM-5.1
value: builtin:bigmodel-start-plan/GLM-5.1
```

O menu de modelo precisa aplicar primeiro o modo da family selecionada, depois a fronteira de
identidade OAuth:

```txt
Family mode = API Key
└─ Show the family API Key provider models only

Family mode = OAuth
└─ Show the resolved Start/Coding provider models only
```

Quando um provider OAuth ativo é conhecido, o menu também precisa aplicar a fronteira de
identidade OAuth:

```txt
Active OAuth provider = zai
├─ Show Z.ai family models according to its selected family mode
├─ Hide builtin:bigmodel
├─ Hide builtin:bigmodel-start-plan
└─ Hide builtin:bigmodel-coding-plan

Active OAuth provider = bigmodel
├─ Show BigModel family models according to its selected family mode
├─ Hide builtin:zai
├─ Hide builtin:zai-start-plan
└─ Hide builtin:zai-coding-plan
```

Se uma family resolve para Coding Plan sem entitlement, suas opções de modelo podem ser
mostradas desabilitadas com um motivo de ausência de entitlement. Elas não devem trocar
silenciosamente para Start Plan.

Providers customizados mantêm seu comportamento existente de agrupamento ou submenu.
Apenas os modelos de family built-in de Z.ai e BigModel são achatados em escolhas de menu de
primeiro nível.

## Registry de Runtime

O provider registry enviado ao agent continua usando os provider ids existentes. O registry
deve incluir no máximo um provider built-in ativo por family visível:

```txt
Z.ai family
└─ one of builtin:zai, builtin:zai-start-plan, builtin:zai-coding-plan

BigModel family
└─ one of builtin:bigmodel, builtin:bigmodel-start-plan, builtin:bigmodel-coding-plan
```

Isso evita modelos duplicados com o mesmo nome depois da fusão na exibição. Também mantém
simples o agent runtime: os refs de modelo continuam identificando o provider id exato
necessário para seleção de endpoint, origem da API key, headers de runtime com escopo e
gating de entitlement.

Quando o modo da family selecionada muda, a próxima sincronização do provider registry deve
substituir o alvo de provider resolvido. Se o modelo selecionado atual usa o alvo antigo, a UI
deve tentar preservar o mesmo model id no novo alvo resolvido e então cair para o primeiro
modelo disponível.

## Compatibilidade

Nenhuma migração de armazenamento de provider é necessária.

- Registros existentes em `model-providers.json` mantêm seus ids.
- Refs de modelo de tarefas existentes continuam sendo resolvidos pelo provider id antigo.
- `refreshCodingPlanApiKey(providerId)` ainda aceita provider ids de Start/Coding.
- Keys derivadas de OAuth continuam isoladas pelo provider id existente.
- A sincronização do provider registry de workspace remoto continua usando os mesmos
  provider ids.
- O controle remoto móvel deve apenas observar o resultado do catálogo de modelos
  sincronizado; ele não pode criar um caminho separado de resolução de provider.

## Notas de Implementação

### Lista de modelos vazia no Coding Plan

A autenticação e o entitlement do Coding Plan não dependem da quantidade de modelos
configurados. Depois de o usuário apagar todos os modelos, Settings precisa manter os detalhes
do plano comprado visíveis e continuar renderizando a seção de modelos vazia com a ação Add
Model. O menu de modelo do chat não tem opções para esse provider até um modelo ser adicionado
de novo. Uma lista de modelos vazia não pode transformar uma conexão de Coding Plan válida em
um estado desconectado. A mensagem de modelos vazios é apresentada em um container
transparente, `rounded-lg`, com borda semântica tracejada e altura fixa de `h-12`. O par
ícone-rótulo é centralizado verticalmente e alinhado à esquerda, e a ação Add Model permanece
abaixo dele. A mensagem inclui um ícone `Info` na frente e mantém o par ícone-rótulo alinhado
à esquerda.

O formulário Add Model Provider termina com um rodapé separado por uma borda superior
semântica. Uma dica `Info` de classe `text-ui-base` à esquerda lembra o usuário de que pelo
menos um modelo é necessário, enquanto a ação Add Provider fica à direita. Em layouts móveis
estreitos, o rodapé empilha sem cortar a cópia localizada.

Peças de implementação recomendadas:

1. Adicionar uma especificação de family e um resolver puro para o estado de visão de
   provider family.
2. Mudar a navegação de presets das configurações para emitir itens `providerFamily` para
   Z.ai e BigModel.
3. Mudar o detalhe das configurações para renderizar uma página de detalhe de family com modo
   OAuth/API Key.
4. Estender a validação de disponibilidade de Start/Coding para que BigModel use o mesmo
   limite de decisão pareado que Z.ai.
5. Filtrar a projeção do runtime registry para um provider built-in resolvido por family
   visível.
6. Mudar o menu de modelo da caixa de chat para que os modelos da family ativa sejam entradas
   planas de primeiro nível cujo rótulo visível é apenas o nome do modelo.

## Validação

### Largura do submenu de modelos de segundo nível do Provider

- A largura mínima padrão é 192px; a largura cresce conforme o espaço necessário para o nome
  de modelo mais longo, o rótulo de Vision e o marcador de seleção, sem usar largura fixa que
  trunque prematuramente.
- A largura máxima é limitada pelo espaço disponível na direção atual do Radix; quando o espaço
  é insuficiente, é permitido ficar abaixo da largura mínima, com o nome abreviado e o rótulo
  e o marcador de seleção preservados.
- Os estilos de tela estreita já existentes do controle remoto móvel continuam valendo.
  Validar os temas claro e escuro do desktop, nomes longos e curtos, a borda da janela e o
  comportamento de seleção sob a sobreposição de estilos móveis.
- Regressão de navegador: `node --test packages/ui/test/browser/manual-review/pending/model-submenu-width.test.mjs` (componente real, não a cadeia completa de controle remoto).

### Layout do modo de conexão em tela estreita

- O título da Family, o status e a área de ações à direita priorizam permanecer na mesma linha;
  a área de ações participa do cálculo de quebra Flex com uma largura-base compacta e permite
  que o nome da equipe encolha, sem colocar o grupo inteiro de ações na linha seguinte por usar
  a largura do nome completo. A quebra completa só ocorre quando nem o título nem a largura-base
  da área de ações cabem.
- A área de ações do modo de conexão quebra naturalmente conforme a largura real dos controles,
  sem definir um breakpoint fixo que force a quebra e sem usar `w-full` para esticar o select até
  o fim; remover o texto independente de "Switch to / 切换至", e o botão de atalho do Start Plan
  usa `ControlHintTooltip`, exibindo "切换至体验套餐" ("Switch to Start Plan") ao passar o mouse
  ou focar pelo teclado, sem quantidade na dica; o botão continua mantendo o nome acessível e o
  comportamento de clique que alterna.
- Quando dá para acomodar o atalho e o select, eles permanecem na mesma linha; o select exibe o
  nome completo com prioridade e não tem largura máxima fixa; primeiro reserva-se o espaço
  necessário para o atalho e a seta, e o nome usa o espaço restante da linha atual, sendo
  abreviado apenas quando o nome completo realmente não couber. Nomes curtos não são esticados
  em uma caixa vazia longa; a quebra de linha só acontece quando nem a largura-base dos controles
  cabe no espaço restante.
- Com o menu expandido, o nome completo da equipe pode quebrar linha (inclusive o inglês sem
  espaços), e o menu não pode ultrapassar a viewport; o comportamento de seleção e do atalho do
  Start Plan permanece inalterado.
- Usar a quebra natural do Flex, cobrindo Web móvel, painel estreito de desktop, chinês/inglês
  e tema claro/escuro; não alterar a lógica de provider, controle remoto ou fluxo de mensagens.
- Regressão de navegador: `node --test packages/ui/test/browser/manual-review/pending/provider-family-responsive.test.mjs`.
  Monta diretamente o componente Family real, o Radix Select, a internacionalização e o CSS de
  produto, validando viewports móveis de 320/390/430, viewport de 650px (pode ficar na mesma
  linha, mas antes era quebrado por um breakpoint fixo), painel estreito em viewport largo e o
  layout horizontal do desktop, conferindo os limites geométricos e selecionando de fato um item
  de conexão.
  Este caso é uma regressão de interação de componente no navegador pendente de revisão e não
  representa a validação da cadeia completa de conexão de `/remote`.

A validação automatizada deve incluir:

- `pnpm typecheck`
- `pnpm lint`

Cobertura de testes direcionados:

- Sem sessão OAuth, as duas provider families aparecem nas settings.
- Uma sessão OAuth Z.ai oculta BigModel nas settings e no menu de modelo.
- Uma sessão OAuth BigModel oculta Z.ai nas settings e no menu de modelo.
- O modo API Key resolve para o provider id de API Key já existente.
- OAuth com entitlement de Coding resolve para o provider id de Coding Plan já existente.
- OAuth sem Coding e com entitlement de Start resolve para o provider id de Start Plan
  já existente.
- OAuth sem Coding e sem Start mostra o Coding Plan como sem entitlement.
- Os rótulos do menu de modelo são nomes de modelo planos, sem prefixos de provider.
- Os valores das opções do menu de modelo mantêm os provider ids antigos.