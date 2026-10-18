# Todo149: suporte a presets e configuração de requisição do OpenCode Go

Status: código e verificação offline concluídos, aguardando interface nativa / teste real do Go em produção (2026-09-14); nada publicado nem configuração de usuário alterada.

## Objetivo e problemas conhecidos

Suportar o OpenCode Go através do sistema de configuração de Provider existente, cobrindo tanto a criação por preset quanto o preenchimento manual do endereço Go por parte do fornecedor.
Sem novos tipos de Access, Schema de configuração, Runtime dedicado ou migração de banco de dados.

Instância Air em 2026-09-14: `new-provider / glm-5.3` usou corretamente
`https://opencode.ai/zen/go/v1` e Chat Completions no teste de conexão, mas retornou HTTP 400,
rejeitando explicitamente `enable_thinking` e `reasoning`. Na época, o revision 25 em cache não tinha
o mapeamento de site GLM Chat/Go correspondente, caindo no mapeamento genérico que gera simultaneamente
`thinking`, `enable_thinking`, `reasoning_effort` e `reasoning`.
ID da requisição: `2546e69c-330c-4653-9b70-c57088425cf7`.
Esta evidência apenas prova que dois campos foram rejeitados; não prova que os demais parâmetros, a
resposta e as chamadas de ferramentas sejam necessariamente compatíveis após a remoção.

## Requisitos de implementação

### 1. Três modelos de preset

No grupo "Outros" de "Adicionar provedor", adjacente ao Zen, reutilizando os ícones existentes do OpenCode para tema claro e escuro e o fluxo de criação:

| Template ID | Nome | Tipo de API | Principais famílias na tabela oficial de integração |
| --- | --- | --- | --- |
| `opencode-go-chat` | OpenCode Go (Chat) | `openai-chat-completions` | GLM、Kimi、DeepSeek、MiMo、LongCat、Hy |
| `opencode-go-messages` | OpenCode Go (Anthropic) | `anthropic-messages` | MiniMax、Qwen |
| `opencode-go-responses` | OpenCode Go (Responses) | `openai-responses` | GPT、Grok、Muse |

- Base URL comum: `https://opencode.ai/zen/go/v1`; Access usa `api-key`.
- Apenas um ponto de entrada para obter a API Key: `https://opencode.ai/auth`.
- Preservar o Model ID original do servidor, sem adicionar prefixo de namespace do cliente como `opencode-go/`.
- Modelos agrupados conforme o protocolo oficial do Go, sem copiar a lista completa do Zen; em especial, não colocar o MiniMax do Go no template Chat.
- Não alterar templates Zen existentes, IDs de provedores já criados, Keys, configurações pessoais nem histórico de Selection.

### 2. Correspondência unificada de configuração, cobrindo provedores próprios

```text
Criação por template Go ─────┐
                            ├─> Regra Built-in de endereço + tipo de API + Model ID
Preenchimento manual da URL Go ─┘                    |
                                                 v
                                      Override pessoal existente / modo manual
                                                 |
                                                 v
                                      Registry -> Model -> requisição
```

- As diferenças do Go ficam em `providerSiteRules`, declaradas pelo Base URL completo do Go, tipo de API e escopo de modelos;
  reutilizando a normalização de URL existente, cobrindo barra final, sem falsos positivos em Zen, domínios semelhantes ou outros caminhos.
- Com a mesma API de Provider e modelo, sem overrides pessoais, a criação por template e a criação manual devem resolver os mesmos parâmetros de execução.
  Regras exclusivas de Template cobrem apenas fatos do template como ativação padrão de membros; correções de compatibilidade de protocolo não ficam escondidas ali.
- Regras públicas precisas de modelos/API já existentes são reutilizadas diretamente; as diferenças do Go são cobertas por regras de site.
  A correção precisa substituir a expressão incorreta de mapeamento de raciocínio, e não apenas acrescentar campos ao mapeamento errado original.
- Mapeamentos pessoais do usuário e o modo manual após desativar a configuração inteligente continuam respeitando a prioridade atual; não limpar sobreposições antigas às escondidas.
  Portanto, a nova configuração corrige provedores próprios que herdaram recomendações, sem prometer sobrescrever configurações manuais erradas que o usuário já consolidou.
- O Runtime apenas consome o resultado resolvido; não adivinhar o protocolo pelo nome do Provider, nem trocar automaticamente de protocolo, modelo ou endereço Zen após uma falha de requisição.
- Não remover campos especificamente no teste de conexão; o chat formal e os demais pontos de entrada de consumo de modelos devem usar as mesmas regras de configuração.

### 3. Verificação do catálogo de modelos e dos parâmetros

