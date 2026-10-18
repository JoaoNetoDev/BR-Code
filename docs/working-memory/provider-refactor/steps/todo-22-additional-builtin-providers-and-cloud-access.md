# 22 Novos Built-in Providers e acesso a plataformas de nuvem

> Status: rascunho
>
> Data: 2026-08-26
>
> Origem: escopo de novos Providers já confirmado durante o levantamento do conteúdo do Built-in Config do ZCode; desmembrado do Todo 21 para evitar que a refatoração de responsabilidades de configuração bloqueie a nova
> integração de Provider/Access
>
> Tarefa relacionada: [`21`](./todo-21-zcode-builtin-config-ownership-and-model-activation-order.md)
>
> Designs relacionados: [`Panorama do sistema de configuração de Provider e Model`](../design/registry/provider-and-model-configuration-overview.md),
> [`configuration.md`](../design/registry/configuration.md)

## 0. Posicionamento da tarefa

Este Todo assume de forma independente os gateways agregados comuns e os Providers de plataforma de nuvem que ainda não entraram no `config/provider/zcode-builtin.json` atual. O Todo 21 continua
concentrando as responsabilidades de configuração de Provider/Model, ativação, ordenação, Settings e a atribuição de Access; o caminho crítico de implementação não se expande por causa da espera de um novo Provider Adapter ou Access Type.

Built-in significa apenas que o template é mantido embutido no ZCode, e não que se usa uma conta ZCode. Se um novo Provider comum entra por padrão no conjunto de modelos selecionáveis é determinado pelo `enabled` do Template Model; o `enabled` de nível superior do Provider não é mais usado para expressar entrada na configuração ou elegibilidade de execução:

```text
Template Model Rule
└─ enabled = false（padrão）
```

Depois que o usuário seleciona em "Adicionar fornecedor", cria-se uma Personal Provider Instance, e a correspondente Personal Model Rule salva a ativação de modelos e o material de acesso; só depois de a configuração estar completa ela entra no Registry.

## 1. Escopo candidato atual

### 1.1 Verificar primeiro se o Access de API existente consegue expressar tudo

- OpenRouter;
- OpenCode Zen;
- Microsoft Azure AI Foundry / Azure OpenAI;
- Volcano Engine Ark.

Esses Providers só entram como templates de Built-in Provider comuns quando o `api.type + api.baseURL + access.type="api"` existente conseguir expressar com precisão o Endpoint real, os Headers, os parâmetros de requisição e
a semântica de IDs de modelo. Não se pode pular a validação do corpo final da requisição e do
fluxo de resposta só porque o serviço declara ser OpenAI-compatible.

### 1.2 Deixar explícito o que exige novo design de Access

- AWS Bedrock.

Region, origem das credenciais, assinatura da requisição, geração de Endpoint e identidade do modelo no Bedrock não podem ser disfrazados como API Key comum + URL escrita à mão. Antes da implementação formal é obrigatório
desenhar o Access do Bedrock, a montagem do Adapter, o formulário de Settings, o ciclo de vida das credenciais e os limites de Local/Remote Environment.

### 1.3 Exclusões atuais

- Provider nativo Google Gemini;
- Google Vertex AI.

Integrações do Google não são suportadas no momento e não serão estabelecidas "de passagem" neste Todo como Adapter ou Access Type. Quando forem reabertas no futuro, o design será baseado nas interfaces oficiais da época.

## 2. Princípios comuns

1. Os templates de Provider entram no mesmo release ZCode Built-in; não se restaura Catalog, Preset nem uma segunda fonte de verdade remota;
2. Identidade do Provider, API, templates de Endpoint e Access pertencem ao Built-in Provider Config;
3. Properties dos modelos, Option Specs, Reasoning Mapping e fatos de codificação de requisição necessários pertencem às Built-in Model Config Rules;
4. Providers comuns não levam hardcode por Provider ID ou Model ID em Adapter/Runtime;
5. Cada novo Provider precisa de evidência do contrato final de requisição/resposta HTTP, não basta provar que a factory do SDK consegue criar;
6. Settings usa a entrada "Adicionar fornecedor", o `builtin` explícito e o contrato de ativação e ordenação do Todo 21;
7. Workspace local usa a configuração do Local Host, workspace remoto usa a configuração e as credenciais do Remote Host e não projeta fatos locais a partir do Renderer;
8. Não publicar templates Built-in que pareçam configuráveis mas sejam de fato inexecutáveis para Access/Adapter ainda não implementados.

