# Todo 47: limpeza da temporização de salvamento e do contrato de resultado do teste de conexão de Provider

> Status: concluído
>
> Data: 2026-08-31
>
> Origem: Review da cadeia de teste de conexão da página de configurações de Provider

## 1. Problema

A página de configurações de Provider salva ativamente o rascunho de Provider atual antes do teste de conexão, para evitar que o autosave por idle/blur concorra com o teste. Essa intenção de produto é
correta, mas a implementação atual também usa `savePersonalModelConfig` / `deletePersonalModelConfig` para reescrever a Personal Rule do modelo:

```text
测试连接
   |
   +--> 保存 Provider 草稿
   +--> 用 Renderer 模型快照重写/删除 Model Rule
   `--> 刷新 Worker Registry 后测试正式 Model
```

A edição oficial de modelo já usa o `savePersonalModelDraft` atômico com verificação de revision de Settings. As duas interfaces antigas de escrita de Model Config contornam a
verificação de revision, podem sobrescrever uma Personal Rule mais nova com um snapshot antigo do Renderer e ainda formam um segundo protocolo de salvamento de modelo.

O resultado do teste de conexão ainda mantém duas camadas de abstração inválidas:

- Services mantém uma segunda classificação de erros com base no status HTTP, no texto do erro e em `cause/data` aninhados, mas a UI consome apenas a mensagem de erro;
- a UI projeta de novo o teste único do Model oficial em um `ModelConnectivitySummary` e mantém o branch `noEndpointResult` de múltiplos Endpoints, já removido.

## 2. Limites confirmados

### 2.1 O salvamento ativo antes do teste é mantido

A correção não pode ser simplificada para "testar direto". Os campos de entrada de Provider podem ainda estar no debounce da UI e não ter entrado na fila de operações de Provider do Service; esperar apenas as operações existentes não cobre essa janela.

Temporização-alvo:

```text
当前 Provider 输入草稿
          |
          v
取消/消费同一个 idle debounce
          |
          v
复用 blur/idle 的唯一 Provider Draft Commit
          |
          v
等待该 Provider 保存队列完成
          |
          v
Worker 刷新正式 Registry
          |
          v
