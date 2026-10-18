# Investigação do problema de tela travada no carregamento

> **Status: registro histórico de troubleshooting.** Este documento registra um problema de
> carregamento sob a antiga arquitetura de store/task-stream; os caminhos citados como
> `memoryStore` e `outputStyleStore` não existem mais; não use estes passos na UI V4 atual.

## Sintoma
Após o início do aplicativo, a tela principal fica sempre no estado de carregamento.

## Partes já confirmadas como corretas

✅ O registro dos serviços foi bem-sucedido (mostrado no log):
```
[rpc:register] channel "hooks"
[rpc:register] channel "memory"
[rpc:register] channel "output-style"
local services ready, all channels registered
```

✅ O código novo não tem erros de sintaxe
✅ O Store não é chamado automaticamente

## Possíveis causas

### 1. Erros de tipo no código já existente
A verificação encontrou alguns erros de tipo no código já existente (não no nosso código novo):
- `src/hooks/taskStreamEventHandlers.ts` tem vários erros de tipo

### 2. Problema de cache do navegador

## Soluções

### Solução 1: limpar e reconstruir (recomendado)

```bash
# 1. 停止当前进程（Ctrl+C）

# 2. 清理所有构建产物
cd E:\GitProject\z-code\z-code
rm -rf packages/desktop/out
rm -rf packages/ui/dist
rm -rf packages/services/dist
rm -rf packages/shared/dist

# 3. 清理依赖缓存
rm -rf node_modules/.cache
rm -rf packages/desktop/node_modules/.vite

# 4. 重新构建
pnpm run build

# 5. 启动（增加内存限制）
$env:NODE_OPTIONS="--max-old-space-size=4096"
pnpm run dev:desktop
```

### Solução 2: verificar o console do navegador

Abra as ferramentas de desenvolvedor (F12) e veja a aba Console:
1. Se há erros de JavaScript
2. Se há requisições de rede que falharam
3. Ver o stack trace do erro

### Solução 3: remover temporariamente o código novo para testar

Se nenhuma das soluções acima funcionar, é possível remover temporariamente o registro dos novos serviços para verificar:

```typescript
// em packages/services/src/node.ts
// 注释掉这三行：
// .register(IHooksService, createHooksService())
// .register(IMemoryService, createMemoryService())
// .register(IOutputStyleService, createOutputStyleService())
```

Depois reconstruir e ver se o aplicativo inicia normalmente. Se iniciar, o problema está no nosso código; se continuar sem iniciar, a causa é outra.

## Coleta de informações de depuração

Se o problema persistir, colete as seguintes informações:

1. **Screenshot dos erros do console do navegador**
2. **Log de inicialização completo** (do início até a parte travada)
3. **Se o build tem erros** (a saída de `pnpm run build`)

## Localização do nosso código

Se for necessário reverter:
- `packages/shared/src/hooks.ts`
- `packages/shared/src/memory.ts`
- `packages/shared/src/output-style.ts`
- `packages/services/src/hooks/`
- `packages/services/src/memory/`
- `packages/services/src/output-style/`
- `packages/ui/src/store/hooksStore.ts`
- `packages/ui/src/store/memoryStore.ts`
- `packages/ui/src/store/outputStyleStore.ts`

## Observações

Os novos serviços e Stores **não têm lógica de inicialização automática**; a inicialização só acontece quando o método `initialize` é chamado manualmente em um componente de UI. Portanto, em tese, isso não deveria afetar a inicialização do aplicativo.