- Priorizar a solução do GLM-5.3 já reproduzido e cobrir o GLM-5.3-Flash; verificar os campos exatos aceitos pelo Go e completar o mapeamento.
- Verificar contexto, saída máxima, capacidades de entrada, chamadas de ferramentas, níveis de raciocínio e mapeamento de parâmetros por "família de modelo × tipo de API".
  Os parâmetros Messages de MiniMax/Qwen não podem ser assumidos como idênticos aos de Claude ou OpenRouter.
- Os membros de modelo devem ser cruzados com a tabela oficial de endpoints do Go e o catálogo no momento da implementação; o endpoint público `/models` fornece apenas campos básicos como ID,
  não permitindo deduzir capacidades, direitos da conta ou sucesso da requisição. Modelos que aparecem apenas no catálogo, com protocolo/capacidade inconfirmável, ficam adiadas.
- A sugestão inicial habilita por padrão as versões principais já verificadas; versões antigas e experimentais vêm desabilitadas por padrão. Registrar a lista concreta e suas evidências na implementação.
  O Muse Contributor envolve dados de treinamento e termos regionais; recomenda-se deixá-lo desabilitado por padrão, sem usá-lo como modelo recomendado.
- Não portar para o Go capacidades de site do Coding Plan da Zhipu, como busca e pontes de imagem/vídeo.
- Nesta rodada, não refazer o mapeamento global genérico de raciocínio nem ampliar para a unificação do padrão `none/disabled`.

### 4. Cabeçalhos de requisição e entrega da configuração

- Reutilizar o `User-Agent: ZCode/<versão>` público, os cabeçalhos de versão e os cabeçalhos de sessão nativos; verificar a requisição real, sem se passar por outro cliente.
  O oficial já informou que o Go reconhece os cabeçalhos de sessão nativos do ZCode; `x-opencode-session` não é uma adição obrigatória nesta rodada.
- Autenticação por API Key comum, sem entrar no Sig da Zhipu, sem adicionar OAuth / contas de plano / consulta de cota.
- Editar apenas o Built-in de produção, gerando a configuração de teste via `pnpm provider:config:sync-test`;
  a URL do Go é a mesma nos dois ambientes. Atualizar o revision pelas regras existentes e verificar se a configuração final contém os templates e as regras de site.
- Não publicar automaticamente configuração remota nem modificar a configuração do usuário no Air; correções e testes reais usam configurações explicitamente autorizadas e cenários isolados.

## Superfície de impacto e limites

| Entrada | Mudança compartilhada | Estado preservado e limite de submissão |
| --- | --- | --- |
| Adicionar provedor, configurações de modelo | Lista de Templates, configuração de modelos recomendados | Rascunhos da página são salvos como Personal pelo Settings Service; campos recomendados não editados não são materializados |
| Teste de conexão | Resolução do Registry e parâmetros de requisição do Adapter formal | Prompts, orçamento e 판단 de conclusão em streaming existentes; a seleção de modelo da sessão não é modificada |
| Chat, automação, Subagent, Wiki etc. | Candidatos do Registry e configuração de requisição do Model | Padrões, herança, validação, submissão e persistência de cada entrada permanecem independentes |
| Workspace remoto e celular | Mesmas regras de execução após a entrega da configuração existente | Nenhuma nova cadeia de sincronização; os limites desktop continuous e celular replayable permanecem inalterados |

Obrigatório verificar: Built-in, prioridade de resolução de regras, criação em Settings e teste de conexão, corpo e cabeçalhos da requisição formal.
Foco de regressão: candidatos de modelo compartilhados, chamadas auxiliares, ausência de falsos positivos em Zen e outros provedores, consistência entre configuração de produção e de teste.
Não precisa mudar: Schema de Provider/Model, formato de persistência, identidade da conta, retomada de sessão, semântica de congelamento de Model em execução.

Ponto de partida da verificação de impacto somente-leitura: `ProviderTemplatePicker`, `ProviderSettingsFacade`, `ModelConfigRules.resolve`,
`providerSettingsConnectivity`, `AiSdkModelExecution.captureModelSnapshot`, `testModelConnectivity`.
A ferramenta codegraph não estava disponível desta vez; não foi executada varredura de grafo de chamadas em profundidade 2; o acima é evidência do código-fonte e dos logs atuais, o que não equivale a cobertura completa de testes.
Candidatos a desvio do grafo: a ativação de alguns Providers, as descrições de agrupamento de templates e o código atual / decisões recentes divergem; não ampliar o escopo desta tarefa por causa disso.
Sugestão de incremento do grafo: acrescentar aliases do Go e evidências de configuração de site sob as capacidades existentes de Provider Templates / Registry, sem criar novo dono de estado.

## Execução e aceitação

Atualizar primeiro as especificações de configuração relevantes e os cenários de teste, depois completar os testes e a implementação; validar em grupos por protocolo / família de modelo e, por fim, fazer uma revisão unificada.
Não bloquear outros modelos por causa de um modelo não confirmado; não registrar conexão parcial bem-sucedida como se todos os modelos tivessem passado.

