# Marketing Touch: protocolo de navigate e copy_text

Atualizado em: 2026-09-11. Status: cliente já integrado, verificação com App isolado no macOS aprovada; a entrega de versões/plataformas pelo servidor e a semântica de estatística ainda exigem integração conjunta e não são uma declaração de já estar no ar.

A implementação existente está em [Integração do cliente Marketing Touch](marketing-touch-client.md). A atualização deste documento não significa que novas ações já podem ser entregues.

## 1. Escopo

| Ação | Status | Uso |
| --- | --- | --- |
| close | implementada, mantida | fecha o conteúdo de marketing |
| open_url | implementada, mantida | abre páginas HTTP/HTTPS |
| claim_zcode_plan | implementada, mantida | reutiliza elegibilidade, verificação de segurança e fluxo de resgate |
| navigate | nova nesta rodada, já implementada no cliente | navegação para seções de configurações, configurações de provedor, mercado de plugins e detalhes |
| copy_text | nova nesta rodada, já implementada no cliente | copia texto puro original, sem executar |

Fora de escopo de forma explícita: `create_task`, `select_model`, preenchimento de prompt, instalação/ativação de plugin, autorização automática, seleção de workspace e recursos de onboarding. Não se deve restaurar a lógica do fluxo antigo de resgate que trocava automaticamente conexão de plano e modelo.

Sem mudanças: banner apenas com imagem, botão com texto vazio, botão ghost circular transparente de fechamento/loading, exibição após o recurso estar pronto, polling oficial de 10 minutos / de teste de 30 segundos, decisão do servidor sobre reexibição, validação Hero ZIP e mecanismo de sandbox.

## 2. Estrutura comum de entrega

```json
{
  "text": { "format": "plaintext", "content": "打开插件市场", "style": null },
  "action": { "type": "navigate", "args": { "page": "plugin_marketplace" } }
}
```

| Posição | Exibição e operação |
| --- | --- |
| banner.buttons[] | no máximo um close e uma ação comum; a ação comum se vincula à imagem inteira, o texto pode ser vazio e apenas o rótulo de acessibilidade é preenchido |
| popup.buttons[] | botão visível de um popup independente |
| banner.success_popup.buttons[] | botão visível do popup de resultado de sucesso |

Não se adiciona um banner.action de nível superior nem se usam arrays de ações. O texto mantém o contrato existente de plaintext/html/markdown e style opcional/null, e style não é injetado diretamente no DOM.

## 3. Parâmetros de navigate

Define-se a page de nível superior settings, plugin_marketplace, upgrade e rewards. O identificador de protocolo estável é mapeado pelo cliente para as entradas existentes, sem expor caminhos de rota ou nomes de componentes ao servidor.

| Parâmetro | Tipo | Obrigatório | Restrição |
| --- | --- | --- | --- |
| page | enum | sim | settings / plugin_marketplace / upgrade / rewards |
| section | enum | não | usado apenas por settings, com valor da lista de permissões abaixo |
| provider_id | string | não | usado apenas por settings + models, identificador real e estável do provedor |
| plugin_id | string | não | usado apenas por plugin_marketplace, identificador completo do plugin do catálogo confiável |

IDs não vazios, no máximo 128 caracteres. Campos opcionais são omitidos, sem usar null para representar omissão. Para novas ações, args faz validação estrita de campos desconhecidos, enums e combinações de parâmetros; a entrega periférica mantém a estratégia atual de isolamento por item.

### Convidar amigos

`{"type":"navigate","args":{"page":"rewards"}}` não aceita outros argumentos, e o antigo page=referrals não é mais aceito. Abre a central de recompensas /{cn|en}/rewards, e o antigo /{cn|en}/referrals não é mais suportado. Banner, botões de popup e interação com pacotes de recursos compartilham o despacho de ações original e o envio de confirm. Suporte no cliente não significa que o servidor já começou a entregar.