## 3. A projetar antes da implementação

### 3.1 OpenRouter e OpenCode Zen (migrado)

> Esta seção foi migrada para [Todo 79: Limite de integração dos Providers OpenRouter / OpenCode e base existente](./todo-79-openrouter-opencode-provider-integration-boundary.md). O Todo 22 ainda mantém o planejamento de Azure, Volcano Ark e AWS Bedrock e não deve ser marcado como concluído por inteiro.

- Confirmar o schema da API pública usado;
- Confirmar se o model ID contém `/` e como isso é tratado no `ModelSelection` estruturado;
- Confirmar a requisição/resposta real de reasoning, tool call, structured output, web search e usage;
- Confirmar Endpoint, endereço de gerenciamento da API Key e membros de modelos recomendados;
- Confirmar se o Adapter atual precisa de algum fato de compatibilidade estreito e comprovado.

Veja o Todo 79. A discussão original de OpenRouter/OpenCode permanece como índice de migração e não é mantida em duplicidade aqui.

### 3.2 Azure

- Confirmar a relação entre Endpoint de recurso, Deployment e Model ID;
- Confirmar se a API version pertence à configuração estática de API, ao query do Endpoint ou a opções do Adapter;
- Confirmar o Header de API Key e o protocolo de resposta;
- Se o Access de API existente não conseguir expressar tudo, evoluir primeiro o design de Access/API, sem escrever meia solução no JSON Built-in.

### 3.3 Volcano Ark

- Confirmar Endpoint/Deployment ID, API Key e identidade do modelo;
- Confirmar a compatibilidade de requisição e resposta em streaming do Adapter OpenAI-compatible atual;
- Confirmar os modelos recomendados e seus Model Config Facts completos.

### 3.4 AWS Bedrock

- Estrutura de domínio do novo Access Type;
- Limites de Region, credenciais estáticas, referência de credenciais e refresh em tempo de requisição;
- Posição no Transport do SigV4 ou do protocolo de assinatura formal atual;
- Limite de segurança entre geração automática de Endpoint e Endpoint customizado;
- Mapeamento entre o Model ID do Bedrock e o Model ID original do Provider;
- Entrada de credenciais e titularidade de execução no Desktop, na CLI e no Web/Remote Host;
- Connectivity, normalização de erros e mascaramento de logs.

## 4. Princípios de aceitação

Cada Provider precisa provar pelo menos:

```text
Built-in Provider Template
        +
Personal Access/Endpoint Overlay
        +
Built-in Model Config Rules
        |
        v
Registry Provider/Model completo
        |
        v
requisição real de generate + stream
```

E cobrir:

- Template Model com `enabled=false` por padrão; após criar a Personal Provider Instance, a correspondente Personal Model Rule salva a ativação dos modelos;
- Sem material de acesso, mantém-se o estado editável no Settings sem entrar no Registry;
- As Model Rules conseguem resolver Properties, Options e Reasoning Mapping completos;
- Tool Call, Structured Output, Reasoning e Usage têm pelo menos evidência de requisição real representativa;
- Remover o fornecedor remove apenas a configuração Personal e o template Built-in volta ao estado;
- A ordem de Provider/Model respeita o Todo 21;
- Local/Remote Environment não misturam configuração nem credenciais;
- Typecheck, Lint, Config integrity e os testes do Adapter relacionado passam.

## 5. Não objetivos

- Não publicar antecipadamente no Todo 21 os Providers acima em estado incompleto;
- Não suportar Google Gemini nem Vertex AI;
- Não forçar o modelar do Bedrock como Provider de API Key comum;
- Não prometer que todos os modelos por trás de qualquer gateway agregado têm as mesmas capacidades;
- Não restaurar models.dev, Catalog, inferência em Runtime por nome de modelo nem hardcode de família de Provider;
- Não refatorar de forma unificada todos os consumidores de `/client/configs`.

## 6. Condições de saída do estado de rascunho

Este Todo só pode passar para "a executar" depois que os itens a seguir forem concluídos:

1. Confirmar separadamente a expressabilidade pelos Adapter/Access existentes de OpenRouter, OpenCode Zen, Azure e Volcano Ark;
2. Concluir o design dedicado de Access do AWS Bedrock;
3. Confirmar, para cada Provider, os primeiros modelos Built-in e a fonte autoritativa de fatos;
4. Confirmar as fatias de implementação e as condições de validação com requisições reais;
5. Escrever o contrato final de Provider/Access na Design Tree.