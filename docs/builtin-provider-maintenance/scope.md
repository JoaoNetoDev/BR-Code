# Escopo e princípios de manutenção

## Como o escopo mainstream é determinado

O objetivo de cobertura são os fornecedores mainstream e os modelos mainstream de programação e de Agent que os usuários realmente precisam, e não copiar o catálogo completo de alguma plataforma nem fixar permanentemente poucas marcas.

Ao avaliar um fornecedor ou um modelo, registre os seguintes fundamentos:

1. Relevância para o produto: código, raciocínio, chamada de ferramentas, Agent de múltiplas rodadas ou entrada multimodal necessária — é adequado à cadeia de execução atual?
2. Demanda: retorno dos usuários, uso existente, necessidade explícita de integração; a repercussão em notícias e as listas de classificação servem apenas de pistas e não decidem a entrada sozinhos.
3. Disponibilidade: existe um produto de API utilizável, um ID de modelo legal, credenciais obteníveis e requisitos explícitos de região/plano; um chat web disponível não significa uma API disponível.
4. Custo de manutenção: o protocolo, o loop de ferramentas, a resposta em streaming e a autenticação podem ser expressos de forma confiável pelas capacidades atuais; existe mantenedor contínuo e recurso de validação?
5. Ciclo de vida: status oficial, preview, apelido, data de descontinuação, modelos substitutos e mudanças de interface. Não se pode remover um modelo apenas com base na idade do número de versão.

<a id="新增与既有变更的授权边界"></a>

## Limites de autorização para novas adições e mudanças existentes

Confirmado em 2026-10-14: **as novas adições que estão de acordo com o escopo estabelecido, com o protocolo atual e com os requisitos de validação podem ser pesquisadas, especificadas/testadas, implementadas e submetidas em MR diretamente pelo mantenedor, sem pedir aprovação de produto item a item; modificações ou remoções de configurações existentes exigem antes explicar o plano a uma pessoa e discuti-lo até a confirmação, e só então executar.** Essa autorização não equivale a poder publicar, fazer chamadas pagas ou alterar a configuração do usuário.

| Ação                                                                               | Tratamento                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adicionar template, novo membro de modelo e regras que afetam apenas identidades novas | Pode avançar com evidência suficiente de material e protocolo; na falta de uma Key real para validação, desabilitar por padrão e marcar explicitamente como pendente de validação, sem parar por isso todo o trabalho preparatório que pode ser concluído |
| Ajustar as capacidades de um modelo existente, os valores de raciocínio/Map, a habilitação/desabilitação padrão, a ordenação, ou modificar URL, Access ou identidade de template já existentes | Listar primeiro o estado atual, os valores propostos, o motivo, as entradas/usuários afetados e a solução de compatibilidade; implementar após a confirmação da discussão |
| Remover, rebaixar, desabilitar, substituir um modelo ou template                        | O mesmo; o anúncio oficial de descontinuação e a ausência no catálogo são evidência para a discussão, não autorização automática de execução |
| Adicionar uma regra ampla, que vá atingir modelos existentes ou outras entradas        | Tratar como mudança existente; não contornar a discussão com "é só acrescentar JSON" — comparar antes os resultados de resolução dos membros antigos |
| Incrementar a revision para as novas adições, derivar a configuração de teste, atualizar o inventário e a documentação de manutenção | Parte necessária do trabalho de adição, pode ser concluída diretamente; não deve embutir outras mudanças de configuração |

A discussão é feita por diferenças concretas antes/depois; quando o escopo da autorização já está claro, não se pergunta de novo. A pesquisa e o registro de lacunas podem continuar avançando, e as mudanças existentes não confirmadas são listadas separadamente como pendentes de discussão, sem bloquear as adições novas e independentes. O estado de ausência de Key e a autorização de nova adição são registrados separadamente.

Complementar confirmado em 2026-10-15: **tudo o que exigir uma adaptação de integração adicional fica adiado; os fornecedores, as entradas de produto e os modelos que a cadeia de execução atual consegue suportar diretamente podem avançar, sem pedir aprovação de integração item a item.** Lotes indicam apenas a ordem de implementação, e não se deve ler "em seguida" ou "conforme a demanda" como se ainda não houvesse autorização. A unidade de julgamento continua sendo a entrada de produto, o modelo e o protocolo específicos, e não a marca como um todo.

No curto prazo, são usados apenas os três API type existentes: `anthropic-messages`, `openai-chat-completions` e `openai-responses`. Adicionar templates, membros, campos de capacidade e o mapeamento de parâmetros no Option Map existente é manutenção de configuração; adicionar protocolos ou métodos de autenticação, credenciais/Headers dinâmicos, codificação de requisição, fluxo de resposta ou conversão de histórico, além de adicionar/upgradear SDK por compatibilidade, é adaptação adicional e fica adiado nesta rodada. Testes de rotina, documentação, Logo e manutenção de nomes não são adaptação de protocolo.