Após o RewardsProvider receber a navegação, se o usuário já estiver logado abre diretamente; se não estiver, solicita app-login de forma unificada e registra o loginAttemptId desta vez. Abre quando tiver sucesso e o user estiver pronto, e limpa em caso de cancelamento, falha ou substituição da tentativa; não abre de novo por um login posterior sem relação. Essa intenção pendente não fica no controller de marketing, que é recriado após o login. O confirm significa que a intenção de navegação foi recebida, não que o login ou o resgate foi bem-sucedido; não se adiciona nem se duplica o envio do relatório.

```text
navigate(rewards) → RewardsProvider → 已登录：打开
                                      → 未登录：记录登录尝试 ID
                                          → 同 ID 成功且 user 就绪：打开一次
                                          → 取消/失败/新 ID：清除
```

O desktop usa o WebView isolado existente; Web e celular usam a abertura externa HTTPS existente, sem encaminhar o token do App. Idioma, tema, ambiente e autenticação seguem o contrato de integração do Rewards, sem alterar o estado de tarefas e de controle remoto.

### Lista de permissões de seções de configurações

| Página | section entregue | identificador interno atual |
| --- | --- | --- |
| Geral | general | general |
| Aparência | appearance | appearance |
| Configurações de modelos | models | modelProvider |
| Controle do navegador | browser | browser |
| Controle do computador | computer_use | computerUse |
| Memória | memory | memory |
| Subagentes | subagents | subagents |
| Gerenciamento de plugins | plugins | plugin |
| Servidores MCP | mcp | mcp |
| Skills | skills | skill |
| Comandos | commands | commands |
| Hooks | hooks | hooks |
| Índice | indexing | indexing |
| Estatísticas de uso | usage | usage |

Quando section é omitido, vale a seção padrão/anterior das configurações; se as configurações já estiverem abertas, ativa-se a página existente. O "guia" no rodapé não é uma seção comum de configurações e não entra nesta rodada. Não se repassam como são identificadores internos históricos como plugins ou automations.

Abrir as configurações de modelos:

```json
{ "type": "navigate", "args": { "page": "settings", "section": "models" } }
```

Localizar um provedor específico: apenas localizar, sem trocar modelo/plano/conexão e sem autorização automática:

```json
{
  "type": "navigate",
  "args": { "page": "settings", "section": "models", "provider_id": "<实际提供商标识>" }
}
```

Abrir as skills:

```json
{ "type": "navigate", "args": { "page": "settings", "section": "skills" } }
```

### Gerenciamento de plugins e mercado de plugins

| Objetivo | args completos | Limite |
| --- | --- | --- |
| Gerenciar plugins instalados | `{"page":"settings","section":"plugins"}` | abre apenas a página inicial de gerenciamento |
| Navegar pelo mercado de plugins | `{"page":"plugin_marketplace"}` | abre apenas a página inicial do mercado |
| Detalhes de um plugin do mercado | `{"page":"plugin_marketplace","plugin_id":"名称@市场"}` | mostra apenas os detalhes do plugin indicado |

```json
{ "type": "navigate", "args": { "page": "settings", "section": "plugins" } }
```

```json
{ "type": "navigate", "args": { "page": "plugin_marketplace" } }
```

```json
{
  "type": "navigate",
  "args": { "page": "plugin_marketplace", "plugin_id": "<插件名称>@<市场标识>" }
}
```

Não se adiciona uma page=plugin_detail separada; os detalhes são sempre expressos por plugin_marketplace + plugin_id. A entrada atual identifica o plugin por "nome@mercado" e o valor real deve vir do catálogo confiável; placeholders não podem ir para produção.

Nesta rodada não se localiza um plugin instalado específico, não há suporte a parâmetros de busca via query e não há instalação, ativação ou desinstalação automática. Quando o plugin indicado não existe, a falha é explícita, sem abrir silenciosamente a página inicial.

