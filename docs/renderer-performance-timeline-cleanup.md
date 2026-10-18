# Limpeza do Performance Timeline do Renderer

## Contexto

Na análise de `Heap-20260518T115447.heapsnapshot` em 2026-05-18, o heap da página do renderer `http://localhost:5174` tinha cerca de 10.605.795 `native:PerformanceMeasure`, com tamanho próprio de aproximadamente 1,2 GB. A retenção vinha do Performance timeline nativo de `window.performance`, e não de arrays de negócio, React Fiber nem cache de spans do SDK de monitoramento.

## Causa

O projeto usa o build de desenvolvimento do React 19.2. O React 19.2 habilita por padrão as React Performance Tracks em modo de desenvolvimento e registra, via `performance.measure(...)`, os rastros de renderização e agendamento de componentes. Quando uma janela de desenvolvimento fica aberta por muito tempo sem recarregar, essas entradas continuam permanecendo no Performance timeline do navegador.

A causa principal deste heap não foi a coleta de performance do SDK de monitoramento, e sim as entradas do Performance timeline escritas pelo próprio build de desenvolvimento do React.

## Tratamento

Na inicialização do renderer, a limpeza periódica é habilitada somente no modo dev do Vite:

- A cada 10 segundos, chama `performance.clearMeasures()`
- Também chama `performance.clearMarks()`
- Não é habilitada no pacote de produção, para não afetar os dados de diagnóstico em produção

Isso preserva o comportamento do build de desenvolvimento do React, sem fazer monkey patch de `performance.measure`, com risco baixo; o custo é que o painel Performance do DevTools só enxerga measure/mark de um período recente.

## Sugestões de verificação

Após rodar por muito tempo em modo de desenvolvimento, é possível verificar no Console do DevTools:

```js
performance.getEntriesByType("measure").length
```

Essa quantidade deve permanecer em uma faixa baixa, sem mais crescer sem limite com o tempo de execução.