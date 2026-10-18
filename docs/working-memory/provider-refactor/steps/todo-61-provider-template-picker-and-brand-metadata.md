# Todo 61：Página de Seleção de Template de Provider e Consolidação de Metadados de Marca

> Status: concluído
>
> Data: 2026-09-02
>
> Contexto: o branch de produto `feat/provider-ux-refactor` adicionou, sobre uma implementação de Provider mais antiga, mudanças como catálogo de fornecedores, logos e estilos de barra lateral. Este Todo não faz merge desse branch; em vez disso, reimplementa a intenção de produto já confirmada sobre a arquitetura atual de Provider Template, Provider Config Overlay e Registry.

## 1. Objetivo

Sem restaurar o antigo Model Catalog e sem introduzir uma segunda fonte de candidatos de Provider, concluir a seguinte experiência na página de configurações:

- uma entrada unificada “Adicionar fornecedor” no topo;
- a entrada abre a página de seleção de Provider Template na área de detalhes à direita;
- a página de seleção de Template consome diretamente o `ProviderSettingsView.providerTemplates` do Host de destino;
- permite criar um Personal Provider a partir de um Template, bem como criar um Provider puramente personalizado sem Template;
- os nomes de Template suportam chinês e inglês;
- o Personal Provider criado recebe um `label` estável, único e editável;
- o Logo do Provider é determinado pela Effective Provider Config, e não pelo Renderer mantendo uma segunda lista de produtos por Provider ID;
- manter o layout, a rolagem, o arraste, o Account Provider e o comportamento de fallback de exclusão da página de configurações de Provider atual.

### Impact Brief

- Primary owner: domínio de Provider Config/Template e o Settings Facade do Host de destino.
- Primary UI: navegação de Provider da página de configurações de modelos, título de detalhes e o novo `ProviderTemplatePicker`.
- Downstream: Bundled/Remote Built-in Release, Active/LKG, criação Personal, páginas de configurações Desktop/Web/mobile.
- Invariantes: identidade do Registry, páginas de Account, prioridade de Model Rule, semântica de arraste/fallback de exclusão e de execução de modelos permanecem inalteradas.
- Principais riscos: versão do casco de Release não trocada atomicamente, Renderer replicando fatos de marca, desduplicação de nome contornando a atualização atômica do Host e chave de Logo remota desconhecida levando à rejeição da configuração.

## 2. Terminologia e Limites

### 2.1 Não restaurar o Catalog

Esta funcionalidade não usa `Catalog` como nome de domínio. O antigo Model Catalog chegou a carregar capacidades de modelo e fatos de runtime, mas já saiu da cadeia principal de Provider; reutilizar o mesmo conceito facilitaria associativos errados.

A nomenclatura unificada é:

```text
Interface do usuário: 添加供应商 (Adicionar fornecedor)
Componente de código: ProviderTemplatePicker
Estado da página: template-picker
Fonte de dados: ProviderSettingsView.providerTemplates
```

É proibido adicionar:

- tipos de domínio `ProviderCatalog` / `CatalogProvider`;
- Catalog Service, Catalog Source ou Catalog Repository;
- listas de candidatos ou tabelas de ordenação mantidas no Renderer por Provider ID;
- complement Template com fatos do antigo Model Catalog, de Presets ou da configuração remota de produtos.

O único fluxo é:

```text
ProviderSettingsView.providerTemplates
                |
                v
       ProviderTemplatePicker
                |
        selecionar templateId
                |
                v
 createPersonalProvider({ templateId, label })
                |
                v
       Personal Provider Config
```

### 2.2 Princípio do casco de domínio

Quando um objeto de domínio possui, além do Config Overlay, metadados próprios, use um casco de domínio para carregar os metadados e o Overlay; o objeto de domínio não é igual ao Overlay nem contamina os metadados de domínio dentro do Overlay genérico.

Nesta rodada o princípio é aplicado apenas a `ProviderTemplate`. Um Built-in Provider comum não recebe novos metadados próprios e não é envolvido mecanicamente por uniformidade formal; a estrutura centralizada e a prioridade do Model Config Rule permanecem inalteradas.

```ts
interface ProviderTemplate {
  readonly nameMap: ProviderTemplateNameMap;
  readonly config: ProviderConfig;
}
```

Atualmente:

