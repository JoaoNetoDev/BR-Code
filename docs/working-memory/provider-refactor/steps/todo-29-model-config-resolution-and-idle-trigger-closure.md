# Todo 29: Resolução de Model Config e Fechamento do Idle Trigger da Página de Configurações

> Status: concluído
>
> Data: 2026-08-27
>
> Origem: feedback real de experiência da página de configurações de Provider
>
> Tarefas relacionadas: [`Todo 23`](./todo-23-provider-refactor-decision-gap-closure.md),
> [`Todo 27`](./todo-27-provider-settings-dogfood-closeout.md),
> [`Todo 28`](./todo-28-model-rule-precedence-and-order-canonicalization.md)

## 1. Localização do problema

O diálogo de novo modelo já resolvia as Model Config Rules pelo Host com base em `providerId/modelId/api.type/baseURL`,
mas o Renderer adotou três projeções inconsistentes para o mesmo resultado de resolução:

```text
Model Config Rules Resolution
├─ context/max output ──> inherited placeholder
├─ boolean properties ──> copiadas para o Draft local
└─ reasoning JSON ──────> não integrado, exibido incorretamente como “—”
```

Portanto, `GLM-5.3-Flash` já atingia de fato as regras de 1M de context, 128K de max output, Image/Video e reasoning,
mas o diálogo exibia de forma completa apenas parte dos fatos padrão. Ao mesmo tempo, a resolução ao adicionar modelo usa debounce de 300ms, a resolução ao editar o ID do modelo usa debounce de 180ms e o salvamento de texto do Provider usa idle save de 800ms; pausas curtas acionam frequentemente requisições, saltos de campo, gravação de configuração e refresh do Registry.

Este Todo fecha a resolução de configuração padrão, o Draft esparso, o feedback de sucesso e o idle-trigger de texto. Ele não altera a precedência das Model Config Rules, a ordem de Provider/Model Overlay, a integridade do Registry nem a semântica de congelamento do Active Model.

## 2. Nomeação de domínio unificada

A página de configurações não usa mais conceitos sinônimos como `previewModelConfig`, `previewPersonalModelDraft` e `resolvedDefaults`.
A única operação é nomeada `resolveModelConfig`:

```ts
const resolution = await providerSettingsService.resolveModelConfig(input);
setResolution(resolution);
```

- Método: `resolveModelConfig`;
- Estrutura de retorno: `ModelConfigResolution`;
- Estado local do Renderer: `resolution`;
- O conteúdo retornado continua sendo `inheritedConfig/effectiveConfig/issues`;
- Ao adicionar modelo, apenas o ID candidato atual é resolvido; ao editar modelo, é possível carregar um Personal Exact Draft ainda não salvo e o Model ID original,
  mas sem gravar o Personal Config e sem alterar a revisão do Registry.

`resolve` expressa obter o resultado da configuração a partir das Rules atuais; se a persistência ocorre é decidido por um comando de salvamento separado, e `preview` não é mais usado como nome de domínio.

## 3. Draft e fatos herdados

Tanto ao adicionar quanto ao editar um modelo, a mesma cadeia de exibição de Overlay é respeitada:

```text
ZCode Built-in + Personal Match Rules
                 |
                 v
        inheritedConfig
                 +
     sparse Personal Draft
                 |
                 v
        effectiveConfig display
```

- O Renderer pode armazenar em cache os valores booleanos da Resolution no estado de exibição do formulário, mas esse cache não é o Personal Config;
- Campos tocados explicitamente pelo usuário são registrados separadamente, e uma Resolution tardia não pode sobrescrevê-los;
- Números, booleanos e JSON derivam seus valores de exibição da mesma Resolution;
- context/max output e reasoning JSON usam placeholder de inherited/effective;
- Controles booleanos exibem `Personal Draft ?? inheritedConfig`, e só mostram o estilo de Personal Override quando o usuário modifica explicitamente;
- Um `false` em uma Rule genérica é um fato padrão completo, e não “sem valor padrão obtido”;
- Ao salvar, apenas são adicionados os membros do modelo pessoal do Provider e as Exact Rules esparses que realmente existem, sem materializar reversamente o Effective Config.

## 4. Idle Trigger unificado

O salvamento de texto do Provider, a resolução de configuração ao adicionar modelo e a resolução ao editar modelo compartilham uma semântica de agendamento de idle-trigger:

```text
onChange
├─ atualizar imediatamente o Draft local
├─ cancelar o timer anterior
└─ 1200ms sem nova entrada
       |
       v
  executar a ação atual
  ├─ Provider: salvar o Personal Provider Draft
  └─ Model: resolver o Model Config

onBlur / Enter / salvamento explícito
└─ cancelar o timer e fazer flush da ação atual imediatamente
```

- O tempo de idle unificado é 1200ms;
- Entradas consecutivas executam apenas a última;
- Não dispara durante a composição IME;
- Requisições de Resolution usam número de sequência monotônico ou verificação de identidade equivalente; respostas desatualizadas não podem atualizar o Model ID atual;
- Ao clicar em salvar o modelo, se a resolução ainda estiver scheduled/in-flight, deve-se fazer flush imediatamente e aguardar a conclusão, salvando na mesma clique, sem exigir um segundo clique do usuário;
- O salvamento antes de blur/Enter/troca do Provider e a proteção de unmount permanecem inalterados; apenas a agendamento por timer é substituído, sem criar uma segunda fila de salvamento.

