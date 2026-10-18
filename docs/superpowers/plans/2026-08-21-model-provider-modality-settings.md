# Plano de implementação das configurações de modalidade do modelo — 3.9.0

> Este plano usa `docs/superpowers/specs/2026-08-21-model-provider-modality-settings-design.md` como limite de produto. A semântica de interação já está confirmada, então é possível entrar na implementação com testes primeiro.

## Classificação das mudanças

- `presentation`: remove o advanced collapsible, todos os campos ficam planos; adiciona seleção de tipo de entrada e exibição fixa de saída Text; Audio/PDF ainda não são exibidos.
- `draft-default`: novos modelos passam a ter por padrão context=1M, maxOutput=128K, input/output=Text; modelos antigos exibem de volta os fatos de entrada e preservam a origem unknown.
- `validation`: ID obrigatório, campos numéricos como inteiros positivos, Text de entrada obrigatório e não desmarcável, output fixo em Text.
- `commit-effect`: modalidade e origem explícita são gravadas atomicamente no provider model config.
- `persistence`: round-trip do marcador de origem `modalities` + `zcode` no OpenCode config.
- `recovery`: nenhum novo estado de recuperação; apenas validar o hot update do provider registry e a sincronização remota explícita.

## Graus de impacto

| Nível           | Relação                                             | Motivo                                                 | Evidência principal                                    |
| -------------- | ------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| must-inspect   | `ProviderModelMetadataDialog` / draft helpers    | adiciona diretamente interação, defaults e campos de commit | `packages/ui/src/settings/model-provider-section/*` |
| must-inspect   | shared model provider type/schema                | modalities já existe, mas falta semântica de origem explícita | `packages/shared/src/model-provider-types.ts`       |
| must-inspect   | provider storage                                 | todos os modelos gravam modalities; hoje não dá para deduzir a origem pelo array | `modelProviderServiceStorage.ts`                    |
| must-inspect   | provider -> ZCode protocol projection            | a fronteira entre custom legacy unknown e explicit false está aqui | `packages/shared/src/zcode-protocol/index.ts`       |
| must-inspect   | active session registry refresh                  | após salvar deve valer sem trocar de modelo         | bootstrap provider registry tests                   |
| conditional    | desktop-attached remote sync                     | o runtime remoto depende do snapshot local de provider | `remoteWorkspaceProviderSync.ts` e documentação de arquitetura |
| should-inspect | chat/automation/Subagent/Repo Wiki model options | compartilham o registry, mas o commit sink precisa permanecer isolado | feature graph model surfaces                        |
| invariant-only | mobile replayable / task snapshot / queue        | não devem carregar nem recuperar configurações de modalidade | web remote architecture constraints                 |

## Fatias de implementação

### 1. Atualizar primeiro o spec e o catálogo de testes

- concluído: atualizar `2026-06-04-model-provider-model-editor-design.md`, incorporando campos planos, defaults e regras de modalidade no spec atual do editor de modelo;
- atualizar as relações de provider settings / model capabilities no feature graph e a nova code seed;
- adicionar um case ID estável ao catálogo de casos P0 de provider local do desktop; marcar a cobertura de integração remota e o motivo do invariante de não fazer E2E mobile.

### 2. Shared schema e persistência: escrever primeiro os testes que falham

Cobertura inicial dos testes:

- `ModelProviderModelConfig` consegue expressar origem explícita, mas objetos antigos não são obrigados a ter o campo;
- `createModelProviderModelConfig` preserva/normaliza input/output e a origem;
- o OpenCode config grava `modalities` e a origem em `model.zcode`;
- o round-trip de leitura/escrita não perde a origem; quando a config antiga não tem origem, mantém `undefined`;
- alterar apenas context/max token não promove um legacy text-only para explicit false.

Arquivos de implementação:

- `packages/shared/src/model-provider-types.ts`
- `packages/services/src/model-provider/modelProviderServiceStorage.ts`
- testes correspondentes de shared/services

### 3. UI de rascunho e seletores: escrever primeiro os testes que falham

Cobertura inicial dos testes:

- defaults de add draft, exibição de volta em edit draft, ordenação fixa e deduplicação;
- defaults context=1M, maxOutput=128K, trava de Text na entrada e regra de output Text fixo;
- após mudar a modalidade, `modalitiesTouched=true`; editar outros campos não toca a origem;
- cancelar não faz commit; salvar faz commit uma única vez do model draft completo;
- todos os campos planos, as três opções de tipo de entrada Text/Image/Video diretamente visíveis e com quebra de linha, diálogo rolável em tela pequena, operável por teclado e textos completos em chinês e inglês.

Sugestões de implementação:

- estender o draft e o commit resolver de `ProviderModelMetadata.ts`;
- criar o componente local compartilhado `ProviderModelInputModalityOptions.tsx`, reutilizando os design tokens existentes com checkbox/pill planos e travando Text; sem usar Popover;
- remover o Collapsible de `ProviderModelMetadataDialog.tsx` e achatar max output, input modalities e output Text fixo;
- atualizar a fiação dos rascunhos add/edit em `ProviderCardSections.tsx` e `ProviderFormControls.tsx`;
- atualizar `en-US.ts` e `zh-CN.ts`.

