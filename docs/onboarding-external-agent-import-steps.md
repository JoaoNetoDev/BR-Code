# Etapas de importação de agente externo no assistente de migração do onboarding

## Contexto

A página de configurações já tem a capacidade básica de importar Skills, servidores MCP, plugins e comandos a partir de um agente externo. A importação de plugins ainda exige suporte do lado do Agent e a entrada está temporariamente oculta; o assistente de migração de dados do onboarding inicial precisa cobrir primeiro as importações disponíveis de Skills, servidores MCP e comandos.

## Objetivos

- Adicionar três etapas disponíveis de importação externa antes da migração final do assistente de migração do onboarding:
  - Skills
  - Servidores MCP
  - Comandos
- A etapa de importação de plugins fica temporariamente oculta, porque depende da conclusão do suporte do lado do Agent.
- A etapa de configurações de proxy fica temporariamente oculta; a configuração de proxy do Agent não é migrada no assistente de migração de dados do onboarding.
- Cada etapa reutiliza as interações do diálogo de importação da página de configurações: varredura, troca de scope, atualização, expansão da origem, seleção item a item, selecionar tudo/desmarcar tudo, destino da importação e forma de importação.
- A etapa de servidores MCP reutiliza a lógica de importação de MCP da página de configurações, apenas mesclando a configuração e sem exibir os modos de symlink/cópia.
- Ao entrar na etapa final de migração, o conteúdo selecionado nas três etapas de importação disponíveis é importado de forma unificada.

## Comportamento

- As três etapas de importação disponível fazem varredura sob demanda: a varredura da categoria atual ocorre quando o usuário entra na etapa correspondente, evitando disparar de uma vez todas as leituras de diretórios externos na primeira tela.
- O usuário pode não selecionar nenhum item de importação externa e seguir para a próxima etapa.
- "Iniciar migração" fica disponível quando pelo menos sessions ou algum item de importação externa está selecionado.
- O resultado da importação externa continua reutilizando as estatísticas de resultado do settings-sync, exibidas de forma unificada na página final com as contagens de importado com sucesso, pulado e falho.

## Compatibilidade

- Desktop e Web compartilham o estado de UI; o conteúdo efetivamente varrido é determinado pelo settings-sync service.
- O destino Project ainda depende do workspacePath atual; sem workspace, o destino Project fica desabilitado.
- Não são introduzidas origens relacionadas ao Gemini.