## 5. Banner de sucesso da Resolution

O diálogo de modelo exibe um banner verde de sucesso quando a nova Resolution de fato altera a configuração herdada:

> Configuração padrão do modelo carregada

```text
Resolution concluída
├─ inheritedConfig igual ao resultado já aplicado
│  └─ silencioso: não atualiza campos, não mostra banner
└─ inheritedConfig realmente mudou
   ├─ atualiza atomicamente toda a exibição herdada
   └─ mostra um banner de sucesso
```

- Exibido na primeira vez em que a configuração é carregada com sucesso;
- Não é exibido em desfoques repetidos, resoluções repetidas, mudanças apenas de caixa com a mesma configuração, nem quando IDs diferentes resultam em configuração herdada idêntica;
- Resolutions com falha, desatualizadas ou incompletas não exibem o banner de sucesso;
- O banner fica na posição fixa de feedback da área de conteúdo do diálogo de modelo, usando a cor semântica de sucesso existente, o visto e a internacionalização, sem sair de vista por rolagem do conteúdo;
- Substituído no lugar pela mesma chave estável, sem acumular feedbacks idênticos.

“Carregada” apenas indica que uma linha de base de resolução de regras foi obtida; um `modelMatch: ".*"` genérico também pode fornecer configuração padrão, e o texto não afirma que o servidor já reconheceu ou autorizou o modelo.

## 6. Limites de impacto

| Camada            | Tratado nesta Rodada                          | Mantido inalterado                                  |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| draft-default     | Projeção de Resolution e Draft esparso unificados | Conteúdo das Rules e precedência de sobrescrita       |
| presentation      | Novo banner de sucesso, eliminação da exibição indevida de JSON ausente | Ordem dos campos do Model e faixa editável |
| commit-effect     | Flush unificado de idle/blur de 1200ms        | Salvamento do Host, Registry refresh e autoridade da revisão |
| validation        | Aguardar a Resolution atual antes de salvar   | Regras de integridade e Adapter compatibility        |
| persistence       | Texto do Provider continua com salvamento automático | Schema do Personal Config e localização física      |

Não modifica seleção de modelo, teste de conexão, pacotes de conta, Remote Provisioning, Desktop continuous, Mobile replayable, filas ou cadeia de recuperação.

## 7. Plano de testes

1. `GLM-5.3-Flash + anthropic-messages` exibe 1M, 128K, Image/Video, reasoning spec e mapping;
2. Capacidade Built-in `false` exibida como valor herdado, mas não gravada em Personal Rule;
3. reasoning JSON usa o placeholder da Resolution, sem exibir o “—” incorreto;
4. Entrada contínua dentro de 1200ms não chama Resolution/Provider save; após estabilizar, chama apenas uma vez;
5. blur/Enter faz flush imediato; clicar em salvar aguarda a Resolution e conclui em uma só vez;
6. Resolution tardia é descartada; o mesmo inheritedConfig não atualiza campos repetidamente nem mostra banner;
7. O banner aparece uma vez quando a configuração muda; falhas e resultados incompletos não o mostram;
8. O idle save de Provider name/baseURL/API Key passa para 1200ms, sem regressão no blur e no salvamento antes da troca;
9. Ao adicionar modelo, campos não tocados salvam apenas o membro e a Personal Rule esparsa necessária;
10. O banner é utilizável em chinês/inglês, temas claro/escuro, teclado e janela estreita.

## 8. Critérios de conclusão

- Settings tem apenas uma nomenclatura de domínio `resolveModelConfig` e um único estado de Resolution;
- Todos os campos herdados dos diálogos de adição/edição vêm da mesma Resolution;
- O Renderer não materializa booleanos herdados em Personal Config persistente;
- O idle-trigger de texto é unificado em 1200ms, e encerrar a edição ativamente faz flush imediato;
- O banner de sucesso só aparece quando a configuração herdada de fato muda;
- Os Documentos de Design, o Feature Graph, testes unitários, typecheck, lint e verificação de formatação passam em conjunto;
- Após a conclusão, é feito um commit Conventional Commit.

## 9. Resultado da implementação

- O Facade e o Service de Settings removeram os dois conjuntos de interfaces `preview*`, unificando em `resolveModelConfig()`,
  `ModelConfigResolution` e no estado `resolution` do Renderer;
- Os diálogos de adição e renomeação compartilham o idle-trigger de 1200ms; blur, Enter e salvamento fazem flush imediato, e o salvamento não exige mais um segundo clique por causa de uma resolução em andamento;
- Números, booleanos, Reasoning Option Spec e Reasoning Mapping são todos exibidos a partir da mesma Resolution;
- O formulário de novo modelo registra separadamente os campos já tocados, e uma Resolution tardia não sobrescreve a entrada do usuário, mantendo o Personal Config final esparso;
- “Configuração padrão do modelo carregada” só é exibida quando o `inheritedConfig` completo realmente muda; resoluções repetidas não renovam nem acumulam;
- O salvamento após parada de digitação em Provider name, Base URL e API Key foi unificado e estendido para 1200ms, com blur/Enter/salvamento antes da troca inalterados;
- Já existem evidências de regressão direcionadas para Built-in Config real, Facade, salvamento automático de Provider, diálogo de modelo, respostas tardias e envio esparso.