A API Gemini nativa do Google fica adiada; a entrada oficial compatível e as entradas agregadas podem avançar conforme o princípio de adição caso se prove que a cadeia de execução atual não precisa de mudanças, e não podem ser descritas como suporte a protocolo nativo. A Mistral também fica adiada nos caminhos que exigem conversão de blocos de resposta/histórico, nas entradas em nuvem que exigem renovação de autenticação e nos caminhos que exigem nova fiação de Header de sessão; basta registrar a lacuna, sem desenvolver a adaptação junto desta rodada de expansão. O fato de o oficial ter um endpoint compatível não significa que o loop de ferramentas já passou; os requisitos de material, validação com Key e habilitação padrão permanecem iguais, e as configurações existentes ficam como estão.

No mesmo turno em que a conclusão é formada, o princípio de adição é atualizado neste diretório: o escopo entra nesta página, o processo é sincronizado com o fluxo de manutenção, os candidatos/exceções concretos atualizam o plano de expansão; não pode ficar só no chat ou em comentários de MR.

## As três listas

| Lista                | Significado                                        | Como entra na configuração                                                                          |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Mantida              | Templates e membros de modelo do JSON atual         | Ver [Estado atual](./current-state.md); não significa que tudo foi testado nesta rodada             |
| Em observação        | Novos modelos de fornecedores mainstream, lacunas em entradas existentes, possíveis novos fornecedores | Coletar evidências, validar e submeter um MR de configuração separadamente           |
| Aguardando design de capacidade | Novos protocolos, credenciais de nuvem, identidades de deploy, etc., além do contrato atual | Adiados nesta rodada com a lacuna registrada; confirmados separadamente mais adiante, sem contornar com configuração de compatibilidade falsa |

A cobertura existente inclui Z.AI, BigModel, Kimi, MiniMax, DeepSeek, Qwen, MiMo, OpenAI, Anthropic, xAI, além de OpenRouter e OpenCode Go/Zen. As entradas e os modelos concretos são os do estado atual e do JSON.

O escopo de observação da expansão inclui Google Gemini, Mistral, Tencent TokenHub, Volcano Ark, StepFun, SiliconFlow e entradas em nuvem como Azure e AWS Bedrock; esta não é a lista de todos os candidatos que já atendem às condições de integração; os itens de acordo com o princípio de adição acima não precisam de nova aprovação item a item. As evidências atuais, os modelos concretos, a prioridade e as condições não verificadas estão no [Plano de expansão](./expansion-plan.md). O protocolo nativo do Google e o Vertex, as credenciais de plataforma em nuvem/nomes de deploy, etc. são avaliados separadamente; API compatível, protocolo nativo e autenticação por identidade em nuvem não podem ser fundidos em uma única conclusão.

A investigação de entradas em nuvem precisa primeiro esclarecer o caminho real de produto, para só então decidir se dá para expressar com um template comum. Em 2026-10-14, os seguintes contratos oficiais foram conferidos, mas as credenciais reais e a cadeia de execução ainda não foram validadas; os links de evidência e os candidatos estão no plano de expansão:

- Azure: o caminho de API Key da v1 pode usar um cliente compatível e não exige a api-version em formato de data; ainda é preciso verificar a relação entre URL do recurso, Deployment e capacidade do modelo. Caminhos que exigem nova identidade Entra ou adaptação de renovação automática ficam adiados nesta rodada.
- Volcano Ark: Key, endpoint e Model / Endpoint ID da API comum, do Coding Plan e do Agent Plan são confirmados separadamente; um modelo de plano não pode ser usado diretamente como identidade da API comum.
- AWS Bedrock: primeiro distinguir o caminho de API Key + Responses compatível do caminho IAM / assinatura. O primeiro não exige automaticamente um novo protocolo; Region, runtime / mantle, Profile ID e permissões ainda precisam ser validados. Quando for necessária uma capacidade que o Access atual não tem, como renovação de credenciais, a item fica adiado nesta rodada.
- Gemini/Vertex: protocolo nativo e protocolo compatível são validados separadamente; capacidade do modelo, codificação de ferramentas, autenticação e entrada de produto não se validam uns pelos outros. O protocolo nativo ainda não foi integrado, o que não significa parar de observar as mudanças de seus modelos.

## Níveis de manutenção e habilitação padrão