Não se adicionam os enums plans, help e release_notes; páginas externas continuam usando open_url. Não se aceitam rotas internas, URLs, nomes de componentes, caminhos locais ou métodos RPC arbitrários.

### Complemento da entrada de compra de upgrade

`{"type":"navigate","args":{"page":"upgrade"}}` reutiliza o CodingPlanUpgradeDialogProvider existente e a página de compra embutida do site oficial, e não aceita argumentos de plano/provedor/compra automática. O provedor segue a resolução atual do alvo de upgrade na barra lateral. Apenas o desktop suporta webview embutido; Web e celular falham explicitamente, sem criar um novo runtime de compra.

```text
营销点击 -> 当前升级入口 inventory 守卫 -> 原购买容器 -> webview dom-ready
              |                            |                 |
           未 ready: 失败             加载失败/关闭: 失败      confirm
              +----------------------------+                 |
                        恢复营销内容                      收口营销内容
```

Enquanto aguarda, o Dialog de marketing é ocultado temporariamente e o snapshot do Controller é preservado; um timeout de 30 segundos, mudança de conta ou desinstalação fecham o container pendente desta vez, e eventos atrasados não reportam sucesso. A entrada normal não muda. O login já foi migrado para o site oficial e o App não abre mais um login e depois retoma; a abertura bem-sucedida da página de compra significa navegação bem-sucedida, e cancelar o login na página ou fechar a página de compra depois disso não revoga o confirm, não equivale a compra bem-sucedida e não gera pedido nem pagamento. A atualização após a compra bem-sucedida continua igual.

Aceitação: rejeitar estritamente campos extras de upgrade; sem confirm quando inventory está indisponível, falha, fechamento ou cancelamento; o Popup de marketing desaparece e o confirm ocorre uma única vez após o webview isolado real ficar ready; regressão das entradas de upgrade existentes.

## 4. Parâmetros e feedback de copy_text

| Parâmetro | Tipo | Obrigatório | Restrição |
| --- | --- | --- | --- |
| text | string | sim | no máximo 20.000 caracteres; rejeita conteúdo só com espaços em branco; preserva o texto original e as quebras de linha |

```json
{
  "text": { "format": "plaintext", "content": "复制提示词", "style": null },
  "action": {
    "type": "copy_text",
    "args": { "text": "请帮我审查当前工作区的代码改动" }
  }
}
```

- Copia o texto puro original; mesmo contendo comandos ou HTML, não executa nem é interpretado como conteúdo executável.
- Não preenche campos de entrada, não cria tarefa e não envia automaticamente.
- Após o sucesso, mantém o Banner/Popup e não exibe success_popup.
- O botão do Popup mostra brevemente o "已复制" localizado e depois restaura o texto original, reutilizando o feedback existente de 2 segundos do popup comum.
- O Banner usa a mensagem de sucesso localizada, sem novo texto permanente.
- Em caso de falha na escrita, mostra o aviso e restaura a operação, sem exibir sucesso falso.
- O usuário pode clicar novamente e cada clique executa de fato a escrita; operações em andamento têm proteção contra cliques repetidos.

Não se adicionam parâmetros remotos como close_after_action, report_type e skip_confirmation; o comportamento é definido de forma fixa pelo cliente conforme a ação.

## 5. Execução e estado no cliente

O Marketing Touch Controller continua sendo o único owner da exibição de marketing e da operação atual. Navegação e área de transferência reutilizam as funcionalidades existentes por entradas estreitas de adaptação de capacidade, sem simular cliques no DOM e sem modificar diretamente estado de modelo, plugin ou tarefa.

```text
Banner / Popup 按钮
        |
        v
校验 type、args、当前平台能力
        |
        v
Controller 防连点
        +-- navigate --> 导航意图 --> 既有设置/市场入口
        |                                |
        |                                +--> 确认目标接管 --> 收口 + confirm
        |
        +-- copy_text --> 写入成功 --> 保留内容 + 成功提示 + confirm

失败 --> 恢复可操作状态 + 本地化提示，不报 confirm
```

