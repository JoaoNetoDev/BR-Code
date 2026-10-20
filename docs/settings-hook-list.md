# Lista de Hooks nas Configurações

Hooks mantêm uma entrada própria nas configurações, sem serem incorporados à página de plugins. A
página reaproveita a arquitetura de informação de Scope, busca, títulos de grupo, contêiner de
lista e estado vazio de Plugins, MCPs, Skills e Commands.

## Scope e origem

- No topo, `<Scope> | Hooks {count}`, com a caixa de busca à direita.
- O Scope usa o `PluginScopeMenu` compartilhado: User exibe a configuração de usuário e os Hooks
  de plugins de usuário; Workspace exibe a configuração do workspace atual, as origens compatíveis
  e os Hooks fornecidos pelos plugins instalados nesse workspace.
- `workspaceIdentity?.trim() || workspacePath` é usado para isolar o estado do workspace;
  `workspacePath` é usado apenas para caminhos de leitura e escrita.
- O alvo de leitura e escrita é determinado apenas pela entrada de Scope selecionada
  (`resolveHookScopeTarget`): ao selecionar o projeto local, a identity fica vazia e o serviço
  local é usado, sem tomar emprestada a identity remota do workspace da conversa ativa; quando o
  User não tem projeto selecionado, segue a rota do workspace atual.
- Hooks de Workspace podem ser gerenciados, mas não entram no runtime do Agent conforme o
  contrato de segurança de `docs/hooks-runtime-contract.md`.
- O formulário de criação herda o Scope do nível pai; o formulário de edição exibe o Scope
  persistido e não permite migração. O Scope fica no canto superior direito do card do formulário,
  usando a estrutura horizontal `Scope + PluginScopeMenu` alinhada à direita, igual aos
  formulários de MCP e Command.

## Agrupamentos

`New` fica à direita do título do grupo `Installed`; a linha de título reaproveita o layout
`flex flex-wrap items-center justify-between gap-3` de Commands, sem altura fixa. Após a busca,
só são exibidos os grupos que contêm linhas visíveis, sem manter títulos vazios como `Installed 0`;
sem busca e com Installed vazio, o grupo é mantido como entrada de criação.

1. `Installed`: Hooks gerenciados diretamente pelo ZCode no Scope atual.
2. Um grupo por plugin: o título usa o nome normalizado do plugin, as linhas são somente leitura e
   o início/parada continua sendo gerenciado nas configurações do plugin.
3. `Legacy`: origens compatíveis `.agents` / `.claude`, com a ação Import.

`Installed` e `Legacy` são nomes de grupos de interface e devem ser internacionalizados via
`settings.hooks.group.*`; o título dos grupos de plugin vem do nome do plugin e não é traduzido. O
Hook Event é um identificador do protocolo de configuração e também mantém seu valor original.

Quando os metadados de Scope do plugin são desconhecidos, o Hook é mantido tanto em User quanto em
Workspace e exibe "作用域未知", evitando forjar a origem ou perdê-la silenciosamente.

## Item de Hook

- O título principal é o Hook Event (por exemplo, `PreToolUse`); o matcher não é mais usado como
  título.
- A segunda linha exibe o resumo do comando ou script, truncado em uma linha, usando
  `font-mono text-ui-sm text-foreground-subtle`.
- Configurações diretas e Legacy usam o ícone padrão `Anchor`, igual ao menu de configurações;
  Hooks de plugin usam o ícone do plugin correspondente, com fallback para `Anchor` quando o
  ícone do plugin não está disponível.
- Configurações diretas exibem um interruptor à direita e o clique na linha inteira abre a
  edição; Legacy exibe Import; Hooks de plugin são somente leitura e não exibem interruptor.
- Scope e nome do plugin não são repetidos dentro da linha; detalhes como matcher e runner ficam
  na edição ou na semântica de detalhes somente leitura.
- A lista usa `rounded-xl bg-surface`, e o divisor entre linhas é um elemento independente
  `h-px bg-border/50`.
- Conteúdo vazio, loading e busca sem resultado usam uniformemente um contêiner tracejado com
  fundo transparente.

Após modificar um Hook, a deferred draft session não utilizada continua sendo fechada; sessions
já em execução ou do histórico continuam usando o snapshot capturado no início.