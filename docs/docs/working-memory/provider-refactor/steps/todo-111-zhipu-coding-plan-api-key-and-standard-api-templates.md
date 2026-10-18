# Todo 111: Quatro modelos de API da Zhipu e validação segura de requisições com Key manual do Coding Plan

> Atualização de nomenclatura em 2026-09-14: os nomes em chinês e inglês dos dois modelos da linha superior foram unificados como `BigModel Coding Plan` e `Z.AI Coding Plan`, removendo o `API` final; `BigModel API` e `Z.AI API`, na linha inferior, permanecem inalterados. Este item substitui a nomenclatura histórica abaixo. Os nomes continuam sendo fornecidos de forma unificada pelo `templateNameMap` do Built-in; a configuração de produção gera a configuração de teste após a modificação, sem adicionar casos especiais no frontend. Não modificam-se IDs de modelo, Access, URL, capacidades de modelo nem nomes de Personal Provider já existentes, e não há migração de dados.

> Status: quatro modelos, novo Access, validação segura de requisições em ambas as pontas e verificação no navegador concluídos. 2026-09-10. Evidências de implementação/teste, revisão item a item dos limites e limitações do ambiente real estão em [revisão de entrega deste lote](./provider-todos-105-113-delivery-review.md).
>
> Atualização de Goal em 2026-09-11: o Todo120 concluiu 32 grupos de testes pareados e de testes de camada compartilhada (147 no total); para os dois endereços oficiais e os dois tipos de Access, a validação segura de requisições foi executada de fato, com HTTP200 e retorno normal de texto. A limitação abaixo “o novo caminho de Key comum do Z.ai não foi testado” é substituída por esta evidência; as limitações de instalação independente de Air/celular/SSH continuam válidas,veja a última seção do Todo120 (o documento do Todo120 é mantido apenas na versão oficial).