- **Manutenção prioritária**: modelos atualmente promovidos e adequados ao Agent, normalmente habilitados por padrão; considera-se capacidade, velocidade, custo e estabilidade, sem escolher mecanicamente só o modelo maior.
- **Manutenção geral**: os demais modelos ainda aceitos pela entrada oficial e com valor de uso, normalmente desabilitados por padrão, permitindo que o usuário escolha.
- **Observação/pendente de validação**: registrar primeiro; a nova habilitação padrão exige evidência de validação da entrada correspondente, e um item não entra automaticamente por ser gratuito, popular ou anunciado em notícias.
- **Fora de manutenção**: descontinuação explícita, entrada que não aceita mais o modelo de fato, ou remoção do escopo confirmada pelo produto; registrar o motivo e a alternativa.

Estes são os princípios de manutenção. Os padrões de habilitação e desabilitação atuais já existentes têm diferenças históricas, que estão no estado atual; alterar um valor existente é mudança de comportamento de configuração e precisa ser explicada no MR correspondente.

A habilitação e desabilitação padrão ficam em `templateModelRules`, e não são inferidas pelo nome na UI. Membros de template, habilitação/desabilitação padrão e regras de capacidade são revisados separadamente. Passar de manutenção prioritária para geral não equivale a remover; remover um template também não equivale a remover modelos personalizados do usuário nem escolhas históricas.

## Entradas de produto e protocolos

- Se a API comum, o Coding Plan e o Token Plan tiverem endpoints ou credenciais diferentes, o template é separado por entrada de produto. A região só é separada quando a configuração/produto realmente exigir algo diferente e isso não puder ser expresso claramente por um template existente.
- Segue-se o princípio estabelecido: o template oficial prioriza o Anthropic Messages já validado e suportado; quando não for suportado, usa-se outro protocolo que aquela entrada realmente suporte e tenha validação suficiente. Isso não é uma exigência de migrar os templates Responses/Chat existentes.
- Um template tem apenas um `api.type`. Quando modelos diferentes do mesmo site exigirem protocolos diferentes, o template é dividido da forma já existente; não se pode colocar modelos incompatíveis no mesmo template e deixar o Runtime adivinhar o protocolo.
- `templateId` é estável e o `providerId` da instância é independente. Modificar um template não deve renomear instâncias do usuário, sobrescrever endereços do usuário nem reescrever escolhas já salvas.
- As capacidades se baseiam nos modelos e protocolos oficiais; não se pode rebaixar a capacidade de todos os modelos de um mesmo tipo por causa de um proxy de terceiros atrasado. Diferenças conhecidas de site vão para as regras de Site; limitações do proxy do próprio usuário são expressas por uma sobrescrita pessoal precisa.

## Provedores agregadores

O escopo-alvo do OpenRouter é a interseção entre "os upstreams já mantidos" e "os modelos que essa entrada realmente oferece e que estão disponíveis". Não se copia o catálogo dinâmico completo, nem se cobre apenas poucas marcas; cada marca upstream incluída deve ter um modelo em foco adequado, e o restante é selecionado pelo nível de manutenção.

OpenCode Go e Zen são catálogos de produtos diferentes, e as permissões de modelo, os endpoints e os protocolos são verificados separadamente. Os templates de três protocolos existentes devem continuar mantidos separadamente; não se pode tomar os IDs ou as entitlements devolvidos pelo Zen como evidência do Go. Ao integrar outro provedor agregador, o escopo é definido de novo, sem copiar a estrutura de catálogo de ninguém.

Os IDs de modelos agregados são preservados como são, incluindo prefixo de fornecedor, maiúsculas/minúsculas e sufixos com significado real de roteamento. Não se pode remover prefixos de forma padronizada em runtime. Batch, geração de imagem, Embedding, TTS, completion especializado etc. não entram nos templates de conversa/Agent só por aparecerem na Models API; é preciso a capacidade de execução do produto correspondente.

## Remoção e compatibilidade

Primeiro, conferir as mudanças oficiais de descontinuação/roteamento de apelidos, e então distinguir as quatro ações: remover membro, desabilitar a habilitação padrão, remover regra de capacidade e migrar identidade. Uma regra genérica ainda pode servir a outros templates ou a modelos personalizados do usuário; uma regra precisa que se desvinculou dos membros estáticos também pode valer para um modelo pessoal adicionado com o mesmo ID, e não se pode removê-la fazendo apenas a diferença de conjuntos.

Quando um modelo ou um nível de raciocínio salvo deixa de ser válido, o tratamento segue a validação de escolhas já existente, sem substituição silenciosa por um modelo novo ou pelo nível mais alto. Qualquer migração automática exige uma decisão de produto separada e explícita, com evidência de regressão.