```text
ProviderTemplateMap
└─ templateId -> ProviderConfig
```

Alvo:

```text
ProviderTemplateMap
└─ templateId -> ProviderTemplate
                 ├─ nameMap
                 └─ config: ProviderConfig Overlay
```

A estrutura a seguir não é migrada para dentro do casco de Template:

```text
modelConfigRules
├─ matchRules
├─ templateModelRules
└─ providerModelRules
```

O motivo é que elas expressam em conjunto uma prioridade de regras clara. Mover as Rules precisas de Template/Provider para seus respectivos cascos de domínio ocultaria o fato de que ainda existe um Overlay de `matchRules` antes delas; essa não é a mudança esperada nesta rodada.

A estrutura física do valor de `providerTemplates` sofreu uma mudança destrutiva, portanto o Bundled Release, o codec de Remote Release, o cache Active/LKG e os fixtures de teste precisam mudar atomicamente para a mesma nova Schema Version. A estrutura antiga ainda não foi oficialmente publicada, então não há dual-read, importer do casco antigo nem adivinhação de shape em runtime; clientes antigos e conteúdos novos ficam isolados pela fronteira existente de app-version/Schema-Version.

## 3. Nomes multilíngue de Template

O casco de Template ganha `nameMap`. As chaves usam o identificador BCP 47 do Locale atual do aplicativo:

```ts
type ProviderTemplateNameMap = Readonly<{
  readonly "zh-CN"?: string;
  readonly "en-US"?: string;
}>;
```

O conteúdo Built-in publicado deve fornecer simultaneamente os nomes em chinês e em inglês atualmente suportados. O Release Schema atual aceita apenas `zh-CN` e `en-US`; ao adicionar Locales no futuro, será obrigatório elevar em conjunto Schema/Release Version, e clientes antigos não podem adivinhar novas chaves.

Ordem de resolução do nome:

```text
nameMap[locale atual]
        |
        +-- existe e não vazio --> usar
        |
        v
nameMap["en-US"]
        |
        +-- existe e não vazio --> usar
        |
        v
templateId
```

`nameMap` pertence apenas ao Template, não entra em `ProviderConfig` e não cria um novo `label_map`. A página de seleção de Template o usa diretamente; o Renderer não mantém um mapeamento de Provider ID para mensagem i18n.

## 4. Criação e Desduplicação de Nomes

O nome do Template é uma semente de nome no momento da criação, não um nome dinâmico do Provider depois de criado.

```text
Locale atual da interface
        |
        v
resolver a semente de nome a partir de Template.nameMap
        |
        v
createPersonalProvider({ templateId, label: seed })
        |
        v
Config Service reexamina o nome dentro do lock de atualização do Personal Config
        |
        v
gerar um label único e gravá-lo no Personal Provider Overlay
```

Restrições:

- o `label` enviado pela UI é apenas uma semente de nome e não pode contornar a desduplicação no servidor;
- a desduplicação precisa ocorrer na mesma atualização atômica da criação do Personal Provider;
- `initialConfig` não pode carregar `label`, evitando que o Overlay genérico contorne o ponto de entrada da desduplicação;
- em caso de conflito de nome, mantém-se a semântica existente de `Name`, `Name 2`, `Name 3`;
- após a criação, `label` é uma configuração Personal estável e trocar o idioma da interface não renomeia automaticamente;
- uma renomeação posterior do usuário continua gravando no mesmo `label` Personal;
- atualizações de configuração do Template não sobrescrevem o `label` do Provider já criado.

Um Provider puramente personalizado continua usando a semente de nome localizada “新供应商” (Novo fornecedor) e passa pelo mesmo ponto de entrada atômico de desduplicação.

## 5. Interação da Página de Seleção de Template

### 5.1 Entrada e Página

- adicionar o botão “添加供应商” (Adicionar fornecedor) no topo da área de descrição da página de configurações, perto do botão de atualizar;
- ao clicar, a navegação de Providers à esquerda permanece inalterada e a área de detalhes à direita muda para `ProviderTemplatePicker`;
- a página oferece um botão de voltar; ao voltar, os detalhes do Provider anteriores à entrada são restaurados;
- após a criação bem-sucedida, entrar imediatamente nos detalhes do novo Provider;
- não criar nova divisão superior/inferior para telas estreitas; continuar usando a divisão esquerda/direita atual;
- continuar usando a rolagem independente das áreas esquerda e direita, sem reescrever a altura da página de configurações nem a hierarquia de overflow;
- esta rodada não oferece busca de Template.