### Adaptação de navegação

- settings registra primeiro a intenção de seção/provedor e depois abre ou ativa a página de configurações, reutilizando setPendingSettingsSectionIntent e openSettingsTab.
- plugin_marketplace reutiliza as entradas existentes de abertura do mercado e de localização de plugin.
- As atualizações de evento/estado das entradas existentes passam a ser complementadas por uma requisição única correlacionada dentro da janela e por confirmação de sucesso/falha; não se pode alegar que a página já foi exibida só porque foi possível despachar o evento.
- O critério de sucesso é a página alvo estar ativa e a localização de seção/provedor/plugin solicitada ter sido concluída; já estar no estado desejado também permite confirmar sucesso.
- Quando o alvo indicado não existe, a operação falha sem voltar silenciosamente à página inicial; enquanto a lista não terminou de carregar, aguarda-se o resultado de carga existente para evitar avaliação errada.
- A camada modal do popup de marketing e da página alvo é coordenada pelos mecanismos existentes para evitar disputa de foco; em caso de falha, a entrada de tentar novamente é mantida/restaurada.
- Após o sucesso de navigate, não se exibe success_popup, para não cobrir a nova página. Isso vale apenas para as novas ações e não muda os comportamentos existentes de resgate/link externo.
- navigate/copy_text não acionam a consulta imediata após um resgate, evitando que a consulta compita com o confirm assíncrono e cause sobreposição de popup antigo sobre o alvo; o polling periódico normal e a reexibição pelo servidor são mantidos, sem deduplicação histórica.
- O mercado de plugins fica no workspace: depois de enviar a intenção de mercado, ativa-se o workspace original (com workspaceIdentity), e o componente alvo verifica a identidade do workspace ativo e o estado de lista/detalhes antes de confirmar; não se pode considerar sucesso o fato de o componente estar montado atrás da camada de configurações.

### Adaptação da área de transferência

Prioriza-se a reutilização das capacidades existentes; quando falta uma entrada unificada, adiciona-se uma adaptação multiplataforma. A operação é disparada por clique do usuário e trata permissões, contexto seguro e limitações do host; o feedback e o relatório só ocorrem após a escrita bem-sucedida.

O despacho interno de navigate/copy_text do CloudContentDialog e o feedback de cópia já foram integrados ao Marketing Touch. A navegação usa um ID de botão interno para correlacionar os args originais, evitando perder section/provider_id/plugin_id; a função de tratamento da cópia repassa a falha ao popup comum e só exibe "已复制" em caso de sucesso real.

### Ciclo de vida e múltiplos dispositivos

- Durante a operação, a Campaign original, a geração da conta, a janela e o contexto da requisição ficam fixos; o polling não pode substituir o snapshot em execução.
- A imagem do Banner não muda e a posição de fechamento usa loading transparente, mantendo as estratégias de proteção contra cliques repetidos e de interceptação de fechamento.
- Capacidades assíncronas devem ter espera limitada; o timeout concreto é determinado pelas capacidades existentes, sem simular sucesso com atraso fixo.
- Após mudança de identidade, invalidação do alvo ou desinstalação, resultados atrasados não podem reabrir conteúdo de marketing antigo, e eventos antigos não podem ser reportados com credenciais novas.
- Descartar UI atrasado não equivale a desfazer os efeitos colaterais de navegação/cópia já produzidos; quando o resultado do timeout é incerto, não se repete a execução automaticamente.
- Não se alteram o polling, o cache de recursos e a regra de reexibição do mesmo ID, e não se adiciona blacklist histórico de Campaign.

```text
营销 Controller --> 能力适配 --> 既有设置/市场/剪贴板
桌面任务 desktop-continuous ------> 原实时链路（不变）
手机任务 web-remote-replayable ---> 原 shared-host / 恢复链路（不变）
```

