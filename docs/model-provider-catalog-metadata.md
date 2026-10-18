# Metadados do Catálogo de Modelos por Provider

> Documento histórico: o esquema descrito aqui foi primeiro substituído pelo esquema de transição
> do OpenCode config e, em seguida, pelo Provider Refactor. O design autoritativo atual está em
> `docs/working-memory/provider-refactor/design/`; `docs/model-provider-opencode-config.md` também é
> mantido apenas como registro histórico de migração. Este documento descreve o esquema já
> substituído de `models_catalog_china_llm_zcode_2026-06-03.json` e `model-providers.v2.json`,
> preservado somente como contexto histórico.

## Escopo

Esta funcionalidade incorpora ao fluxo oficial de configuração de providers o catálogo de LLM chineses da
fase de desenvolvimento, a ordenação de exibição dos providers e os metadados de runtime por modelo.
Atualmente cobre apenas a sincronização app/host/agent de projetos locais do desktop; SSH remoto e o
`/remote` do celular mantêm a boundary já existente de shared-host attachment, sem novo runtime
independente.

## Origem do Catálogo

`modelProviderService.getCatalogProviders(sourceId)` retorna uniformemente os modelos de catálogo do app:

- `models-dev`: converte do schema models.dev para o catálogo unificado.
- `china-llm-zcode-dev`: lê o arquivo `models_catalog_china_llm_zcode_2026-06-03.json` na raiz do repositório.

No catálogo de LLM chineses, `endpoints.baseURL + endpoints.paths[kind]` representa o endereço completo da
requisição. Antes de escrever no agent registry, isso é normalizado para a API base URL de runtime exigido
pelo SDK, evitando que um SDK compatível com OpenAI gere caminhos duplicados ao acrescentar
`/chat/completions`.

## Armazenamento Histórico de Providers

No esquema histórico, a configuração de providers do usuário era gravada em um arquivo v2 independente,
`model-providers.v2.json`:

```json
{
  "schemaVersion": "zcode.model-providers.v2",
  "providers": []
}
```

`models` suporta um array de objetos de modelo; `kinds`, `modalities`, `contextWindow`, `maxOutputTokens` e
`reasoning` do modelo são gravados no mesmo objeto do id. O array puro do antigo `model-providers.json` e o
legacy metadata map são migrados para objetos de modelo na leitura e gravados em `model-providers.v2.json`;
o arquivo antigo permanece inalterado, para que o usuário que voltar a uma versão antiga ainda consiga ler
a configuração original. Se a implementação antiga for detectada tendo gravado o store v2 em
`model-providers.json` e existir um `model-providers.v1.backup.json`, o arquivo antigo é restaurado para
leitura pela versão antiga, e a nova versão continua usando o store v2.

A ordem de exibição é mantida separadamente em `model-provider-display-order.json`. A ordenação afeta
apenas a navegação na página de configurações e a exibição agrupada de providers na página de chat; não
altera a origem, a identidade nem a runtime registry key do provider.

## Edição nas Configurações

A página de configurações de provider permite editar:

- nome do provider, estado de habilitação, Base URL, formato de API e API Key.
- O dropdown de formato de API mostra apenas os formatos suportados tanto pelo endpoint atual do fornecedor
  quanto pelos metadados do modelo; fornecedores puramente customizados ainda podem escolher a partir do
  conjunto completo de formatos suportados pelo sistema.
- A lista de modelos exibe por padrão apenas linhas compactas; o ID do modelo continua com edição inline, e o
  botão de edição à direita da linha do modelo abre um diálogo para editar os metadados de runtime. As tags
  de capacidade visual e de janela de contexto dentro do ID do modelo usam o mesmo tamanho, espaçamento e
  corpo de fonte de pill circular com borda fina; o valor de capacidade usa a fonte da UI com algarismos
  tabulares ativados, sem trocar o bloco inteiro para fonte monoespaçada.
- A lista de modelos sempre exibe o conjunto completo de modelos. À direita do ID do modelo, os formatos de
  API suportados são mostrados em três colunas fixas de tags, na ordem Anthropic, OpenAI Compatible, OpenAI
  Responses; a tag do formato de API selecionado fica destacada, os demais suportados ficam atenuados e os
  não suportados mantêm uma coluna vazia para garantir o alinhamento vertical entre linhas. Quando o formato
  atual não pode ser testado, o botão de teste de conectividade permanece visível, porém desabilitado, sem
  impedir a edição, exclusão ou manutenção dos metadados de modelo em outros formatos.
- Edição da janela de contexto e do JSON de metadados `reasoning` do modelo dentro do diálogo; esse JSON deve
  seguir o schema `ModelProviderReasoningSpec` e, após salvo, participa da geração do thought level na página
  de chat.
- `displayName` ainda pode ser preservado pelo catálogo/store e participar da projeção de runtime, mas a
  página de configurações não oferece entrada direta de edição; `maxOutputTokens` é editado na área
  “Avançado” do diálogo do modelo.
- Adição e exclusão de modelos.

## Sincronização de Runtime

Após adicionar, editar, desabilitar, habilitar ou excluir um provider na página de configurações, a UI:

1. Salva a configuração de provider do lado do host.
2. Sincroniza com o agent dos workspaces abertos via `workspace/updateProviderRegistry`.
3. Atualiza `configOptions` da página de chat atual usando o workspace state retornado.

O dropdown de modelos da página de chat lê prioritariamente `settings.model.available/current` retornado pelo
agent; portanto, apenas atualizar o JSON local não é suficiente para que a sessão atual veja imediatamente o
novo provider. O runtime sync mantém a regra de fallback `workspaceIdentity`: o isolamento de identidade usa
`workspaceIdentity?.trim() || workspacePath`, e a execução por caminho continua usando `workspacePath`.

## Metadados de Reasoning

`reasoning.levels[level][kind]` no catálogo é um patch de provider options. Na conversão para o ZCode Protocol,
o kind público `openai-compatible` é mapeado para o namespace de runtime de provider options
`openaiCompatible`, e os thought levels selecionáveis da página de chat são gerados.

Modelos sem levels/patch explícitos não recebem opções de reasoning artificiais; a página de chat mostra
apenas os valores realmente declarados pelo agent registry.