按 providerId/modelId 创建并测试正式 Model
```

- só se adiciona um novo salvamento quando realmente existe um rascunho de Provider não commitado;
- o teste de conexão não pode reescrever Model Config por conta própria;
- se no futuro o teste for iniciado a partir do modal de edição de modelo, o modal precisa antes concluir seu próprio `savePersonalModelDraft` atômico, sem restaurar as interfaces antigas;
- Personal Config, Registry e o Model oficial continuam sendo a única autoridade de configuração e execução, e não se cria Provider/Model específico para teste.

### 2.2 As interfaces antigas de escrita de Model Config saem por completo

Remover os pontos de entrada públicos e os forwards de `savePersonalModelConfig` e `deletePersonalModelConfig`, incluindo:

- `IProviderSettingsService`;
- `ProviderSettingsFacade`;
- `ProviderSettingsMutationTarget`;
- os forwards públicos do Provider Runtime / Config Runtime;
- hook de UI, helper de teste de conexão, mocks e testes das interfaces antigas.

A edição de modelo passa a usar uniformemente `savePersonalModelDraft`. As operações internas de criação/alteração/exclusão da Personal Rule exata deixam de ser expostas como um
segundo protocolo que a UI/Services possa chamar livremente.

### 2.3 O resultado da conexão mantém apenas a mensagem real

A UI hoje não tem interação por categoria de erro, então nesta rodada removem-se as adivinhações `auth`, `model_not_found`, `rate_limit`, `network`,
`server` e `unknown` dos Services e a busca profunda por status HTTP. O contrato de resultado é reduzido a:

```ts
type ModelConnectivityResult = { success: true } | { success: false; error: { message: string } };
```

Se no futuro o produto precisar exibir ações diferentes por tipo de erro, é preciso reutilizar os erros estruturados do Model/Adapter oficiais, sem classificar por string mais uma vez em Provider Settings.

### 2.4 Remover a projeção de UI multi-Endpoint antiga

Remover `ModelConnectivitySummary`, `resolveModelConnectivitySummary`, `noEndpointResult` e os testes antigos correspondentes. O componente consome
`ModelConnectivityResult` diretamente, exibindo a identidade do modelo em caso de sucesso e a mensagem de erro devolvida pela cadeia de execução oficial em caso de falha.

### 2.5 Este Todo não altera o header de atribuição de requisição

`x-zcode-session-type` é o header de atribuição da origem da requisição de modelo consumido pelo servidor do Coding Plan. Todas as requisições de modelo oficiais continuam sendo enviadas, usando
`main`, `subagent` ou `other` conforme a origem; o teste de conexão de Provider é uma chamada auxiliar sem Agent/Subagent dono e continua enviando `other`.
Esse header não faz parte do Provider Config e este Todo não adiciona caso especial por Provider.

## 3. Ordem de implementação

1. adicionar primeiro os testes que falham, provando que o teste de conexão faz flush do debounce de Provider que ainda não entrou na fila do Service e só testa depois de o salvamento terminar;
2. fazer idle, blur e teste de conexão reutilizarem um Provider Draft Commit aguardável;
3. remover os branches de salvamento/exclusão de Model Config do teste de conexão;
4. remover de vez as interfaces antigas de escrita de Model Config da superfície pública de UI, Services, Facade, Runtime e Config Service;
5. simplificar `ModelConnectivityResult`, removendo a classificação duplicada de erros dos Services;
6. remover o Summary de UI e o resíduo multi-Endpoint, renderizando o resultado oficial diretamente;
7. limpar comentários obsoletos, tipos de input duplicados, mocks, fixtures de teste e exports sem referência;
8. atualizar o Provider Settings Design e o Feature Graph, registrando a única cadeia de salvamento/teste.

## 4. Testes

- teste unitário de UI: clicar em teste sem o idle ter disparado, blur concorrente com o teste, cliques repetidos, falha de salvamento, falha de teste;
- teste unitário de Services: operações de Provider em série, passagem da mensagem de erro real, sem classificação;
- teste unitário de Provider: toda edição de modelo passa apenas pelo `savePersonalModelDraft` protegido por revision, e as interfaces antigas caem mecanicamente a zero;
- testes direcionados de Bootstrap/Core: criação exata do Model oficial após o refresh do Worker, com o reasoning mínimo continuando em `values[0]`;
- Desktop E2E: depois de preencher os campos de Provider, testar imediatamente sem tirar o foco, confirmando que a requisição usa a configuração mais recente e gera apenas um commit de rascunho válido;
- `rg`/`dep:refs` provando resíduo zero das interfaces antigas, do Summary e de `noEndpointResult`;
- `pnpm typecheck`, `pnpm lint`, verificação de formatação relacionada e `git diff --check`.

## 5. Critérios de conclusão

- o salvamento antes do teste compartilha uma única primitiva de commit com o autosave normal de Provider;
- o teste de conexão não grava Personal Model Rule a partir do snapshot de modelo do Renderer;
- `savePersonalModelConfig`, `deletePersonalModelConfig`, `ModelConnectivitySummary`,
  `noEndpointResult` e a classificação duplicada de erros desaparecem do código de produção e dos tipos públicos;
- Registry/Model oficiais, credenciais dinâmicas de Account, `x-zcode-session-type` e o comportamento do reasoning mínimo permanecem inalterados;
- depois de interação, testes unitários, verificação de tipos e lint passarem, commitar um Conventional Commit.

## 6. Resultado da implementação e verificação

- o idle, o blur, o cleanup de troca e o teste de conexão de Provider já compartilham `commitPendingDraft`; o teste espera a conclusão do commit do mesmo rascunho de Provider antes de chamar a entrada oficial de teste de Model por `providerId/modelId`.
- o teste de conexão não recebe mais Model Config do Renderer nem salva ou exclui Personal Model Rule;
  os pontos de entrada públicos `savePersonalModelConfig` / `deletePersonalModelConfig` foram removidos da UI, do Facade, do Runtime e dos forwards de protocolo.
- o contrato de resultado foi reduzido a sucesso ou mensagem de erro real; `ModelConnectivitySummary`, `noEndpointResult` e a classificação de erros por string na página de configurações foram removidos.
- `x-zcode-session-type` não entrou no Provider Config; as requisições oficiais continuam sendo escritas pela cadeia unificada de execução como `main`, `subagent` e `other`, e o teste de conexão usa `other`.
- passam os testes unitários direcionados de UI, Services, Provider e CLI Adapter/Bootstrap/Core; a verificação de tipos do Desktop E2E passa. O case de desktop `coding-plan-team-usage` já foi construído, mas o ambiente Linux atual não tem `xvfb-run` e o Chrome falhou ao iniciar sem sessão de display, portanto o E2E de runtime permanece bloqueado por ambiente e não é contabilizado como falha de asserção de negócio.