### 5.2 Cartão de Template

- usar a ordem de publicação atual dos Built-in Provider Templates;
- não manter tabela de ordenação de Provider ID na UI;
- o primeiro item da página ou uma área explícita oferece a entrada “自定义供应商” (Provedor personalizado);
- o cartão inteiro é clicável e exibe uma seta de entrada unificada à direita;
- o cartão usa estritamente altura fixa de 64px;
- o nome permanece em uma única linha e é truncado quando excede a largura disponível;
- quando truncado, o nome completo é exibido em um tooltip;
- não usar `overflow-wrap: anywhere` para quebrar palavras normais;
- o Logo usa tamanho e respiro unificados, e o nome ocupa a largura restante;
- layouts Desktop, Web e mobile precisam ser validados com nomes longos em chinês e inglês; o nome completo é lido pelo tooltip.

## 6. Outras Mudanças Confirmadas na Página de Configurações

- a barra lateral de Provider ajusta apenas as dimensões necessárias ao Logo, sem trazer o line-height, o estado selecionado e os estilos de estado do branch de produto;
- o ponto de status lê `executable` do Provider: verde quando executável, cinza quando não executável;
- não restaurar o `enabled` de topo do Provider nem o Provider Switch;
- não exibir o texto de status “已启用” (Ativado);
- “添加模型” (Adicionar modelo) é movido para o lado direito do título “模型列表” (Lista de modelos);
- após excluir um Provider, continua-se usando o fallback de navegação atual, sem implementar seleção de Provider adjacente;
- quando a exclusão do Provider falha, mantém-se a seleção atual;
- o nome da marca na página de seleção de Template é publicado pelo `nameMap` do Template; em `Z.AI`, `AI` deve estar em maiúsculas;
- os nomes de Providers já criados e de Account Providers continuam lendo o `label` de suas respectivas Effective Provider Config, sem ler o `nameMap` do Template na direção inversa;
- exceto pelos nomes explicitamente localizados, a interface em inglês usa o nome oficial da marca em inglês; não traduzir marcas por ID no Renderer.

## 7. Configuração de Logo e Recursos Empacotados

O Logo permanece em `ProviderConfig` e não é redefinido no casco de Provider Template. `ProviderConfig` já carrega fatos de exibição do Provider como `label` e `visibility`; o Logo também é um fato de exibição do Provider final. O Template fornece o Logo padrão por meio do `config` interno, Account/Built-in Providers fornecem o Logo diretamente pela sua própria Provider Config, e o Personal Overlay pode herdá-lo. Todas as páginas de configurações leem apenas a Effective Provider Config e não inferem o Logo por Provider ID.

### 7.1 Fatos da Implementação Atual

- `ProviderConfig.logoUrl` atualmente circula apenas pelo Schema, pelo Overlay, pelo Resolver e pela migração de configurações antigas; a página de configurações não consome esse campo;
- os ícones Z.AI / BigModel da interface de contas existente são fornecidos por um helper de ícones de marca OAuth;
- Personal Providers comuns e Providers criados a partir de Template exibem hoje uniformemente o ícone genérico de Package;
- o branch de produto adicionou vários PNGs de 80×80 e mantém no Renderer um mapeamento `Provider ID -> Logo import`;
- esse mapeamento enumera simultaneamente Template Providers, Account Providers e Providers de API por consumo, replicando fatos de identidade de Provider e atribuição de marca, e não pode ser adotado como está;
- na lista de assets do branch de produto, Moonshot, MiniMax, Xiaomi, OpenAI, Anthropic, xAI e DeepSeek têm origem rastreável; Z.AI está marcado como fornecido pelo usuário; os assets da Alibaba vêm de um repositório GitHub de terceiros e não podem ser considerados oficiais com base nisso;
- os PNGs novos do branch de produto adotam uniformemente uma tela quadrada opaca, e tema claro/escuro, respiro visual e tamanhos gráficos diferentes entre marcas ainda não foram unificados e validados.