### 4. Fechamento do loop de projeção de capacidades: escrever primeiro os testes que falham

Matriz de testes:

| Origem                  | input          | Capacidade esperada no protocolo                     |
| --------------------- | -------------- | ------------------------------------------- |
| legacy custom, sem explícita | `[text]`       | image/pdf omitidos, mantendo unknown              |
| custom, explícita          | `[text]`       | `supportsImages=false`, `supportsPdf=false` |
| custom, explícita          | `[text,image]` | `supportsImages=true`, `supportsPdf=false`  |
| custom, explícita          | `[text,pdf]`   | `supportsImages=false`, `supportsPdf=true`  |
| catalog-backed        | fatos existentes | manter a projeção autoritativa atual                            |

A implementação foca na decisão de origem de `shouldProjectProtocolMediaCapabilities`, não trata `modified` como origem de capacidade e não estende o protocolo de áudio/vídeo.

Testes complementares de active-session: quando a revision do provider registry é atualizada e atinge o modelo atual, `modelInputMediaCapabilities` é atualizado a quente; após alternar para text-only, a mídia das requisições seguintes visíveis ao provider é convertida em texto e o histórico real da sessão não muda.

### 5. Validação dos limites remoto e multi-dispositivo

- desktop local: após salvar, o runtime local usa a nova revision;
- desktop-attached SSH/WSL/Docker: o snapshot autoritativo local é enviado por `workspaceKey` e `remoteSessionId`, e o remoto não lê/grava o próprio provider config como autoridade;
- Web/mobile: a UI de settings, se acessível, permanece responsiva; task continuous/replayable, snapshot, queue, owner/lease não têm mudança de campo ou comportamento;
- Windows/macOS/Linux: sem引入 APIs de plataforma, validando apenas a interação genérica de Popover/Dialog.

### 6. E2E e portão final de qualidade

O E2E do desktop reutiliza a cadeia real de settings de provider de modelo, cobrindo no mínimo:

1. adicionar um custom model, verificar os defaults 1M/128K/Text, escolher Image/Video e confirmar o round-trip da config após salvar;
2. editar o mesmo modelo, desmarcar Image e, após salvar, a revision muda e a requisição ao provider não contém mais o bloco image;
3. fechar o diálogo sem salvar;
4. após reiniciar o aplicativo, a exibição de volta é consistente.

Após a implementação, executar nesta ordem:

```text
focused unit tests
        |
        v
provider settings desktop E2E
        |
        v
remote provider sync integration/E2E
        |
        v
pnpm typecheck
        |
        v
pnpm lint
```

## Candidate Cases e podas

| ID          | Cenário                                                        | Estado     | Tratamento                                                  |
| ----------- | ----------------------------------------------------------- | -------- | ----------------------------------------------------- |
| MOD-SET-001 | novo modelo com default de 1M context, 128K max output, Text input/output | accepted | UI + draft unit                                       |
| MOD-SET-002 | editar image/video explicitamente e salvar, sem perder valores ocultos antigos de audio/pdf | accepted | UI + storage + protocol                               |
| MOD-SET-003 | legacy custom alterando apenas context                                  | accepted | deve permanecer unknown                                      |
| MOD-SET-004 | sessão atual recebe hot update de capacidade negativa                            | accepted | bootstrap/runtime integration                         |
| MOD-SET-005 | sincronização de remote desktop-attached                                | accepted | remote integration                                    |
| MOD-SET-006 | input de audio/video indo imediatamente para a requisição                              | pruned   | Video só grava o fato, Audio ainda não é exibido; protocolo/runtime não suportam |
| MOD-SET-007 | opções e renderização de saída não-Text                                      | pruned   | a saída é fixa em Text                                         |
| MOD-SET-008 | mobile replayable recuperando configurações de modalidade                              | pruned   | são fatos do registry app-global, não pertencem ao task snapshot        |
| MOD-SET-009 | modelo de Agent puramente não-Text                                    | pruned   | input/output Text fixos existem                            |

## Riscos e rollback

- o maior risco é estreitar indevidamente unknown legacy para false; travar isso com testes de ausência de origem;
- o segundo risco é bloquear a atualização autoritativa remota quando o usuário edita um modelo embutido; o limite somente leitura e a regra de merge de `modified` precisam ser mantidos;
- o terceiro risco é a UI sugerir que audio/video já estão disponíveis para o Agent; resolver com texto de escopo ou reduzindo as opções;
- ao reverter a UI, é possível parar de gravar a origem explícita; os campos de origem já salvos precisam ser retrocompatíveis e ignoráveis por versões antigas, sem apagar as modalities do usuário.

## Definição de conclusão da implementação

- limite de produto confirmado e escrito no spec;
- evidências completas de unitário, integração, E2E de desktop e sincronização remota;
- `pnpm typecheck` e `pnpm lint` passando;
- feature graph e catálogo de casos de teste atualizados;
- commits seguindo Conventional Commits, sem usar `--no-verify`.