Desktop/Web/celular reutilizam componentes e interfaces de capacidade e não chamam a API do Electron diretamente da UI compartilhada. Plataformas sem suporte à página falham de forma explícita, e o servidor restringe a entrega por versão/plataforma antecipadamente. Não se inicia outro Agent runtime, não se altera o remote attachment, o fluxo de tarefas ou o isolamento de identidade do workspace, e não se entrega caminho de workspace arbitrário.

## 6. Regras de relatório

Continua-se usando a interface existente, sem novo action_id:

```http
POST /api/v1/marketing/touch/action
Content-Type: application/json
X-Device-Mid: <合法 UUID>
X-Client-Language: zh-CN
X-ZCode-App-Version: <实际 App 版本>
Authorization: Bearer <登录时附带>
```

```json
{ "campaign_id": "<原始投放 ID>", "action_type": "confirm" }
```

A tabela abaixo é a semântica alvo do cliente; as regras de estatística que produzem múltiplos eventos ao copiar mantendo a visualização precisam ser confirmadas pelo servidor antes de a entrega ser liberada.

| Evento | Relatório | Conteúdo de marketing |
| --- | --- | --- |
| navigate com sucesso | confirm | fecha |
| navigate com falha | não reporta sucesso | mantém/restaura e avisa |
| copy_text com sucesso | um confirm por cópia realmente realizada | mantém |
| copy_text com falha | não reporta sucesso | mantém e avisa |
| Fechar Popup/Banner independente após copiar | cancel | fecha |
| Fechar o popup de resultado de resgate | não reporta cancel novamente | fecha |
| Executar uma nova navegação/cópia dentro do popup de resultado | reporta confirm após o sucesso | tratado conforme a ação |
| Consulta, download e exibição de recursos | não reporta show | inalterado |

confirm/cancel representam eventos de operação e não estados finais de conversão mutuamente exclusivos. Uma mesma entrega pode ter vários confirms e depois um cancel; fechar não revoga uma cópia bem-sucedida. Não se pode reintroduzir deduplicação entre ciclos de polling por causa disso.

A interface existente não distingue qual botão específico foi usado dentro de uma mesma entrega, não permitindo atribuição por botão; esta rodada não estende campos por conta própria. Um botão com texto "确认" mas com action=close continua reportando cancel.

Usuários anônimos reportam a dimensão de dispositivo com um UUID de dispositivo válido; após o login, registram usuário e dispositivo. Falha de relatório não reverte o sucesso do negócio nem bloqueia a UI, não há retry automático de POST com resultado incerto e não se aceita tempo do cliente.

## 7. Falhas, segurança e compatibilidade

| Cenário | Tratamento |
| --- | --- |
| Ação/página/seção/campo desconhecida | rejeita pelo isolamento por entrega já existente e registra o motivo, sem afetar outras posições de recurso legítimas |
| O alvo ou a capacidade desaparece após a exibição | valida de novo no clique, avisa a falha e não executa outra ação |
| Plataforma não suporta a página | aviso explícito, sem compensar com outro runtime |
| Permissão/falha de escrita na área de transferência | não avisa sucesso, não reporta confirm e permite nova tentativa |
| Mudança de conta / desinstalação / invalidação do alvo | invalida as correlações antigas e descarta a UI atrasada |
| Timeout com resultado incerto | orienta a verificar o estado, sem repetir o efeito colateral automaticamente |
| Falha no relatório | registro anonimizado, sem reverter navegação/cópia |

Não se aceitam scripts, RPC, credenciais, instalação silenciosa, alteração global de configuração ou operações pagas. O log registra apenas Campaign, ação, resultado e código de erro, sem saída de credenciais ou do texto completo copiado; a UI usa o logger existente.