Por isso, a implementação desta rodada remove o mapeamento de Logo por Provider ID do Renderer e substitui diretamente o `ProviderConfig.logoUrl`, não consumido e com nome atrelado ao veículo URL, por um `ProviderConfig.logo` estruturado. A estrutura atual ainda não foi oficialmente publicada, então não se adiciona leitura compatível `logoUrl -> logo` nem conversão de URL; o importer Personal antigo também não migra `logoUrl`. A associação entre Provider e recursos de marca é declarada uma única vez na Provider Config.

### 7.2 Estrutura de Configuração e Recursos

A estrutura desta rodada é fixada como:

```ts
type ProviderLogoRef = Readonly<{
  readonly type: "builtin";
  readonly key: string;
}>;

interface ProviderConfigInput {
  readonly logo?: ProviderLogoRef | null;
}
```

Embora o tipo adote uma estrutura de união discriminada extensível, o Schema desta rodada aceita apenas `type: "builtin"`. Não são implementados tipos de URL, arquivo enviado ou Data URL.

`key` é uma string aberta, não é enumerada no Schema do Provider e não participa da validação de integridade ou de executabilidade do Provider. O resolvedor genérico de recursos da UI é responsável por resolver `key` em um recurso empacotado utilizável em Desktop e Web; o resolvedor não guarda ordenação de Provider, nomes, membros de Template nem lógica de produto de Account.

```text
Effective Provider Config.logo
                |
                v
       Built-in Logo Resolver
                |
                +-- key conhecida --> escolher o asset empacotado conforme o tema
                |
                `-- desconhecida/ausente --> ícone genérico de Package