- [x] Três templates, link único de Key, ícone e lista precisa de membros concluídos; defaults de ativação e origem das capacidades registrados.
- [x] Testes de configuração: resultado idêntico entre criação por template e manual, normalização de URL e correspondência negativa corretas, override pessoal / modo manual preservados.
- [x] Asserções do corpo de requisição do SDK oficial: URL / API reais, mapeamento de raciocínio, orçamento de saída, autenticação e cabeçalhos de versão / sessão corretos;
      GLM não envia mais campos rejeitados. Cada mapeamento distinto cobre os níveis públicos, não apenas o mais baixo.
- [ ] E2E de UI cobrindo criação por template, preenchimento da Key, lista / seleção de modelos e feedback de conexão; reutilizar o layout existente e verificar tema e tela estreita.
- [ ] Reteste real do problema do provedor próprio GLM-5.3 no Air, depois escolher modelos representativos conforme os três protocolos e os distintos mapeamentos de raciocínio para verificar
      conexão, chat e chamadas de ferramentas; registrar versão, revision do Builtin, resultado e request ID, sem registrar Keys.
- [ ] Cobrir direcionadamente chamadas de modelos auxiliares, sem alterar prompts de sistema; se houver restrição do servidor ou permissão insuficiente, marcar claramente como não testado / bloqueado.
- [x] Executar centralmente os testes unitários relevantes, typecheck, lint, verificação de sincronização de configuração e build dos artefatos de configuração; revisar os limites de consumo de configuração entre plataformas / remota.
- [x] Revisão de código bidirecional: as regras do Go foram integradas; Zen, outros domínios, overrides do usuário e a arquitetura de Provider existente não regrediram. O comportamento em produção ainda exige os testes reais acima.

## Itens a verificar e limites de parada

Verificações técnicas pendentes: mapeamentos nativos por família no Go, valores de capacidade, limites de orçamento de saída e a lista concreta habilitada por padrão inicialmente.
Isso não bloqueia corrigir primeiro o problema conhecido de GLM e a base dos templates; não adivinhar configuração para modelos desconhecidos.
Se for necessário adicionar adaptação de SDK, ampliar mudanças no mapeamento genérico ou alterar a semântica de override do usuário, apresentar primeiro as evidências específicas e o novo escopo, para decisão separada.
### Decisões desta implementação

