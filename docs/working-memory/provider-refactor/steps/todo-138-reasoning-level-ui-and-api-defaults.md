# Todo138：草稿 de modelo vazio e fallback de nível de raciocínio na camada Model

> Status：concluído. 2026-09-12; implementado conforme a decisão final e aprovado nas verificações abaixo.

> Nota de merge: o número da branch de origem era Todo134, padronizado agora como Todo138. A builtin revision da implementação de origem era 23; após mesclar a alteração de desativação do Turbo de outra revision 23, subiu para 24, e o registro da versão antiga no corpo é mantido como evidência histórica.

## Contexto e decisão final

Um novo modelo aparece como disabled quando o ID não é preenchido, devido ao hardcode de UI em ProviderCardSections.createEmptyModel. O usuário exigiu que o rascunho em branco não pré-preencha níveis, e que os modelos reais ofereçam o fallback desligado/ligado em dois níveis.

Após a discussão, o rascunho inicial de “níveis genéricos vazios na camada Model, dois níveis novos na camada API” foi retirado: as regras atuais de Model + API com sobreposição posterior sobrescrevem os níveis dedicados da camada Model. No final, não se alteram camadas, ordenação nem algoritmo de overlay, não se introduzem casos especiais de campo e não se redeclara em camadas diferentes os níveis dedicados.

## Estado após a modificação

### UI de novo modelo

Quando o ID do modelo não é preenchido, o nível de raciocínio fica vazio, sem pré-preencher disabled. É possível adicionar níveis; após informar o ID, valem a resolução existente, a projeção do rascunho e o mecanismo de sobrescrita pessoal. Limpar o ID não dispara requisição de resolução; sem sobrescrita do usuário, volta ao nível vazio. Níveis com edição explícita continuam preservados. Modelos existentes, configurações manuais e outras capacidades iniciais não são redefinidos.

### Fallback genérico na camada Model

```ts
reasoningLevel: {
  values: ["disabled", "enabled"],
  map: "{}",
}
```

Os modelos conhecidos continuam declarando seus próprios níveis pelas regras dedicadas posteriores; não é necessário adicionar disabled/enabled a cada modelo. Mesmo sem informações de API é possível obter os dois níveis na camada Model, mas isso não significa configuração completa nem que seja possível enviar requisições; a validação de completude não é afrouxada.

### Mapeamentos genéricos das três APIs

As regras genéricas de API não adicionam values, apenas modificam o ramo enabled do map:

- Anthropic Messages: disabled mantém thinking.type=disabled; enabled usa thinking.type=adaptive, output_config.effort=high.
- OpenAI Chat Completions: disabled mantém o campo de desligamento e effort=none; enabled usa thinking.type=enabled, enable_thinking=true, com reasoning_effort e reasoning.effort ambos high.
- OpenAI Responses: disabled mantém reasoning.effort=none; enabled mapeia reasoning.effort=high.

Os demais níveis seguem o mapeamento original; os maps dedicados de modelo/API/site e as sobrescritas pessoais permanecem. Apenas a expressão genérica é ajustada, sem enviar enabled como effort da interface sem alteração.

## Posse e limites

```text
空 ID 草稿（UI，空档位，不解析）
  -> 输入 ID
  -> 现有 Host 解析：Model 通用两档 -> 专用模型档位 -> 原有后层覆盖
  -> 现有 UI 投影（保留显式编辑）
  -> 现有请求适配器执行 API map
```

A UI possui apenas o rascunho não submetido; as regras e a configuração efetiva de modelos continuam sendo responsabilidadeda cadeia de resolução do Provider. Não são adicionados protocolos, fontes de estado, temporizadores ou cadeias de sincronização, e a fronteira desktop continuous / mobile replayable não muda. Ambos os lados reutilizam os mesmos componentes de edição.

Quando o usuário escolhe ativamente um modelo ou em uma inicialização totalmente nova, completeNewModelSelection pega o último item do array de níveis, escolhendo assim enabled para o modelo de fallback; restaurar/re-resolver uma seleção existente não passa por essa estratégia de preenchimento; o resultado natural de aceitar os dois níveis é aproveitado, sem modificar a política de escolha de nível nem sobrescrever escolhas já salvas pelo usuário. A builtin revision sobe de 22 para 23, sem alterar schemaVersion e sem adicionar formato de arquivo ou migração.

## Implementação e aceitação

- [x] Atualizar os valores iniciais do modelo vazio e cobrir regressões de primeira abertura, resolução após informar o ID, limpeza e preservação de edição manual.
- [x] Validar os dois níveis genéricos das regras builtin reais, os níveis dedicados e a sobrescrita por map pessoal; sem modificar o resolvedor.
- [x] Executar o CEL genérico das três APIs e capturar a requisição final real do SDK para validar disabled/enabled (correspondente a high); as demais intensidades são cobertas por regressão do CEL e dos casos de requisição dedicados já existentes.
- [x] Cobrir no navegador larguras desktop/mobile, temas claro/escuro e chinês/inglês, registrando o resultado; sem se passar por validação completa de Electron/controle remoto.
- [x] Atualizar specs/índices relevantes, rodar testes unitários, tipos, lint e verificação de arquitetura antes de commitar.

## Localização no código

- UI: packages/ui/src/settings/model-provider-section/ProviderCardSections.tsx.
- Resolução/projeção: useModelConfigResolution.ts, useProviderModelDraft.ts, ProviderModelDraftState.ts (apenas regressão, sem mudar o ciclo de vida).
- Builtin: config/provider/zcode-builtin.json, primeira regra de Model e os três maps genéricos Model + API.
- Ordem das regras: packages/provider/src/config/schema.ts, model-config.ts (manter como está).

## Registro de verificação

- Primeiro vermelho, depois verde: o nível inicial da UI, a resolução builtin real, a validação de enabled não declarado pelo SDK e as duas larguras de navegador reproduziram antes o comportamento antigo.
- 153 testes unitários de UI/configuração builtin relacionados passaram; 7 casos de regras de rascunho passaram; 64 testes de requisição com serialização real do SDK passaram (incluindo 6 casos de disabled/enabled nos três formatos), usando fetch isolado e sem chamar modelos pagos.
- Checagem de tipos e checagem de tipos do E2E desktop passaram; lint com 42 avisos existentes e 0 erros; verificação de arquitetura com 0 violações.
- A linha de base histórica dos maps dedicados e os múltiplos níveis de GPT-5.4 e GLM-5.3 foram mantidos. Grok-4.3 não declara níveis dedicados, portanto herda os dois níveis como um modelo desconhecido; seu estado builtin padrão desligado não foi alterado. A persistência pessoal não é reescrita.
- Dois novos casos no navegador passaram; a validação cobre a primeira abertura sem níveis/sem requisição, os dois níveis após a resolução, o retorno à lista vazia ao limpar o ID e a não sobrescrita da edição manual pela resposta posterior. O teste chegou a esperar por engano o value da recomendação de input e, conforme o registro de execução, passou a esperar pelo placeholder, sem alterar a lógica de sincronização em produção.
- Os testes de navegador usaram componentes compartilhados e serviço isolado; não executaram Electron completo, controle remoto de celular nem chamadas de rede reais a provedores.

Na execução conjunta dos testes de navegador da página de configurações compartilhada, 22 casos: 21 passaram diretamente; o batch de providers no celular foi interrompido pelo HMR do Vite disparado pela organização de comentários feita nesta alteração; depois que os arquivos foram corrigidos, os dois batches de providers foram rerodados e passaram. As falhas de teste não envolvem correção de produto. Os dois novos casos também passaram de forma ind