# Tema padrão

## Estratégia atual

- Na primeira inicialização do aplicativo, quando não há valor persistido de `zcode-theme` localmente, o tema padrão é `dark`.
- Depois que o usuário troca o tema ativamente, a leitura prioriza o valor salvo localmente, que não é sobrescrito pelo valor padrão.

## Local da implementação

- Valor padrão da store Zustand: `packages/ui/src/store/index.ts`
- Valor de fallback do antigo hook `useTheme()`: `packages/ui/src/useTheme.ts`