- Cruzamento confirmado de 25 modelos entre a tabela oficial de endpoints do Go e os metadados `opencode-go` do models.dev; o switch de requisição do LongCat-2.0 ainda não foi confirmado, e as duas versões do Muse Contributor envolvem termos de dados adicionais, portanto não são pré-instaladas nesta rodada. Alias antigos sem protocolo declarado no catálogo também não são adicionados.
- Chat: GLM-5.3/Flash/5.2, DeepSeek V4, Kimi K3 e Hy usam a faixa de valores de effort declarada pelo Go e o `reasoning_effort` separado; não enviam os quatro conjuntos mistos de parâmetros genéricos. GLM-5.1, Kimi K2.6/K2.7 Code e MiMo usam o modo de pensamento intrínseco do servidor (um único enabled, mapeamento de parâmetros vazio), sem simular opções de desligamento não confirmadas.
- Messages: MiniMax M3 usa adaptive/disabled; M2.7/M2.5 usam o modo de pensamento intrínseco, sem injetar Claude effort. Qwen reutiliza o mapeamento de modelos/API existente (enabled/disabled, 3.8 também carrega output_config.effort), sem adicionar o thinking budget fixo que é obrigatório para o Claude mas opcional para o Qwen.
- Responses: GPT 5.6 Luna e Grok 4.6 usam reasoning.effort. Todas as diferenças do Go em capacidade/modalidade/níveis ficam nas regras de site; Schema de saída não declarado não é inferido como ativo a partir do nome do modelo.
- Habilitados por padrão como principais atuais: GLM-5.3/Flash, Kimi K3/K2.7 Code, DeepSeek V4.1 Flash/V4 Pro, MiMo V2.5/Pro, MiniMax M3, Qwen3.8 Max/Flash, GPT 5.6 Luna, Grok4.6. Os demais modelos antigos e experimentais/preview vêm desabilitados por padrão, podendo ser habilitados manualmente.
- Cenário de aceitação de E2E de UI G149-01: o menu real de adição exibe os três templates Go; após criar cada um, verificar protocolo, endereço, membros de modelo e o ponto de entrada único de Key, com Key falsa isolada salva e relida. Protocolo de rede e resposta são cobertos por testes offline do SDK, sem acessar o Go com Key falsa no E2E. A interação existente do botão de conexão continua coberta por C91-04, sem repetir a alteração de seu teste não submetido.
- Fontes: [metadados de modelos do models.dev](https://models.dev/api.json), [parâmetros Messages compatíveis do fabricante](https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages). Configuração pública não equivale a teste real de todos os modelos em produção; registrar separadamente.

## Evidências de implementação e revisão (2026-09-14)

- Built-in revision 27: Chat 15, Messages 8, Responses 2, totalizando 25 modelos; 13 habilitados por padrão, 12 modelos antigos / experimentais desabilitados por padrão. Membros habilitados são listados antes dos desabilitados; produção / teste permanecem sincronizados pelo script de geração existente.
- A única alteração de produto é a configuração Built-in. A compatibilidade do Go é resolvida pelo Resolver existente por URL + API + model, e o override pessoal continua prevalecendo por último; não houve novo Runtime, Schema, lógica de conta, retentativa automática ou troca de protocolo.
- A revisão de cabeçalhos mostrou que o baseline atual já fornece `x-opencode-session` para o Go via `3b67992023`; esta rodada mantém e testa esse campo em conformidade com o `x-session-id` nativo, sem remover capacidade existente nem duplicar caminho de cabeçalho. Cabeçalho de versão, UA, API Key e asserções de ausência de Sig passaram.
- Primeiro vermelho, depois verde: os casos de configuração falharam inicialmente em 13 itens; os casos do SDK oficial falharam inicialmente em 8 itens; capturaram respectivamente a falta de templates, os quatro conjuntos de parâmetros incorretos, a faixa de valores públicos errada, diferenças de capacidade do Go e o MiniMax misturado com Claude effort.
- 5 arquivos de configuração: **56/56** passaram; 3 arquivos de Adapter (Go / novos modelos / cabeçalhos públicos): **81/81** passaram; build de configuração e scripts de sincronização: **20/20** passaram. Total de 157 itens (sem dupla contagem de reexecuções posteriores). Go adicionou 30 itens; os parâmetros do SDK foram enumerados pelos níveis públicos e pelo orçamento de 1/4096 Token, cobrindo corpo / intenção de ferramenta / decodificação de uso dos três protocolos. A resposta é dado sintético offline, não prova de sucesso real do Go em produção.
- `pnpm typecheck`, `tsc --noEmit` do Adapter e `pnpm --filter @zcode/desktop typecheck:e2e` passaram; `pnpm lint` raiz com 0 error / 42 warnings existentes; verificação de formatação dos arquivos novos passou. Portão de arquitetura: 0 baseline / 0 nova violação.
- As configurações de produção / teste foram de fato emitidas separadamente por `stageBuiltinProviderConfig`, ambas com revision 27 / 3 templates / 25 modelos, artefato `/tmp/opencode-go-build-kYChiD/zcode-builtin.json` (o último é o de test). A escolha de ambiente e o embedding real via tsup são cobertos pelos 20 testes de build acima; o pacote de instalação do desktop não foi reconstruído.
- Revisão por diff semântico: removendo os três templates Go, as 25 regras de site e as 25 regras padrão de membros de template desta rodada e restaurando o revision, a configuração inteira fica profundamente igual ao HEAD. Nada foi alterado no Zen, na API comum ou no fallback misto global.
- G149-01 foi escrito em `packages/desktop/test/e2e/settings/manual-review/pending/provider-opencode-go.test.ts` e passou na verificação de tipos do E2E. O Linux atual não tem DISPLAY, Xvfb nem Docker; os casos nativos do Electron não foram executados; tema claro / escuro, tela estreita, conexão / chat / chamada de ferramenta reais no Air e chamadas auxiliares permanecem não testados; nada foi implantado remotamente nem a configuração do Air foi sobrescrita.
- Esta rodada não inclui as alterações não submetidas do Todo144 já existentes no workspace; nada é enviado nem publicado online como Built-in; o Air não recebe automaticamente as novas regras por causa de um commit local.

## Materiais (pesquisa de 2026-09-14, revisados na implementação)

Complemento ao portão de push de 2026-09-15: os testes de equivalência do mapa histórico do Todo95 validam apenas o baseline original e não tratam o novo mapa de sites do Go
como item novo do baseline original. O escopo foi separado apenas para as regras de correspondência exatas de site do Go; seus membros de modelo completos, níveis públicos e parâmetros de requisição
continuam verificados por `opencode-go.test.ts` e `opencode-go-wire.test.ts`, sem atualizar snapshots do baseline histórico nem alterar a configuração do produto.

- [Integração, protocolo, compatibilidade de cliente e privacidade do Go](https://opencode.ai/docs/go/)
- [Catálogo público de modelos do Go](https://opencode.ai/zen/go/v1/models)
- Especificações atuais: `docs/working-memory/provider-refactor/design/registry/settings.md`,
  `docs/working-memory/provider-refactor/design/registry/request-compatibility-and-access-protocols.md`.