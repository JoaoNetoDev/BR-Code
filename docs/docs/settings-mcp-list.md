# Lista de MCPs das Configurações

As linhas de MCP server nas configurações apresentam o escopo de posse como metadado compacto ao lado do nome do servidor.

- Os escopos User e Workspace usam o tratamento compartilhado de `Badge` das linhas de Skill.
- O badge usa `rounded-full`, `border-border`, `bg-surface` e `text-ui-sm`.
- Um ícone leader de 14px identifica o escopo: `UserRound` para User e `Folder` para Workspace.
- Os rótulos de escopo permanecem os valores localizados `User` / `Workspace`.
- Linhas de MCP configuradas não exibem o caminho do diretório de configuração que as sustenta; os dados de localização continuam disponíveis para a lógica de configuração e edição.
- Os pontos de status de runtime e os nomes de servidor compartilham um wrapper de layout, mas o elemento apenas com nome é dono de `text-foreground`; as cores de status não são herdadas do estilo de texto do nome do servidor.
- Pontos de status desconectado ou desconhecido usam o token de foreground terciário `text-foreground-subtlest`; conectado, conectando e erro mantêm suas cores semânticas.
- Passar o cursor sobre um ponto de status mostra o motivo. Servidores configurados usam explicações de runtime localizadas e preferem o erro real do servidor quando disponível; servidores de plugin reutilizam sua descrição de status resolvida, incluindo explicações de desabilitado e de autorização necessária.
- Tooltips de motivo de status usam `max-w-64`, para que explicações mais longas quebrem dentro de uma largura compacta de 256px.
- As descrições dos itens usam `text-ui-sm text-foreground-subtle` como texto secundário.
- Os metadados de contagem de ferramentas usam `text-ui-sm` tanto nas linhas de MCP configuradas quanto nas fornecidas por plugin.

As linhas de MCP fornecidas por plugin mostram a posse do plugin ao lado do nome do MCP server.

- A posse do plugin é expressa pelo título do grupo ao qual pertence; a linha não repete o badge de Plugin nem o marketplace.
- Os nomes de plugin usam o formatador canônico de display name, incluindo a conversão de nomes em formato de slug para palavras em title case.
- Os MCPs de plugin são agrupados por `pluginId` estável; nomes iguais com ids diferentes não são mesclados. Os grupos de plugin são ordenados pelo display name normalizado, com os itens pendentes primeiro dentro do grupo e os demais mantendo a ordem de declaração.
- O status de runtime é representado apenas pelo ponto de status e sua explicação no hover; as linhas de MCP de plugin não repetem o status como badge de texto. A contagem de ferramentas permanece como metadado separado.
- Os nomes de MCP de plugin reutilizam o ponto de status dos servidores configurados: conectado é verde, conectando é um spinner amarelo, erros são vermelhos, desconectado ou desconhecido é o foreground terciário, e autorização necessária é um ponto amarelo estático. Plugin desabilitado faz parte dessa resolução de status e tem precedência sobre o estado de runtime obsoleto, renderizando sempre um ponto estático de foreground terciário.

MCPs configurados e de plugin compartilham um único tratamento de falha: o resumo internacionalizado por `failureKind` usa a cor de texto secundário comum, e o estado de erro é representado em vermelho apenas pelo status dot. O `error` original é exibido sob demanda em um Popover por meio de um pequeno botão de informação depois do resumo; o request id do servidor já foi incorporated ao final desse texto de detalhes selecionável e copiável como um sufixo ` - <requestId>`, sem exibição separada nem um segundo botão de cópia. Não é permitido inferir a classificação de negócio a partir do texto do erro.
Conexão bem-sucedida, reconexão ou troca de workspace devem limpar os diagnósticos anteriores.

Os códigos de erro JSON-RPC do Server MCP oficial são primeiro convertidos em categorias estáveis da página de configurações: `1006` exibe "未登录，请先登录 ZCode" e `3101` exibe "当前账号没有 Coding Plan，请先购买或配置 Coding Plan"; essas duas categorias de aviso não são mais exibidas como o genérico "协议请求失败".

MCPs, Skills e Commands compartilham `SettingsResourceGroupHeader` e `SettingsResourceList`: `space-y-6` entre grupos, `space-y-4` dentro do grupo, título `h-7 text-ui-base`, contagem `text-ui-sm`, lista `rounded-xl bg-surface` e separadores entre linhas com `h-px bg-border/50` independente.