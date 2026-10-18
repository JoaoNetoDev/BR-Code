# Pesquisa de dependências entre Embedded Search e Provider

> Status: pesquisa concluída; código de produção ainda não modificado
> Data: 2026-08-10
> Design da fase correspondente: [`../steps/01-model-and-request.md`](../steps/01-model-and-request.md)

## Conclusão

Embedded Search é uma capacidade de ferramenta fornecida pelo Environment, sem relação com o Model Provider. O código atual, embora resolva a conexão do modelo via `ModelConnectionPort`, tem o resultado do branch determinado apenas pela feature flag e pela disponibilidade do Bash. A dependência de Provider pode ser removida, sem necessidade de migrá-la para uma nova interface `Model`.

O ponto de entrada alvo pode ser consolidado em:

```ts
resolveEmbeddedSearchBranchCapability({
  bashAvailable,
  embeddedSearchBranchEnabled,
})
```

## Fatos do código

`resolveEmbeddedSearchBranchCapability()` atualmente recebe o estado do Bash, a seleção de shell, a ref do modelo e o `ModelConnectionPort`. A função resolve a Connection e coloca no decision context o model, o provider kind, a base URL e a Connection com as credenciais removidas.

Na prática, só isso determina o resultado:

```text
embedded-search feature flag
             +
       Bash available
             |
             v
 useEmbeddedSearchBranch
```

model ref, provider kind, base URL, Provider options e shell selection não participam da decisão. Quando a resolução da Connection falha, a função ainda devolve o mesmo resultado.

Esse resultado é usado em três lugares:

```text
Tool exposure do Runtime principal
└─ decide se oculta Glob / Grep diretos

Tool executor
└─ grava embeddedSearch.enabled

Subagent Runtime
└─ decide a child tool surface
```

No fim, os três chamadores leem apenas `useEmbeddedSearchBranch`.

A função de decisão está em `apps/zcode-cli/packages/core/src/embedded-search/capability.ts`; as três chamadas estão em `runtime/methods/embedded-search-branch.ts`, `tool/executor/call-runner.ts` e `runtime/methods/subagent.ts`.

Os testes existentes exigem que parte do contexto de Provider seja preservado, com o argumento de que futuramente pode haver um branch por modelo; o design histórico também registrou explicitamente que o first-party hoje está sempre habilitado, sem distinção por provider, source ou variant. Esses conteúdos provam que a Connection de Provider é informação reservada, não uma dependência do comportamento atual.

## Limites da limpeza

Na implementação é preciso modificar em conjunto o tipo de entrada de capability, o Runtime principal, o Tool executor, os pontos de chamada de Subagent e os testes relacionados. Se o Shell suporta injeção de prelude continua sendo decidido pela camada execution/adapter, sem impacto na embedded tool surface vista pelo Agent.

Essa limpeza não traz mudança de UI, persistência ou protocolo, nem depende da entrega de uma nova interface `Model`. Os comportamentos a preservar são: com a feature flag ligada e o Bash disponível, ocultar Glob/Grep diretos; com o Bash indisponível ou a flag desligada, continuar expondo as ferramentas diretas.