```

Uma Official Config pode publicar remotamente uma nova `key` que o cliente ainda não conhece. Isso precisa ser resolvido, salvo e entrar no Registry normalmente; um cliente antigo apenas volta ao ícone genérico, sem gerar erro e sem tornar o Provider inexecutável. Quando o cliente mais tarde empacotar o asset com a mesma key, o Logo aparece naturalmente.

A tolerância a futuro aqui se aplica apenas a `key` desconhecida, não a `type` desconhecida. O cliente atual suporta apenas `type="builtin"`; ao adicionar URL, arquivo enviado ou outros tipos no futuro, será preciso elevar formalmente o Release Schema/a estratégia de compatibilidade do cliente, sem exigir que clientes antigos adivinhem um novo protocolo de recursos.

O Personal Provider criado a partir de um Template continua herdando o Template `config.logo` por meio do `templateId`, sem copiar o Logo para o Personal Overlay. Assim, quando um Template remoto atualizar o Logo em uma revisão posterior, as instâncias existentes sem cobertura explícita de Logo obtêm naturalmente a nova referência de asset; o `label` Personal existente não é afetado. Account Providers, Family API-by-consumo e outros Built-in Providers declaram a mesma key de Logo em suas respectivas Provider Configs; é permitido que múltiplos Providers reutilizem a mesma key.

`logo` é um item de configuração de exibição do Overlay comum de Provider Config: o Personal Schema pode sobrescrever explicitamente uma key Built-in conhecida ou usar `null` para limpar e voltar ao ícone genérico, mas esta rodada de UI não oferece esse ponto de edição. Um Provider puramente personalizado não grava `logo` na criação e usa por padrão o ícone genérico de Package.

Settings View, o protocolo entre processos e o View Model de formulário apenas projetam a mesma estrutura `logo` da Effective Provider Config; não são adicionados `resolvedLogoUrl`, `providerBrand` nem mapeamentos por Provider ID. A URL do recurso só é calculada por `logo.key + tema atual` no resolvedor de recursos de UI final.

### 7.3 Temas Claro e Escuro

A Provider Config declara apenas uma `key`, sem declarar `lightLogoKey` / `darkLogoKey`. Se uma mesma marca precisa de dois assets por tema, isso é um detalhe de implementação de recursos empacotados:

```ts
interface BuiltinProviderLogoAsset {
  readonly light: string;
  readonly dark?: string;
}
```

- quando o Logo colorido da marca é nítido nos dois temas, fornece-se apenas `light`, reutilizado nos dois temas;
- quando o oficial fornece explicitamente versões light/dark, ou quando a marca monocromática tem contraste insuficiente em algum tema, empacotam-se as duas cópias;
- a UI escolhe `dark ?? light` conforme o tema atual;
- não se altera o asset da marca com CSS filter, inversão ou recoloração;
- quando um SVG é carregado via `<img>`, não se pode depender de `currentColor` externo; é preciso empacotar um arquivo com cores explícitas ou fornecer versões separadas por tema;
- o tema `system` é primeiro resolvido pelo estado de tema existente para light/dark real, e só então o recurso é escolhido; o Logo Resolver não estabelece um terceiro estado de tema;
- quando o Logo expressa a mesma informação que o nome do Provider ao lado, ele é uma imagem decorativa: usar `alt` vazio e ocultá-lo do nome acessível, evitando leitura duplicada.

### 7.4 Limite entre Personal e Account Provider

Um Account Provider não é um Provider Template e não deve receber um `templateId` forçado para reaproveitar o Logo. Ele obtém o Logo diretamente da sua própria Built-in Provider Config. O helper de ícones OAuth existente deixa de ser a fonte de fatos de marca da página de configurações de Provider; o uso dos próprios ícones para OAuth/Login pode ser mantido.

Um Provider puramente personalizado sem Logo usa o ícone genérico de Package. Esta rodada não oferece UI para enviar Logo, preencher URL de Logo ou selecionar um Logo embutido; se surgir a necessidade, `ProviderLogoRef` será estendido.

### 7.5 Primeiro Conjunto de Assets Empacotados

O primeiro lote de keys embutidas é fixado como:

```text
zai
bigmodel
moonshot-kimi
minimax
deepseek
alibaba-model-studio
xiaomi-mimo
openai
anthropic
xai
```

Princípios dos assets:

- preferir o SVG fornecido oficialmente pela marca; quando não houver SVG adequado, usar o PNG/JPEG oficial;
- não é exigido o mesmo formato ou as mesmas dimensões de origem; no primeiro lote, bitmaps podem ser redimensionados ao tamanho empacotado sem recorte e sem alteração do gráfico, preservando o canal alpha quando o asset de origem o tiver;
- a UI usa um container quadrado uniforme, `object-contain` e um respiro consistente para controlar o tamanho visual;
- Z.AI e BigModel reutilizam os assets de marca já existentes no repositório e já usados nas telas oficiais de login/conta;
- Moonshot Kimi usa os recursos oficiais de `MoonshotAI/Branding-Guide`; o asset único do primeiro lote é reutilizado nos dois temas;
- MiniMax usa o asset quadrado do pacote de marca oficial;
- DeepSeek usa o gráfico de marca publicado por sua organização oficial, confirmando a autorização de uso de marca antes do lançamento do produto;
- Alibaba Model Studio não adota a imagem do repositório GitHub de terceiros do branch de produto, usando os assets oficiais de Alibaba Cloud/Bailian; os Templates da China e internacional reutilizam a mesma key;
- Xiaomi MiMo usa o asset de sua plataforma oficial;
- OpenAI e Anthropic usam os assets de seus respectivos sites oficiais; se Anthropic usar um SVG monocromático, é preciso fornecer arquivos light/dark explícitos, e não tratar um SVG com `currentColor` como um `<img>` comum esperando que herde a cor da página;
- xAI usa o site oficial ou os assets da organização oficial;
- a lista de origens do branch de produto é preservada como pista de auditoria, mas os assets só voltam a ser incluídos após reavaliação de origem e adequação de tema; não podem ser copiados em lote diretamente.

Cada asset empacotado registra marca, URL de origem, data de obtenção, formato de arquivo, presença de canal transparente e uso por tema. Logo ausente, falha de carregamento de recurso ou referência a uma key desconhecida na configuração remota resultam todos em fallback para o ícone genérico.

### 7.6 Limite das Superfícies de Exibição

As superfícies de exibição do Logo unificado desta rodada são fixadas como:

| Superfície                          | Fonte de dados                                     | Comportamento nesta rodada                                  |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| Navegação de Provider à esquerda   | Effective Provider Config                          | Exibe o Logo do Provider; ausência ou key desconhecida cai para o ícone genérico |
| Título de detalhes do Provider     | Effective Provider Config                          | Usa o mesmo Logo Resolver da navegação                       |
| Página de seleção de Provider Template | Template `config.logo`                          | Exibe o Logo base do Template                                |
| Detalhes do Account Provider       | Effective Provider Config do Account Provider       | Não infere mais o Logo Z.AI/BigModel por Provider ID          |
| Entrada de login Welcome/OAuth      | Recurso de marca do próprio produto de login        | Mantido por enquanto, não pode se tornar a fonte de fatos de Logo do Provider |
| Seletor de modelo, mensagens de sessão, lista de tarefas | Fora do escopo desta rodada        | Não expande novas necessidades de exibição de Logo por “unificação de marca” |

Todos os Logos empacotados ficam na fronteira de recursos de UI compartilhada por Desktop e Web, usados pelo mesmo Resolver. O Renderer pode manter uma tabela de recursos `logo key -> recurso empacotado`, mas essa tabela apenas carrega o recurso e não contém Provider ID, nome, ordenação, membros de Template ou regras de produto de Account.

## 8. Explicitamente Fora do Escopo

- não fazer merge nem cherry-pick de `feat/provider-ux-refactor`;
- não introduzir uma camada de dados Catalog;
- não mudar a estrutura das páginas de Account Provider, Start Plan, Individual Plan e Team Plan;
- não remover nem simplificar a apresentação de planos, os cartões de compra, preços, Quota e Usage;
- não alterar entitlement de Account, Access, integridade do Registry ou semântica de execução de modelos;
- não mover o Model Config Rule nem mudar a prioridade de Match/Template/Provider/Personal Rule;
- não alterar a semântica de arraste de Provider/Model;
- não alterar a largura total, a altura nem a estrutura de rolagem de duas colunas da página de configurações de Provider;
- não adicionar busca de Template nesta rodada.

## 9. Ordem de Implementação

1. Atualizar o Design de Provider Template, Provider Config e da página de configurações, além dos nós Template/Settings do Feature Graph e das sementes de código, fixando o casco de domínio, os nomes, a posse do estado de Logo e as superfícies de exibição;
2. Elevar a Built-in Release Schema Version e primeiro adicionar os testes de Schema do Provider Template, round-trip de JSON, decodificação de publicação Bundled/Remote, Active/LKG e resolução de nomes;
3. Evoluir `ProviderTemplateMap` de um valor `ProviderConfig` para um valor `ProviderTemplate`;
4. Atualizar o JSON Built-in para que cada Template use `{ nameMap, config }`;
5. Atualizar a projeção de Template no Resolver, no Config Service, no Facade e na Settings View;
6. Atualizar a interface de criação para receber explicitamente a semente de nome e desduplicar atomicamente no servidor;
7. Adicionar primeiro os E2E de interação da página de configurações, depois implementar a entrada do topo, a página de seleção de Template, o retorno e o destino pós-criação;
8. Remover o `logoUrl` não publicado e passar a usar `logo`; organizar o primeiro lote de assets empacotados e conectar a resolução unificada com consciência de tema, sem adicionar importer de compatibilidade;
9. Ajustar as dimensões do Logo na barra lateral, o ponto de status e a posição de “添加模型” (Adicionar modelo);
10. Limpar a entrada antiga de Template em dropdown e as tabelas de nome/Logo/ordenação por Provider ID do Renderer;
11. Revisar de forma abrangente que não há Catalog, `enabled` de Provider nem regressão nas páginas de Account.

## 10. Testes e Critérios de Conclusão

### Config / Provider

- o casco de Provider Template faz strict parsing e round-trip de JSON;
- Bundled, Remote, Active/LKG e fixtures usam a mesma nova Release Schema Version; o shape antigo de Template Map não tem leitura compatível;
- fallback de `nameMap` para idioma atual, inglês e `templateId`;
- o `config` do Template continua usando o Schema oficial de Provider Config Overlay;
- a estrutura física e a prioridade de resolução do Model Config Rule não mudam;
- criação com o mesmo nome gera sufixo estável atomicamente no servidor;
- criações concorrentes não podem gerar o mesmo `label`;
- `initialConfig.label` não pode contornar a desduplicação;
- trocar o idioma após a criação não modifica o `label` Personal.
- `logo` aceita estritamente a estrutura `builtin` atual, mas `key` não faz enumeração de conjunto fechado;
- Overlay de `logo`, limpeza com `null`, round-trip de JSON e projeção para o Effective Provider corretos;
- atualização do Logo do Template afeta a Effective Config posterior, mas não copia nem reescreve o `label` Personal;
- Settings View/Protocol carregam a referência `logo` como está, sem a URL de recurso resolvida;
- uma key de Logo desconhecida não gera erro de integridade nem afeta Registry/executable.
- um `type` de Logo desconhecido continua sendo rejeitado pelo Schema estrito atual, sem se confundir com o fallback de UI para key desconhecida.

### UI / E2E

- a entrada do topo abre a página de seleção de Template à direita;
- o retorno restaura os detalhes originais;
- a ordem de publicação dos Templates não muda;
- não há entrada de busca;
- nomes de Template em chinês e em inglês corretos;
- nome longo em linha única é truncado corretamente, o tooltip mostra o nome completo e o Logo e a seta de entrada ficam alinhados corretamente;
- Logo conhecido, fallback de Logo desconhecido, fallback de Logo ausente e escolha de recursos light/dark corretos;
- o tema System é resolvido e escolhe o recurso light/dark correto, e marcas com recurso único são reutilizadas nos dois temas;
- o Logo não faz o nome do Provider ser lido duplicadamente por tecnologia assistiva;
- criação a partir de Template e criação puramente personalizada entram ambas nos detalhes do novo Provider;
- o ponto de status do Provider reflete estritamente `executable`;
- “添加模型” (Adicionar modelo) fica à direita do título;
- excluir o Provider atual mantém o fallback existente;
- a página de Account Provider e os cartões de planos não têm regressão de comportamento ou visual;
- Desktop, Web, mobile, Zai Light, Zai Dark e operação por teclado estão todos cobertos.

### Verificação

- testes unitários direcionados de Provider, Provider Node, Services e UI;
- E2E de Desktop afetados;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm test:unit`;
- `git diff --check`.