O cliente novo é publicado primeiro e o servidor abre a entrega operacional por versão/plataforma do cliente, mantendo a validação final no cliente. Novas entregas incompatíveis com clientes antigos não podem ser liberadas em escala. Esta rodada não adiciona interface de negociação de capacidade.

## 8. Mudanças dos dois lados e ordem de implementação

| Escopo | Trabalho |
| --- | --- |
| Enums/modelo do servidor | registrar as duas ações e validar args estritamente por page/section |
| Formulário de navegação de configurações | dropdown de página/seção, com provedor opcional em models |
| Formulário de navegação do mercado | página inicial ou plugin indicado do catálogo confiável |
| Formulário de cópia | corpo em texto puro, com validação de tamanho e não vazio |
| Mapeamento do lado operacional para o cliente | definir explicitamente a origem do corpo copiado, sem misturar rótulo de botão e corpo |
| Estratégia de entrega | restrição por versão/plataforma e confirmação da semântica de estatística com múltiplos eventos |
| Shared | união discriminada de ações, campos e validação de combinações |
| Adaptação de navegação | reutilizar entradas e complementar correlação de requisição, conclusão e feedback de falha |
| Adaptação da área de transferência | escrita multiplataforma e feedback de sucesso/falha |
| Controller/exibição | fechamento na navegação, manutenção na cópia, reutilização de pending e do relatório |

Se o corpo copiado é configurado diretamente pelo lado operacional ou referência a biblioteca i18n existente é algo a ser avaliado pelo servidor; o cliente sempre recebe o args.text final no idioma atual, e não é exigido que o App interprete chaves i18n.

Ordem de implementação: confirmar spec/semântica de eventos → varrer as fronteiras de chamada → escrever primeiro os testes de Schema/comportamento → adaptação de capacidade e Controller → registro dos dois lados e restrições de versão → E2E em App isolado → integração com a entrega real. A UI não deve chamar o Repo diretamente e não se cria estado de modelo/plugin exclusivo de marketing.

## 9. Matriz de aceitação

| Categoria | O que deve ser verificado |
| --- | --- |
| Schema | todas as page/section, ausência/valor vazio, combinações erradas, campos desconhecidos, limites de tamanho |
| Configurações | todas as seções, reuso quando já aberta, página padrão, provedor existente/inexistente/carregando |
| Plugins | distinção entre gerenciamento e mercado, página inicial/detalhes, alvo inexistente, sem instalação/ativação automática |
| Navegação sem efeito colateral | não troca modelo, não muda conexão ou configuração, não cria tarefa |
| Cópia | texto original/quebras de linha/HTML como texto puro, sucesso, falha de permissão, cópia repetida |
| Exibição | fechamento na navegação, manutenção na cópia, nenhuma delas dispara success_popup, recuperação em caso de falha |
| Relatório | confirm/cancel, anônimo, fechamento após cópia, nova ação no popup de resultado, falha de relatório |
| Estado | proteção contra cliques repetidos, troca de conta, desinstalação, mudança de alvo, timeout, resultados atrasados |
| UI | Banner com texto vazio, fechamento/loading transparente, tema claro/escuro, chinês/inglês, teclado, tela estreita |
| Múltiplos dispositivos | caminhos suportados e não suportados em desktop/celular, cadeia de task/remote inalterada |
| Regressão | resgate, fechamento, polling, reexibição do mesmo ID, validação Hero ZIP e cache inalterados |

Na implementação, atualizar o spec, escrever testes antes do código e rodar arquitetura, tipos, Lint, testes unitários e App E2E. A aprovação do fixture isolado não equivale à qualificação em produção, à verificação de segurança real nem à aceitação em todas as plataformas; caminhos não verificados devem ser listados separadamente.

### Complemento das restrições de implementação

