# Ações de criação nas listas de Settings

As listas de recursos de Settings usam um tratamento único e consistente para a ação de criação da página.

- Commands, Subagents, MCP, Hooks, Skills e Plugins renderizam a ação de criação como um `Button` default. A ação de Plugins abre diretamente Add Marketplace Source, pois ela possui apenas uma ação de criação disponível.
- O botão usa `size="lg"` (`data-size="lg"` no DOM renderizado) e apresenta um ícone de mais à esquerda seguido do rótulo compacto `New` / `新建`. O ícone carrega `data-icon="inline-start"`, ativando o padding padrão de 8px à esquerda e 10px à direita. Seu rótulo acessível mantém o nome da ação específico do recurso.
- Commands, MCP e Skills renderizam sua ação de importação de nível de página como um `Button` outline com `size="lg"`, um ícone Lucide `Import` à esquerda e o rótulo de ação localizado.
- Os botões de importação de Commands, MCP e Skills usam o rótulo visível compacto `Import` / `导入`; seus rótulos acessíveis mantêm as descrições completas de importação de agente externo.
- A ação de importação fica imediatamente à esquerda da ação de criação. Outras ações utilitárias, como pasta, sincronização e refresh, permanecem antes do par importação/criação.
- Ações utilitárias de nível de página compostas apenas de ícone nos cabeçalhos das listas de Settings usam `variant="outline"` e `size="icon-lg"`. Ações de linha e ações de detalhe estão fora desta regra.
- A ação de criação é o último controle no grupo de ações do cabeçalho da lista.
- A regra vale igualmente para os layouts desktop e Web móvel, porque ambos renderizam as mesmas seções responsivas de settings.
- Automações ficam excluídas: a criação de scheduled-task e de off-peak usa seus próprios controles de múltiplas ações.
- Botões de envio de formulário e adições aninhadas, como adicionar um modelo ou schedule, estão fora desta regra.
- Importações contextuais, como uma ação de linha da lista de Hooks e as ações de confirmação de migração, estão fora desta regra de cabeçalho de página.