Após a conclusão, fazer um commit Conventional Commit e incluir na mensagem o trailer real da sessão do Agent; não adivinhar o Session ID quando ele não for obtido.

## 11. Resultado da Implementação

- A Built-in Release Schema foi elevada para v3 e a revisão Built-in para 8; Bundled, Remote, Active/LKG e fixtures de teste mudaram atomicamente para o mesmo casco de Template.
- A página de seleção de Template, o retorno, a criação a partir de Template/puramente personalizada, o destino pós-criação, a desduplicação atômica de nomes no Host e a desduplicação concorrente foram implementados.
- `logoUrl` foi removido da Provider Config oficial e substituído por `logo: { type: "builtin", key }` com key aberta; key desconhecida ou falha de carregamento de recurso apenas faz fallback para o ícone genérico, sem afetar a integridade nem a execução do Provider.
- O primeiro lote de assets de marca foi empacotado na fronteira de recursos comuns de UI, com origem, atribuição e forma de redimensionamento registradas em `model-provider-logo-sources.json`; os assets atuais são reutilizados nos dois temas e o Resolver já preserva o slot opcional de recurso dark.
- A navegação de Provider, o título de detalhes e o cartão de Template consomem uniformemente o Logo da Effective Provider Config / config do Template; o Renderer não tem mapeamento de Provider ID para marca.
- A entrada “添加供应商” (Adicionar fornecedor) no topo e a entrada “添加模型” (Adicionar modelo) ao lado do título foram concluídas; o dropdown de Template antigo da barra lateral e seus candidatos foram removidos, e as páginas de Account e o fallback de exclusão não mudaram.

### Registro de Verificação

- testes unitários direcionados de Provider, Provider Node, Services, Server e UI: 22 arquivos, 388 casos passando;
- `pnpm typecheck`: passou;
- `pnpm --filter @zcode/desktop typecheck:e2e`: passou;
- `pnpm lint`: passou (apenas os warnings já existentes no repositório);
- Unit completo: 13.071 casos passando, 25 pulados; há ainda 2 falhas de baseline pré-existentes sem relação com este Todo, respectivamente a contagem de variáveis de ambiente do seed do E2E CLI e a asserção de comando do pre-push hook;
- o E2E de Desktop concluiu a build do aplicativo, mas o ambiente Samantha atual não tem `xvfb-run`; o WebdriverIO não conseguiu criar a sessão do Chrome e não houve resultado por caso;
- verificação de formatação dos arquivos modificados e `git diff --check`: passou.