A navegação usa uma correlação de requisição única dentro da janela, e o componente alvo confirma após o commit do React; o limite de espera é de 30 segundos, cancelamento/timeout limpa a correlação e não há retry automático. A localização de provedor apenas altera o nó selecionado da página de configurações e não chama a lógica de salvamento do método de conexão; um provedor de plano dentro do mesmo family é localizado na página daquele family, mantendo o método de conexão atual do usuário. Os IDs reais de provedores embutidos têm o prefixo builtin: (por exemplo builtin:bigmodel) e não se pode usar o nome de exibição. A cópia reutiliza diretamente a Clipboard API do navegador, com limite de espera de 10 segundos e sem introduzir chamadas exclusivas do Electron.

## 10. A confirmar antes do lançamento

Origem do corpo copiado no lado operacional/i18n; estatística de múltiplos eventos no servidor; valores reais dos identificadores de provedor e plugin; disponibilidade de páginas em cada plataforma; feedback de conclusão de navegação e timeout por capacidade.

Critério de conclusão do cliente: as duas novas ações e os alvos listados implementados e aprovados na verificação isolada. O critério de lançamento exige ainda alinhamento da estratégia de versão/plataforma dos dois lados e da semântica de relatório; desta vez não se modifica o servidor externo.

## 11. Registro de verificação do cliente (2026-09-11)

- Incremento da entrada de upgrade: 6 arquivos de teste unitário relacionados, 96 casos aprovados; E2E de App isolado Electron no macOS, 12 casos aprovados, run `desktop-e2e-20260911061657474-p89925-d239ab3a54e48ea1`. Adicionados testes de parâmetro upgrade estrito, notificação única do resultado de abertura e cancelamento de eventos atrasados, além do cenário de confirm único após a página de compra embutida real ficar ready e de ausência de relatório de marketing adicional ao fechar a página de compra. Reutiliza-se o container de compra original; a renderização do popup de marketing foi dividida em MarketingDialogs, mantendo um único Controller. Login real no site oficial, pedido e pagamento não foram executados, e Windows/Linux/celular reais não foram verificados.
- 10 arquivos de teste unitário relacionados, 86 casos aprovados: Schema, adaptação de botões, cópia repetida, fechamento após cópia, nova ação no popup de resultado, timeout/cancelamento, correlação de navegação e regressões do resgate/polling/cache originais.
- E2E de App isolado Electron no macOS, 11 casos aprovados, run `desktop-e2e-20260911034056333-p11822-7b0e93cb78872140`. Inclui todas as 14 seções de configurações, localização de provedor sem alteração da configuração de conexão persistida, página inicial do mercado e detalhes do catálogo confiável, falha de provedor/plugin ausente, texto original real e escrita repetida na área de transferência, negação de permissão simulada e ledger confirm/cancel; mantém 5 regressões de entrega/resgate/ZIP anteriores.
- Problemas encontrados em tempo de execução e corrigidos: o mercado montado atrás da camada de configurações não pode ser confirmado como sucesso; novas ações não usam a consulta imediata após o resgate, evitando a corrida entre o relatório assíncrono e a nova consulta da entrega antiga. Os fixtures de teste usam correlação por entrega única, e relatórios antigos não podem limpar dados novos de teste; o caso original de reexibição da mesma campaign permanece inalterado.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm architecture:check --changed` e a verificação de formatação dos arquivos alterados passaram; `pnpm lint` ficou com 0 erros e 46 avisos preexistentes.
- Seguindo as restrições das skills architecture-governance / React / e2e-case-lifecycle, mantém-se um único Controller, correlação de navegação estreita e confirmação pelo componente alvo; o E2E permanece em manual-review/pending, sem promoção própria para a suíte oficial.
- Não verificado: entrega real das novas ações pelo servidor e estatística de múltiplos eventos, verificação de segurança real, Windows/Linux/celular em máquinas reais e aceitação visual manual em tela estreita nos dois temas. Desta vez não se modificou o servidor externo nem se restaurou a entrada de App Mock; o Hero ZIP permanece inalterado.