> A decisão posterior de 2026-09-11 já implementada, aguardando validação completa: complementa a validação segura de requisições com a admissão de uma Key comum `api-key` quando ela corresponder exatamente às URLs Anthropic oficiais do Coding Plan dos dois fornecedores. Este item substitui a limitação antiga abaixo “uma Key comum não entra na validação segura de requisições independentemente do endereço”; o Access persistido não é modificado e nenhuma migração de instâncias antigas é adicionada. Os limites atuais estão em [protocolo de requisição §5.2](../design/registry/request-compatibility-and-access-protocols.md#52-官方版本请求安全校验); as evidências existentes estão no fim do documento; a verificação completa de equivalência solicitada pelo usuário e a revisão são assumidas pelo Todo120 (documento mantido apenas na versão oficial) e não se pode afirmar que este complemento foi totalmente validado antes da sua conclusão.

## 1. Objetivo e escopo já decidido

Corrigir o problema de que os nomes, protocolos de acesso e endpoints reais dos modelos existentes `zai-api` / `bigmodel-api` são inconsistentes: os dois modelos atuais são endpoints do Coding Plan e devem ser renomeados como Coding Plan API e integrados à validação segura de requisições; além disso, adicionar dois modelos de API comum de verdade, totalizando quatro modelos com Key manual.

| Nome de exibição do modelo   | Protocolo de API padrão        | Base URL padrão                        | Access                               |
| ---------------------------- | ------------------------------ | -------------------------------------- | ------------------------------------ |
| Z.AI Coding Plan API         | `anthropic-messages`           | `https://api.z.ai/api/anthropic`       | novo `zhipu-coding-plan-api-key`     |
| BigModel Coding Plan API     | `anthropic-messages`           | `https://open.bigmodel.cn/api/anthropic` | novo `zhipu-coding-plan-api-key`   |
| Z.AI API                     | `openai-chat-completions`      | `https://api.z.ai/api/paas/v4`         | `api-key` existente                  |
| BigModel API                 | `openai-chat-completions`      | `https://open.bigmodel.cn/api/paas/v4` | `api-key` existente                  |

- O Coding Plan também tem um endpoint de Chat Completions, com o caminho `/api/coding/paas/v4`, que não pode ser misturado com o `/api/paas/v4` comum. Os valores padrão dos quatro modelos seguem a tabela acima; esta rodada não se expande para combinações de todos os modelos de protocolo.
- Os Providers pessoal/equipe conectados por autorização de conta continuam existindo de forma independente e não contam como estes quatro modelos de Key manual.
- O uso de Key de plano manual não depende do login OAuth do ZCode; Key pessoal/equipe compartilham este Access e, para Key de equipe, não se exige organização, projeto ou o fato da conta atual.
- Suportar acesso com Key não significa que o provedor oficial autorize qualquer distribuição de Key; não se transforma a descrição de negócio do usuário sobre distribuição em uma conclusão de autorização oficial verificada.

## 2. Cadeia de validação segura de requisições e limites de reuso

```text
Conta pessoal/equipe: zhipu-account
    -> serviço de conta obtém a Key de requisição --------+
                                                            |
Plano manual: zhipu-coding-plan-api-key +-> compartilha a validação segura de requisições da versão oficial
    -> lê a Key preenchida pelo usuário ------+                -> switch remoto / cache
                                                              -> retry / degradação
api-key comum
    -> mantém a autenticação comum, não entra na validação segura de requisições
```

1. O novo Access parte da configuração existente de Key manual e expressa ao menos `type` e `apiKey`, reutilizando os metadados de URL de obtenção da Key já existentes nos modelos. Não anexar campos exclusivos de conta como `current`, `entitled`, organização ou projeto.
2. Reutilizar a implementação e o transport existentes de validação segura de requisições da versão oficial, sem copiar o algoritmo, sem deixar o novo tipo chamar `AccountProviderRequestAuthService` para obter a Key e sem se disfarçar de `zhipu-account`.
3. A admissão da validação segura de requisições se baseia no Access explícito; em 2026-09-11 foi complementada com a correspondência exata da `api-key` comum às URLs completas dos dois planos oficiais. Não se pode ampliar a admissão pelo domínio inteiro, pelo nome do modelo, pelo ID do modelo ou pelo formato da Key; endereços de API comuns permanecem fora da validação.
4. Reutilizar o switch remoto, o cache isolado por Key, o cancelamento, o retry e a degradação já existentes na validação segura de requisições da versão oficial. O novo tipo não implica entrar obrigatoriamente na validação em qualquer situação.
5. Switch desligado/falha ao obtê-lo e falhas de validação que permitem degradação continuam sendo enviados sem validação conforme as regras existentes; quando o erro de validação indicado ainda falha após refresh e retry, mantém-se a degradação existente. Credenciais inválidas, contexto de requisição ausente e outros erros não degradáveis não devem ser engolidos pelo novo tipo.
6. A validação segura de requisições atual acessa apenas endereços HTTPS de mesma origem do endpoint do modelo, não segue redirecionamentos e não possui lista branca de domínios oficiais; não se deve chamar “mesma origem” de “enviado apenas ao oficial”. Os modelos usam os endereços oficiais padrão já confirmados; se a intenção for alterar a faixa editável de endereços ou adicionar lista branca, isso deve ser decidido em separado, sem alterar de passagem a política existente.
7. O novo tipo continua usando a integridade de configuração, a elegibilidade de execução de modelo e o mecanismo de salvamento de configuração pessoal da categoria de Key comum; não deriva direitos de conta, cota de plano, elegibilidade de horário de folga nem troca automática de conta.
8. O teste de conexão e a chamada normal de modelo compartilham a cadeia de requisições, mantendo o Prompt de lista branca do teste de conexão já existente; não se inventa outro conjunto de mensagens de sondagem para Keys de plano manual.

## 3. Configuração e consumidores precisam estar plenamente conectados

O código atual só conhece `api-key | zhipu-account`; o novo tipo não pode alterar apenas a função de admissão da validação segura de requisições.

- Schema esparso/completo do Access, objeto de configuração, Overlay, desserialização, tipos completos do Registry e serialização devem suportar o novo tipo; ramos exaustivos não podem deixá-lo cair no ramo Account.
- A página de configurações deve reutilizar exibição, inicialização, verificação de sujeira, salvamento e entrada de obtenção de Key da Key manual. Hoje o `ProviderDraftSave` grava `type: api-key` de forma fixa ao salvar; é preciso preservar o tipo de Access real para não perder a validação segura de requisições após uma edição.
- A conversão de configuração do Adapter deve preservar simultaneamente a Key e o fato do protocolo de acesso, em vez de passar apenas `accountAccess` da conta e perder a informação de admissão da validação segura de requisições do novo tipo.
- Convergir o julgamento comum de “categoria de Key manual”, sem copiar uma divisão binária incompleta em cada chamador; consumidores exclusivos de conta continuam julgando explicitamente `zhipu-account`.
- Verificar a entrega de configuração de Provider local e remota, a serialização no Worker e a vinculação em tempo de requisição para não perder tipo/Key; a validação segura de requisições acontece no Adapter de execução já existente, e não deve haver uma implementação separada para desktop, celular e SSH.
- Nomes, descrições e textos de acessibilidade dos modelos consistentes em chinês e inglês; com ou sem Key, exibe-se a entrada de obtenção declarada, seguindo o Todo107.

### 3.1 Adicionar provedor: dois grupos e estilos (já decidido)

A mesma página de adição é dividida em dois grupos, “智谱” (Zhipu) e “其他” (Outros), sem adicionar Tabs, gavetas, acordeões ou páginas extras; apenas reorganiza-se o layout das entradas, reutilizando os cartões existentes e o fluxo de criação.

```text
Adicionar provedor
    | 20px
Zhipu
    | 12px
[BigModel Coding Plan API]  [Z.AI Coding Plan API]
[BigModel API]              [Z.AI API]
    | 24px (da base dos cartões do grupo superior ao título do grupo inferior)
Outros
    | 12px
[Criar provedor customizado]           [Outros modelos predefinidos……]
```

- “Zhipu” é fixado nesses quatro modelos de Key manual: planos em uma linha, API comum em outra, BigModel antes e Z.AI depois; a entrada de conexão por login de conta não é misturada.
- Em “Outros”, o primeiro item é criar provedor customizado; os outros modelos mantêm a ordem atual; cada modelo aparece apenas uma vez, sem omissões nem duplicatas.
- O título do grupo alinha-se à borda esquerda dos cartões, sem recuo até o texto interno do cartão. Sem ícones, linhas horizontais, selos de quantidade, cor de fundo de grupo ou moldura extra.
- Seguir o `DESIGN.md`, usando apenas tokens semânticos existentes. Os tamanhos de fonte abaixo são os valores no tamanho de fonte padrão da interface; não fixar tamanhos em pixels, eles variam com a configuração de tamanho de fonte da interface do usuário.

| Elemento                             | Estilo decidido                                                            |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Título da página “Adicionar provedor” | manter `text-ui-lg font-semibold text-foreground`, padrão 16px              |
| Título de grupo “Zhipu/Outros”       | `text-ui-base font-medium text-foreground-subtle`, padrão 14px              |
| Da barra de título da página ao título do primeiro grupo | 20px                                        |
| Do título do grupo aos cartões do grupo | 12px                                                                       |
| Espaçamento horizontal/vertical dos cartões | manter 8px                                                            |
| Da base dos cartões do grupo superior ao título do grupo inferior | 24px                       |
| Tamanho dos cartões                   | manter altura base 64px, padding lateral 16px, seguindo raio, Logo, cores e estados de interação existentes |

- Desktop/Web largo em duas colunas, celular em tela estreita em coluna única; ordem dos grupos, hierarquia de tamanhos de fonte e espaçamentos permanecem. Nomes longos podem ocupar duas linhas, sem depender de Tooltip ou truncar e ocultar diferenças como Coding Plan API; se o aumento do tamanho de fonte ainda não bastar para duas linhas, o cartão pode crescer em altura, sem corte por altura fixa.
- Chinês e inglês sincronizados, com os títulos de grupo correspondendo a `智谱 / Zhipu` e `其他 / Other`; os dois temas usam cores semânticas em comum, sem fixar cinzas. Preservar a acessibilidade por teclado e os estilos de foco existentes.

## 4. Camadas de capacidade do modelo

### 4.1 Visão: enhancements do próprio modelo e do endpoint separadas

- O `GLM-5.3` da API comum é de entrada somente texto; não habilitar imagens/vídeo nas regras gerais de modelo por causa das ferramentas de visão oferecidas pelo Coding Plan.
- O `GLM-5.3-Flash` é multimodal nativo, com suporte declarado oficialmente a imagens, vídeo e arquivos; não pode ser desativado junto com o GLM-5.3. A codificação de arquivos específicos/PDF ainda precisa ser conferida conforme o suporte atual do Adapter; não se pode tomar o rótulo genérico “File” como se todos os formatos de arquivo já estivessem integrados.
- As regras de modelo atuais já desligam imagem/vídeo no GLM-5.3 e ligam separadamente no Flash; as regras do site de planos habilitam a capacidade de entrada separadamente. Preservar essa estratificação, verificando item a item o resultado final, sem difusão de capacidade do site por causa da inclusão de novos modelos.
- A ferramenta de visão do Coding Plan e a visão nativa do modelo não são o mesmo fato; apenas mejoras cujo endpoint de destino realmente aceita aquela entrada vão para as regras do site; a existência de um MCP cliente independente não prova diretamente que o endpoint do modelo aceita imagens.
- Seguir as decisões já tomadas: uma URL, uma regra de site, configuração mainstream/oficial com prioridade, e Personal com sobreposição final. As correções relacionadas de MCS e Start/horário de folga ficam por conta do Todo106, sem duplicar outro conjunto de regras.

### 4.2 Busca na API comum: o serviço tem capacidade, mas o Adapter atual ainda não integra

A documentação oficial tem tanto uma Web Search API independente quanto a busca dentro da conversa via `tools: [{ type: "web_search", ... }]` em Chat Completions. Não se pode resumir isso como “apenas Coding Plan tem busca”.

Hoje `toAiSdkProviderNativeTool()` suporta apenas a codificação nativa WebSearch do Anthropic; Chat Completions gera erro de codificação não suportada. Apenas definir `supportsNativeWebSearch: true` não é uma integração válida.

- Decisão final: a API comum BigModel/Z.ai não habilita o WebSearch embutido por enquanto; nesta rodada não se faz adaptação do Adapter de busca, e deixa-se de listar como pendente de decisão ou funcionalidade obrigatória desta rodada.
- A busca em Chat Completions dos dois fornecedores é a extensão do fornecedor `tools[].web_search`, e não o `web_search_options` de alto nível do OpenAI Chat Completions; também não deve ser confundida com a ferramenta de mesmo nome do OpenAI Responses. Se for integrada no futuro, o formato de requisição e de resultado deve ser conferido separadamente.
- A configuração final dos novos modelos de API comum não pode declarar falsamente suporte a busca embutida; isso não desliga a busca já existente do Coding Plan nem altera outras ferramentas de busca. Exemplos oficiais de modelos antigos não contam como validação das combinações de busca do GLM-5.3.

### 4.3 Outras configurações relacionadas

- As listas de modelos da API comum e do Coding Plan devem ser conferidas separadamente; não se pode copiar a lista ampla atual diretamente como lista de suporte dos planos.
- Níveis de raciocínio/Mapping, limite de saída, saída estruturada, MCS e entrada de mídia precisam ter o resultado final conferido por modelo + protocolo + endpoint; não se copia a configuração do Anthropic inteira para Chat Completions.
- Não misturar capacidade estática do modelo, autenticação de Access e direitos da conta em um único julgamento por causa da separação de interfaces; as capacidades continuam declaradas pela configuração unificada.

## 5. URL de obtenção da Key e exibição já decidida

Correção em 2026-09-11: a dupla entrada pessoal/equipe não atendia à expectativa do usuário e foi totalmente revogada pelo [Todo116](./todo-116-single-api-key-management-url.md). Mantém-se apenas `apiKeyManagementUrl` e um botão “Obter API Key”, seguindo o link principal original.

| Produto/identidade      | Link indicado pela documentação oficial            |
| ---------------------- | -------------------------------------------------- |
| BigModel API comum     | `https://bigmodel.cn/usercenter/proj-mgmt/apikeys`  |
| BigModel Coding Plan   | `https://bigmodel.cn/coding-plan/personal/overview` |
| Z.ai API comum         | `https://z.ai/manage-apikey/apikey-list`            |
| Z.ai Coding Plan       | `https://z.ai/manage-apikey/apikey-list`            |

- Os modelos comum e de plano do Z.ai usam o mesmo link principal; não se inventam URLs para completar quatro links diferentes.
- Um modelo de plano pode aceitar Key pessoal/equipe, mas a entrada de obtenção não é dividida por identidade; a navegação pessoal/equipe dentro do console fica a cargo do usuário e não é inferida a partir da conta atual do ZCode.
- Obter a Key leva diretamente ao console da tabela acima, sem adotar uma página explicativa como substituta. Usar apenas `apiKeyManagementUrl`, sem manter campo exclusivo de equipe ou UI de dupla entrada, reutilizando o mesmo mecanismo de abertura por plataforma e sem codificar endereços no componente.
- A API comum usa a página de gerenciamento de Keys direta já confirmada; seguem a fonte única de metadados de modelo do Todo107 e o mecanismo de abertura por plataforma, sem manter uma segunda tabela de endereços no componente.

## 6. Organização dos modelos, sem migração de dados antigos

Nomenclatura de implementação: manter `zai-api` / `bigmodel-api` como a identidade interna dos modelos de plano existentes, com nome de exibição explicitamente acrescido de Coding Plan;
os novos modelos comuns são `zai-standard-api` / `bigmodel-standard-api`. Assim não é necessário alterar as referências de modelo das entradas de login existentes,
nem transformar a organização dos modelos em reescrita de IDs históricos de Provider. Os presets de plano são convergidos para os atuais GLM-5.3 / GLM-5.3-Flash;
os modelos comuns mantêm o catálogo original de modelos comuns e normalizam os IDs conforme o Todo112, sem tratar o catálogo amplo antigo como declaração de direitos do plano.

- Decisão final do usuário: esses dois modelos ainda não são usados por ninguém; nesta rodada não se projeta migração de dados antigos nem tratamento de compatibilidade para eles. A formulação anterior “o Provider ID também muda” foi esclarecida como “não é necessária migração de dados”, e não como exigência de reescrever a identidade do Provider pessoal.
- `templateId` é o identificador do modelo predefinido; `providerId` é a identidade concreta do Provider na configuração Personal após a criação; são diferentes. Nomes/identificadores de modelos são organizados pelas quatro entradas, mas as instâncias concretas continuam reutilizando os mecanismos existentes de criação e identidade; o Provider ID não é recriado por causa da mudança de nome do modelo.
- Não implementar aliases de modelos antigos, conversão automática de Access/Overlay pessoal antigo,identificação de endpoints antigos nem reescrita de Selection histórica; não adicionar ramos de compatibilidade e testes de migração para estados intermediários de configurações nunca publicadas. Overlays explícitos existentes não recebem o novo Access automaticamente por causa da mudança de modelo, e não se declara como concluída essa migração fora de escopo.
- Não envolve migração de banco de dados de Session, nem modificação/limpeza em lote de Keys, configurações de modelo ou outros dados pessoais do usuário; cancelar a exigência de migração não equivale a autorizar a exclusão desses dados.

## 7. Evidências de verificação e arquivos-fonte

Materiais oficiais (data de verificação 2026-09-10):

- [Início rápido do Coding Plan da Zhipu](https://docs.bigmodel.cn/cn/coding-plan/quick-start), [início rápido da API comum](https://docs.bigmodel.cn/cn/guide/start/quick-start), [HTTP API](https://docs.bigmodel.cn/cn/guide/develop/http/introduction)：endpoints de plano/comum, caminhos de obtenção de Key pessoal/equipe.
- [Início rápido do Coding Plan do Z.ai](https://docs.z.ai/devpack/quick-start), [descrição da API comum](https://docs.z.ai/api-reference/introduction)：endpoints, entrada de Key e autenticação.
- [GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3), [GLM-5.3-Flash](https://docs.z.ai/guides/vlm/glm-5.3-flash)：diferença entre texto e multimodal nativo.
- [Busca da Zhipu](https://docs.bigmodel.cn/cn/guide/tools/web-search), [busca do Z.ai](https://docs.z.ai/guides/tools/web-search)：diferença entre busca independente e busca na conversa; não servem como base para afirmar que todos os modelos foram testados.

Código principal: `config/provider/zcode-builtin.json`; `packages/provider/src/config/provider-data-schema.ts`, `provider-config.ts`, `schema.ts` e `packages/provider/src/resolver.ts`; `packages/ui/src/settings/model-provider-section/ProviderDraftSave.ts`, `InlineEditableProviderCard.tsx`; `apps/zcode-cli/packages/adapters/src/model/model-execution.ts`, `tool-transform.ts`; a implementação de validação segura de requisições da versão oficial; `packages/services/src/model-provider/accountProviderRequestAuthService.ts`.

O design existente `design/registry/request-compatibility-and-access-protocols.md` limita explicitamente a validação segura de requisições da versão oficial à conta pessoal/equipe; este Todo é a decisão posterior que adiciona um Access explícito. Antes da implementação, atualizar esse spec e o grafo de funcionalidades; a `api-key` comum continua sem validação segura de requisições e o novo Access não é gravado no Model Config.

Na verificação somente-leitura anterior passaram 54 testes existentes de validação segura de requisições/switch/autenticação de conta e 33 testes de execução de modelo do Adapter; isso não significa que o novo tipo já esteja implementado ou validado em produção.

## 8. Testes, revisão e critérios de conclusão

- [x] Spec atualizado antes da implementação; a entrada de obtenção de Key foi corrigida pelo Todo116 conforme a decisão mais recente de entrada única em §5, e a busca da API comum fica fora desta rodada.
- [x] Primeiro, testes de Schema / Overlay / serialização: o novo tipo é válido e faz ida e volta completa, o tipo conta não é misturado e a ausência de Key afeta apenas a integridade deste Provider.
- [x] Nome, protocolo, endereço, Access, link de Key e lista dos quatro modelos corretos; asserções discriminantes para capacidades finais de comum/plano e GLM-5.3/Flash.
- [x] Salvar a edição da Key mantém o novo tipo, sem voltar para `api-key`; com ou sem Key exibe-se a entrada declarada, com chinês/inglês e em tela estreita.
- [x] Sem OAuth/conexão de conta, a Key de plano manual continua funcionando pela mesma validação segura de requisições; conta pessoal/equipe mantém o comportamento original, e Key comum, Start/horário de folga não são incluídos indevidamente na validação.
- [x] Usar mock transport e o Adapter real para capturar a requisição final, validando switch e validação segura de requisições nos endpoints de plano dos dois fornecedores, e que a requisição da API comum não entra na validação; cobrir isolamento por Key, degradação por falha e erros não degradáveis, sem acessar credenciais reais de usuário.
- [x] Verificar que o novo Access chega ao Host/Worker de destino, à atualização de configuração e à vinculação de modelo sem perdas, sem introduzir Runtime independente no celular ou outra cadeia de validação de segurança para SSH.
- [x] Ao criar instâncias a partir dos quatro tipos de modelo, a referência de modelo, o Access e a identidade do Provider pessoal estão corretos; sem migração de modelos/Overlay antigos, compatibilidade de alias ou reescrita de Selection histórica.
- [x] Os modelos de API comum não têm WebSearch embutido habilitado e nenhum novo Adapter de busca; a busca existente do Coding Plan não é afetada.
- [x] Membros, ordem e comportamento de criação do grupo “Adicionar provedor” corretos, com tamanho/cor/espaçamento do título conforme §3.1; cobrindo desktop com duas colunas, celular com uma coluna, chinês/inglês, temas claro/escuro, nomes longos e operação por teclado, sem regressão do feedback de criação existente.
- [x] Complementar ou atualizar os E2E interativos de configurações relevantes, executar regressão direcionada, verificação de tipos, lint e verificação de arquitetura para o lote inteiro, organizando a verificação por risco e sem repetir verificação completa ou Pro para cada item pequeno.
- [x] Revisar a integridade dos quatro modelos, a separação Access/Model/Account, a semântica de cobrança comum vs. plano, os consumidores implícitos e a atualização das decisões antigas; submeter código e evidências, sem push automático.

Só é possível declarar esse escopo concluído depois que todo o escopo já decidido for implementado e verificado. A exibição do link de Key de plano não tem mais itens pendentes de decisão; a implementação e a validação da correção de entrada única estão no Todo116; a adaptação de busca da API comum foi explicitamente excluída desta rodada e não se escreve a gravação em disco do documento nem testes antigos aprovados como conclusão do item inteiro.

## 9. Validação de admissão complementar de URL e revisão de 2026-09-11

- O único ponto de implementação continua sendo a entrada de admissão da validação segura de requisições da versão oficial no Adapter, usando o Access/Base URL já vinculados. A correspondência afeta apenas se a mesma validação segura de requisições é usada; não há migração de configuração, gravação persistente, cache extra, ramo de UI/Host ou julgamento especial por nome de modelo.
- Testes vermelhos antes de verdes: a URL oficial, a barra final e as formas equivalentes de URL padrão da Key comum antes não entravam na validação e passam após a correção; caminho de API comum, outros caminhos, domínios semelhantes/de terceiros, porta não padrão, HTTP, query string e fragmento não entram indevidamente na validação. Com o switch desligado, mesmo havendo correspondência não se entra na validação, e o tipo explícito de plano existente continua suportando os endpoints personalizados originais.
- 2 arquivos direcionados do Adapter com 51 casos e 2 arquivos compartilhados de validação segura de requisições/switch com 47 casos, 98 no total, passaram, incluindo as exclusões existentes de conta Start/Off-Peak, isolamento por Key, cache, retry/degradação e limites de erro.
- Com uma Key autorizada pelo usuário, em configuração isolada em memória mantendo o Access como `api-key`, uma requisição real foi feita ao endpoint de plano oficial do BigModel: o fluxo de validação segura de requisições da versão oficial foi concluído, com a requisição final ao modelo em HTTP 200 e encerramento normal. O Prompt foi estritamente system `You are ZCode connectivity probe.` / user `hi`. A Key e os materiais de validação não foram gravados em documentos, configuração ou saída de diagnóstico; a configuração do Air não foi modificada.
- O typecheck da raiz, o typecheck do Adapter, o lint da raiz (41 warnings existentes, 0 erros), a verificação de formatação dos arquivos modificados e a verificação de arquitetura (baseline/new ambos 0) passaram. O lint de todo o diretório do Adapter continua falhando por problemas existentes como max-lines em arquivos não modificados, e isso não é ampliado aqui; o lint direcionado dos arquivos modificados passou.
- Esta rodada não alterou limites de interação e entrega de mensagens, não adicionou UI E2E; ambos os endereços têm asserção com SDK real + transport offline. O teste online do novo caminho de Key comum cobriu apenas o BigModel, e isso não é escrito como se Z.ai, o pacote de instalação do Air, um celular real ou SSH tivessem sido validados.