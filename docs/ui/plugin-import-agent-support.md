# Entrada de Importação de Plugins Temporariamente Oculta

## Contexto

A capacidade de importação de plugins já tem uma implementação básica do modal e dos passos de onboarding no frontend, mas a importação de plugins ainda depende do suporte do lado do Agent para ser aberta de forma estável.

## Comportamento Atual

- Configurações - Gerenciamento de Plugins: o botão "Importar plugins de um Agent externo" está temporariamente oculto.
- Onboarding - Assistente de migração de dados: o passo de importação de plugins está temporariamente oculto.
- Os passos de importação de Skills, servidores MCP e comandos permanecem visíveis, e o resumo da migração não contabiliza mais a seleção de importação de plugins.

## Condição de Restauração

Depois que o lado do Agent concluir o suporte à importação de plugins, a entrada em Gerenciamento de Plugins e o passo de importação de plugins do assistente de migração de dados podem ser restaurados e incluídos novamente no resumo das tarefas de migração.