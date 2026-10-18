# Soluções para Problemas Comuns do Ambiente de Desenvolvimento

## Problema: falha na alocação de memória do Vite

```
[vite] memory allocation of 668992 bytes failed
```

### Solução 1: aumentar o limite de memória do Node.js (recomendado)

Execute no PowerShell do Windows:

```powershell
$env:NODE_OPTIONS="--max-old-space-size=4096"
pnpm run dev:desktop
```

Ou execute no CMD:

```cmd
set NODE_OPTIONS=--max-old-space-size=4096
pnpm run dev:desktop
```

### Solução 2: limpar o cache

```bash
# limpar o cache do Vite
cd packages/desktop
rm -rf node_modules/.vite
rm -rf .vite

# limpar o cache de nível de projeto
cd ../..
rm -rf node_modules/.cache

# depois reiniciar
pnpm run dev:desktop
```

### Solução 3: reiniciar o terminal

Às vezes, fechar a janela atual do terminal e abrir um novo terminal resolve o problema.

## Problema: erros de tipo

Se aparecer um erro de tipo, tente primeiro:

```bash
# reconstruir os pacotes dependentes
pnpm run build

# ou reconstruir apenas o pacote shared
cd packages/shared
pnpm run build
```

## Funcionalidades já migradas

A arquitetura central das seguintes funcionalidades já foi migrada com sucesso:

- ✅ Serviço e Store de Hooks
- ✅ Serviço e Store de Memory
- ✅ Serviço e Store de OutputStyle

### Local dos arquivos de configuração

- Hooks: `<workspace>/.claude/settings.json`
- Memory: `<workspace>/MEMORY.md`
- OutputStyle: `~/.claude/output-styles/`

### Trabalhos seguintes

O trabalho restante é principalmente:
1. Migração de componentes de UI
2. Registro de instâncias de serviço
3. Testes de integração