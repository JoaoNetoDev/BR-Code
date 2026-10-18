# Estabilidade de menções a arquivos locais e busca no Host

> 2026-09-16: o Composer `@` consulta candidatos de arquivo através do Host e não baixa mais o índice completo de arquivos.

## Escopo e contrato

- Apenas migrar a consulta e a titularidade do índice dos candidatos de arquivo do `@`; a árvore de arquivos e o centro de comandos continuam usando a interface original de lista em blocos.
- Reutilizar as regras atuais de `.zcodeignore`, filtro de diretórios, arquivos ocultos, links simbólicos e a busca/sortimento fuzzy existente. O algoritmo puramente de correspondência fica no shared, e o ponto de entrada antigo da UI continua reutilizando o mesmo algoritmo.
- Adicionar `IFileService.searchWorkspaceFiles({ rootPath, workspaceIdentity?, query, limit?, refresh? })`, retornando `WorkspaceFileEntry[]`. Padrão/máximo de 1000 itens; query vazia ainda respeita a ordem de prioridade de arquivos existente, e o Composer mantém a quantidade de prévias já existente.
- Essa interface passa apenas pelo RPC de arquivos já existente; não altera o RPC público, o protocolo de Agent, attachments nem a semântica de recuperação continuous/replayable.

## Estado, cache e temporização

```text
Renderer（关键词、当前查询结果、错误态）
    -> file.searchWorkspaceFiles(query, limit, workspaceIdentity)
    -> workspace 所在 Host（文件扫描/索引的唯一 owner）
       -> .zcodeignore + 60s 索引缓存 + 有界候选匹配
    <- 至多 limit 条候选

query / workspace / service / enabled 改变
    -> 旧查询结果失效 -> 仅最新查询可更新面板

loaded + 非空 query 无命中
    -> 本次 query 最多一次 refresh:true -> Host 绕过缓存重新扫描
error -> 停止自动请求 -> 关闭再打开/切换 workspace 或 service 才可恢复
```

- O cache pertence à instância do file service, é isolado por `workspaceIdentity?.trim() || rootPath` e valida a impressão digital de rootPath e `.zcodeignore`. O TTL curto do índice de 60s é consistente com a política atual do Host; varreduras com a mesma chave são deduplicadas; o cache tem limite de quantidade e remove entradas expiradas.
- Após a alteração das regras, a próxima consulta já é executada com as novas regras; um refresh não pode ser engolido por cache antigo, e uma varredura antiga concluída não pode sobrescrever uma varredura posterior.
- Fechar o painel limpa o estado de consulta/erro do Renderer; reabrir solicita ao Host. A UI não mantém mais o array completo de candidatos nem o Worker de busca de arquivos.
- O Host executa a construção e a correspondência de candidatos em lotes, cedendo o event loop entre lotes; os resultados ficam sujeitos ao limite de quantidade, e a entrada não carrega a transmissão/decodificação do índice completo.
- Tanto local quanto remoto usam o file service correspondente ao workspace atual; o mesmo caminho com identities diferentes, ou services diferentes, não compartilham cache nem consultas em andamento. O celular reutiliza o mesmo hook e o mesmo RPC, sem criar outro Host.

## Resumo de impacto

| Item                  | Conclusão                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Capacidade/camada    | Referência a arquivos no Composer; migração de option-source e dono do cache                                                              |
| UI Surface Matrix     | Composer `@` em desktop/celular -> MentionPlugin -> useFileMentionProvider -> file service; entrada/exibição na UI, índice no Host, Markdown após seleção inalterado |
| Compartilhamento e diferenças | `.zcodeignore` e algoritmo de correspondência compartilhados; árvore de arquivos/centro de comandos mantêm o caminho de dados completo com packed+Worker |
| must-inspect          | interface do file service, dono do índice, estado de resultado/erro mais recente do provider, isolamento entre workspaces                    |
| invariant-only        | protocolo RPC, os demais grupos de menção, árvore de arquivos/centro de comandos, continuous no desktop/replayable no celular            |
| Estado e submissão    | Índice em memória no Host; resultados limitados na UI; menção canônica após seleção e comportamento de envio inalterados, sem nova persistência |
| Codegraph             | useFileMentionProvider -> MentionPlugin -> LexicalChatInput (profundidade 2); o código da interface de lista de services segue o disco após o fast-forward, o índice está sendo reconstruído |
| Drift/atualização do grafo | A surface `@` existente lacks o dono do índice de arquivos; adicionar nós do service de busca do Host e relações options-from |
| Questões em aberto    | Nenhuma; esta sessão confirmou que apenas a busca de `@` muda, e o RPC público permanece inalterado                                   |

## Aceitação e plano de testes

| Caso   | Configuração e operação                                                      | Asserção/evidência                                                            |
| ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| MFH01  | Abrir `@`, buscar e selecionar em workspace grande; largura desktop e celular | A interface de busca retorna resultados limitados e não chama length/range; arquivo selecionável e entrada responsiva; UI E2E |
| MFH02  | Na mesma busca de índice: string vazia/nome/caminho/chinês/maiúsculas/sem resultado | Consistente com o sortimento fuzzy atual; testes unitários de service+algoritmo |
| MFH03  | Sem resultado, criar arquivo externo e buscar/rescanear                  | refresh contorna o cache; testes unitários de service e hook                   |
| MFH04  | Mudar palavra-chave, identity ou service durante resposta atrasada, ou fechar o painel | Resultados antigos não podem sobrescrever; teste unitário do hook            |
| MFH05  | Digitar mais texto após erro na consulta                                   | Sem loop de retry; fechar e reabrir recupera; teste unitário do hook          |
| MFH06  | Alterar `.zcodeignore`; dois services/identities com o mesmo caminho       | Novas regras valem e o isolamento se mantém; teste unitário do service         |
| MFH07  | Interface original da árvore de arquivos e do centro de comandos           | Retorno em blocos e compatibilidade do shared matching; testes unitários existentes |

Limites confirmados: preservar query vazia, quantidade, sortimento, estado terminal de falha e miss-refresh; não adicionar índice persistente, sistema de monitoramento de arquivos nem UI de busca. Tema e idioma não alteram a semântica; usa-se a mesma interface e a mesma menção canônica, com foco em validar o contrato de consulta e a interação desktop/celular. Os novos casos E2E permanecem em manual-review/pending; a promoção/admissão em CI segue o processo existente e não é promovida automaticamente nesta rodada.