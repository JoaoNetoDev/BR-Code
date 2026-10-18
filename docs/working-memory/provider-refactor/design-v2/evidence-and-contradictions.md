# Auditoria de Origens e Contradições do Provider Refactor

> Status: manutenção contínua
> Objetivo: explicar de onde vem o design vigente e registrar onde os materiais antigos divergem dos fatos atuais; este documento não é um segundo design.

## 1. Método da auditoria

Esta apuração verifica simultaneamente:

- os commits e as diferenças de arquivos do branch atual em relação a `origin/staging`;
- `design`, `steps`, `plan`, `research`, Bugfix e registros de implementação em `docs/working-memory/provider-refactor`;
- os `@zcode/provider`, `@zcode/provider-node`, Services, UI, CLI Bootstrap, Adapter e Built-in Config atuais;
- os testes diretamente relacionados ao comportamento central do Provider;
- os commits de design, implementação e verificação do Todo 32.

Na adjudicação, distingue-se:

| Categoria         | Pergunta que responde                              |
| ----------------- | -------------------------------------------------- |
| Fato de objetivo  | Como o sistema deve funcionar ao final, segundo a decisão mais recente |
| Fato de implementação | Como o código e os testes funcionam agora        |
| Evidência histórica | Por que um design apareceu e quando foi substituído |
| Pendência          | Trabalho já decidido e não concluído, ou ainda em discussão |

Não se pode dar mais autoridade a um documento antigo por ele ser detalhado, nem promover a design um ramo acidental existente no código atual.

## 2. Fatos de branch e diferenças

Ao estabelecer este documento foi adotada a baseline de implementação `e01862000f`:

- o merge-base entre o HEAD atual e `origin/staging` é `65fb4532d347194095cca8848e768f0fdbb28939`;
- essa baseline de implementação tem 238 commits exclusivos em relação ao staging, e o staging tem 236 commits exclusivos;
- a diferença de todo o repositório em `origin/staging...HEAD` é de cerca de 1.271 arquivos e contém muita evolução de produto paralela; não se pode equiparar o diff completo ao Provider Refactor;
- o núcleo do Provider é o `packages/provider`, o `packages/provider-node` e o `config/provider/zcode-builtin.json` novos neste branch, enquanto o staging ainda usa majoritariamente o antigo Model Provider Service, já desativado neste branch;
- o conteúdo atual do Built-in tem o invólucro `schemaVersion + revision + config`, com 21 Providers e 120 Model Rules na camada de conteúdo;
- o Todo 32 foi concluído pelo commit `e01862000f`, e os resultados de UI, i18n, testes e Design relacionados já entraram nesta auditoria.

Portanto, os commits exclusivos do staging precisam ter suas invariantes de produto extraídas item a item; não é possível fazer cherry-pick mecânico das implementações antigas.

### 2.1 Adjudicação das correções de Provider exclusivas do staging

| Commit do staging                                                                            | Problema válido que ele demonstra                                                                  | Veredito para o V2                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1ccf6f906e fix(model-provider): honor selected Start Plan runtime`                           | Quando a mesma Family tem Start e Coding Plan, a escolha explícita do usuário precisa chegar à execução real | Invariante de produto válida; a correção antiga em `modelProviderService` não pode ser portada. A nova arquitetura deve, pelo Account Connection Resolver, marcar Providers não escolhidos como unavailable e, pelo Account Overlay, habilitar apenas o Provider escolhido |
| `b89263389e fix(model-provider): decouple start plan selection`                               | Seleção de plano, navegação por Family e candidatos de modelo não devem se inferir mutuamente de forma errada | Problema válido; entra em Account Connection, Settings View e projeção independente de plano, sem restaurar o antigo family runtime filter                                            |
| `198a013a95 fix(model-provider): avoid boundary token budget in connectivity probes`             | Usar valores de limite de token minúsculos nos testes de conectividade causa falsos negativos        | O comportamento de produto do teste de conexão é válido, mas o helper de conectividade antigo foi removido; deve ser conferido à parte na cadeia de testes formal de ModelFactory/Adapter, sem restaurar o serviço antigo |
| `08862385c3 fix(ui): clarify pending start plan entitlements`                                 | pending, unknown e unavailable não podem ser confundidos com "não atribuído"                     | A semântica dos estados é válida; o Todo 32 acrescenta que o estado do plano não pode determinar se a área de Provider/modelo efetivo existe                                              |

O `AccountProviderConnectionResolver` atual já resolve como available apenas o modo selecionado explicitamente por Family; `resolveAccountProviderConfigs` então o projeta como `access.entitled`, e o Start Plan projeta simultaneamente o conjunto de modelos da conta. Esse ponto de chegada substitui a filtragem de entrega do Registry antigo.

## 3. Principais evidências de código dos fatos atuais

| Fato de design                                        | Principal evidência de implementação                                                              | Principal evidência de teste                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tipos unidos de Provider Schema e Access              | `packages/provider/src/config/provider-config.ts`、`config/schema.ts`                               | `packages/provider/test/provider-config-kinds.test.ts`                     |
| Model Schema, formatos aninhados e ordem das Rules    | `packages/provider/src/config/model-config.ts`                                                      | `model-config-rules.test.ts`、`todo21-source-contracts.test.ts`             |
| Built-in -> Account -> Personal                      | `packages/provider/src/resolver.ts`                                                                | `resolver.test.ts`、`todo21-resolution.test.ts`                             |
| Candidatos de Settings e conjunto executável do Registry vêm da mesma fonte | `resolver.ts`、`facades.ts`                                                        | `facades.test.ts`、`registry.test.ts`                                       |
| Account projeta apenas entitlement e Start models     | `account-provider-resolution.ts`、Services `accountProviderConnectionResolver.ts`                    | `account-provider-resolution.test.ts`、testes correspondentes nos Services    |
| Emparelhamento atômico de revision Built-in / Account | `registry-service.ts`、`account-provider-service.ts`                                                 | `registry-service.test.ts`、`account-provider-service.test.ts`              |
| Persistência Personal, Built-in remoto e LKG          | `packages/provider-node/src/*`                                                                     | `provider-node-runtime.test.ts`、`zcode-builtin-release.test.ts`            |
| Fatos de execução completos e fixos do ModelFactory   | `apps/zcode-cli/packages/bootstrap/src/app/provider-registry-model-runtime.ts`                       | Testes direcionados de Bootstrap, Core e Adapter Provider                  |
| Active Model usa properties de mesma estrutura        | CLI Contracts Model e cadeia de consumo Adapter/Core                                                | Testes direcionados de input/output de Model, mídia e Compact/Subagent      |
| Página de configurações lê e escreve via Facade        | `packages/provider/src/facades.ts`、UI `useProviderSettingsView.ts`                                 | Testes de UI de Provider settings / coding plan                             |
| Conteúdo oficial do Built-in                          | `config/provider/zcode-builtin.json`                                                               | `packages/provider-node/test/zcode-builtin-integrity.test.ts`               |

## 4. Afirmações contraditórias e vereditos

### C01. `Official Config` e `ZCode Built-in Config`

**Formulação histórica**: materiais iniciais de M2/M3 e logs de implementação usam muito `Official Config`.
**Decisão posterior**: o Todo 10 definiu uma troca de nomenclatura única, sem manter alias.
**Fato atual**: tanto tipos quanto arquivos usam `zcodeBuiltin*` / `zcode-builtin.json`.
**Veredito**: os únicos nomes vigentes são `ZCode Built-in Provider Config` e `ZCode Built-in Model Config Rules`.
Os nomes antigos servem apenas como referência histórica.

### C02. `Config Document` é um conceito de domínio?

**Formulação histórica**: o Provider Domain inicial expunha `ProviderConfigDocument` e `ModelSelectionConfigDocument`.
**Decisão posterior**: o usuário exigiu explicitamente remover o conceito de document do design; o Todo 06 devolveu o invólucro de versão e a migration para o Repository.
**Fato atual**: o Domain lida apenas com Config/Rules/Snapshot; `schemaVersion/revision` pertencem ao codec, ao repository ou ao invólucro de publicação remota.
**Veredito**: não existe estado intermediário de domínio Config Document. O arquivo físico ainda pode ter um invólucro de armazenamento.

### C03. Ordem do Provider Overlay

**Conflito histórico**: diagrams iniciais invertiam a ordem de Personal e Account, ou tratavam Account como sobreposição final.
**Decisão explícita**: `ZCode Built-in -> Account -> Personal`, Personal por último.
**Fato atual**: o `ProviderConfigResolver` obtém primeiro `effectiveBuiltinProviders` e só então aplica o Overlay de Personal.
**Veredito**: a ordem vigente é fixa; a responsabilidade de Account é constranger os Providers de conta do Built-in, e o Renderer não a aplica adicionalmente.

### C04. Model Rules: substituição ou concatenação?

**Conflito histórico**: parte dos materiais tratava o Personal Model Config como substituição única.
**Decisão explícita**: Built-in e Personal são concatenação de arrays, com Personal depois.
**Fato atual**: `composeEffective()` preserva a ordem do Built-in e coloca por último as regras exatas de Personal.
**Veredito**: Overlay ordenado; Personal só permite `providerId + modelId` exatos e tem a prioridade mais alta.

### C05. O Account Config possui `accessId/productId/team scope`?

**Formulação histórica**: Research, Todo 07, Todo 20 e revisões de arquitetura iniciais tratavam `accessId` como campo fixo de Config ou Model e discutiam escopo de produto/equipe junto.
**Decisão posterior**: o Todo 24 removeu `accessId`, e o Todo 26 removeu o `planKind` estático e pseudo-campos de protocolo universais.
**Fato atual**: o Schema do Account Provider Config só permite `access.entitled` e `builtinModelIds`. `planKind/productId/organizationId/projectId` ainda existem legitimamente no protocolo de conta, em Subscription, Usage e Request Auth.
**Veredito**: esses campos podem pertencer ao contexto de conta/plano/requisição, mas não podem voltar para o Provider Config, para os fatos estáticos do Registry Model ou para a Selection.

### C06. Account deveria afetar o Config?

**Oscilação histórica**: em certo momento da discussão inclinou-se para "nenhum fato de conta deve ter relação com Config". Após confirmações多方, ficou explícito que os modelos do Start Plan variam por conta e que os direitos de Provider da conta também precisam participar da resolução final.
**Fato atual**: Account é a terceira camada formal de Provider Overlay; projeta apenas `access.entitled` e os `builtinModelIds` que a interface da conta retorna explicitamente.
**Veredito**: Account precisa afetar o Effective Provider, mas não pode virar fonte de Model Properties estáticas, Endpoint ou credenciais dinâmicas.

### C07. Somente o Start Plan retorna um conjunto de modelos?

**Dúvida histórica**: chegou-se a supor que todos os planos de conta poderiam retornar modelos, ou degradar `show_name` para Model ID.
**Fato atual**: o Account Resolver consome apenas os `models` que a interface de conta retorna explicitamente; sem conjunto dinâmico de membresia, vale o Built-in.
A elegibilidade de plano de Individual/Team/Start é gravada uniformemente em `access.entitled`, sem modificar o `enabled` de topo.
A resolução do Start Plan só aceita fatos de modelo explícitos do upstream; o texto de exibição não pode virar identidade de Registry.
**Veredito**: o subconjunto de modelos da conta é um caso especial do Start Plan e não deve ser promovido a um protocolo universal de membresia dinâmica para todos os Account Providers.

### C08. Tipo de Access: `request-auth`, `execution-provided` ou tipo exclusivo de conta?

**Evolução histórica**: M4 usou `request-auth`; o Todo 24 mudou para o genérico `execution-provided` e adicionou campos de protocolo de requisição; o usuário depois achou a abordagem excessivamente generalizada. O Todo 26 substituiu explicitamente o Todo 24.
**Fato atual**: o Access formal só tem `api-key` e `zhipu-account`; Off-Peak é `zhipu-account + mode=off-peak`.
**Veredito**: os dois tipos de Access antigos e `challenge/requestSigning/executionProtocol` são designs intermediários já retirados.

### C09. `family member`, `plan kind`, `group`, `mode`

**Conflito histórico**: chegou-se a tentar manter simultaneamente family member e plan kind, ou deduzir o modo de acesso pelo grupo do Provider.
**Fato atual**: `group` cuida do agrupamento estático de produto; `zhipu-account.family` cuida de Z.ai/BigModel; `mode` cuida de API Key, Start, Individual, Team e Off-Peak.
**Veredito**: os três são ortogonais e não podem ser deduzidos uns dos outros; o protocolo de execução da conta pode continuar usando sua própria nomenclatura `planKind`.

### C10. Provider e Model têm ambos Visibility?

**Formulação histórica**: o Todo 03 chegou a decidir que Provider/Model teriam visibilidade simétrica; o antigo `registry.md` também deixou resíduo da formulação "Provider/Model Visibility".
**Decisão posterior**: o Todo 21 removeu explicitamente a visibility de Model, e o usuário confirmou novamente.
**Fato atual**: o Schema só tem `visibility` de Provider; o `selectable` de Model é calculado pela elegibilidade de execução e pela visibility do Provider.
**Veredito**: Model não tem visibility independente. O design simétrico antigo está invalidado.

### C11. `executionOnly` e "execução confiável"

**Formulação histórica**: antes de M4, `executionOnly` expressava ao mesmo tempo ocultação, execução interna e isenção de integridade, e discutia-se trusted lookup.
**Decisão explícita**: o usuário exigiu que fosse apenas visibilidade genérica, sem vínculo com "confiável"; a camada de Provider Config também não é responsável por limitar se o usuário pode usar o Provider por outras interfaces.
**Fato atual**: `visibility=hidden` afeta apenas a View comum; a busca precisa do Registry ainda pode executar, mas os requisitos de integridade não são relaxados.
**Veredito**: `executionOnly` e o conceito de trusted foram removidos; entradas internas de produto usam seleção precisa por Provider ID fixo.

### C12. Enabled, integridade, Executable, Selectable

**Confusão histórica**: os serviços antigos frequentemente usavam um único `enabled` ou disponibilidade para carregar ao mesmo tempo configuração completa, conta disponível, visibilidade de seleção e elegibilidade de execução.
**Fato atual**: o Resolver salva separadamente `enabled`, issues, `executable` e `selectable`; Settings mantém itens incompletos, e o Registry recebe apenas itens executáveis.
**Veredito**: os quatro fatos são ortogonais. Uma configuração incompleta pode ser salva, mas não fica disponível; o estado do plano da conta não pode apagar a configuração do Provider da página de configurações.

### C13. Nomes de modelo duplicados entre Built-in e Personal

**Formulação histórica**: chegou-se a escrever "todos os modelos em conflito são isolados".
**Decisão explícita**: o usuário exigiu que, quando Built-in e customizado tenham o mesmo nome, o Built-in continue funcionando.
**Fato atual**: o Resolver primeiro deduplica o Built-in e depois descarta membros Personal com o mesmo nome do Built-in.
**Veredito**: Built-in vence; o conflito não derruba o Provider nem deixa a identidade Personal sobrescrever a do Built-in.

### C14. Reasoning Compatibility e hardcode de modelos específicos

**Formulação histórica**: `magic_name`, ox-alpha, casos especiais de GLM, `adapterCompatibility` e `reasoningReplay` existiram ou foram propostos para entrar na configuração.
**Decisão explícita**: todo o código de produção antigo que identificava a intensidade de reasoning por modelo específico saiu; `reasoningReplay` e Compatibility foram removidos por completo.
**Fato atual**: os níveis lógicos são declarados por `optionSpecs.reasoningLevel`, e os campos de protocolo são projetados diretamente para o Request Body bruto final pelo `map(value)` CEL restrito da própria Option; o Schema formal rejeita o campo antigo `reasoningMapping`.
**Veredito**: as diferenças entre modelos específicos são escritas como Model Rules declarativas; Runtime/Adapter não aplicam patches por Model ID.

### C15. Formatos de entrada e saída

**Evolução histórica**: `modalities: { input: string[], output: string[] }`, depois `supportsImages/Pdf/Video` achatados, e finalmente a decisão por property aninhada em snake_case.
**Fato atual**: Config, Registry, Protocol e Model usam uniformemente `properties.input_format/output_format`; PDF/Audio entram nos fatos estáticos, PDF continua com gating em runtime e Audio ainda não tem entrada de codificação de conteúdo.
**Veredito**: os campos antigos só podem aparecer em importer pontual/entrada de teste histórico; não são fatos formais.

### C16. Estados intermediários de Model: ModelRef, ConnectionPort, Capability DTO

**Formulação histórica**: o design antigo do CLI e documentos de trajectory ainda descrevem muito `ModelRef`, `ModelConnectionPort` e capability de catálogo.
**Decisão posterior**: os Todo 01, 02, 04, 05, 08, 14 e 16 concluíram a descontinuação.
**Fato atual**: o objeto público de execução é o Model imutável, criado pelo Factory a partir do Registry formal; mídia e opções são lidas da própria estrutura do Model.
**Veredito**: o design/trajectory antigo do CLI só explica a história e não pode servir de base para a interface vigente do Provider Refactor.

### C17. `Document`, Snapshot e Envelope: tudo deve ser removido?

**Mal-entendido histórico**: a remoção do conceito de Document às vezes foi estendida para "não deve existir nenhum snapshot ou versão".
**Fato atual**: o domínio precisa de Config Snapshot e Registry Snapshot somente-leitura para garantir publicação atômica; Repository/sincronização remota precisam de invólucro de versão. Eles não voltaram a ser DTO de Config editáveis.
**Veredito**: o que foi removido são estados intermediários de domínio redundantes, não os snapshots imutáveis necessários à atomicidade nem a informação física de versão.

### C18. A atualização do Registry exige revision handshake?

**Proposta histórica**: chegou-se a propor que, após o Host salvar, ele enviasse a revision ao Agent e esperasse a revision observada. O usuário achou a abstração excessiva e preferiu que o Host testasse diretamente.
**Implementação atual**: o Source/Registry de cada Environment lê a configuração por si mesmo; o teste de conexão passa pelo Registry/ModelFactory formais do Host; o watcher do Worker tem auto-cura em caso de falha; e as revisions Built-in e Account são emparelhadas atomicamente no Registry Service.
**Veredito**: não se introduz Registry Snapshot entre processos nem revision handshake genérico. O ponto de entrada de execução precisa esperar o resultado da atualização formal deste Environment.

### C19. A página de configurações lê o Account Overlay?

**Formulação histórica**: parte do design de UI compunha Account Overlay, cartões de plano e configuração de Provider direto no Renderer, e até deixava o estado de entitlement controlar a área de modelos.
**Decisão explícita**: a página de configurações lê apenas a Provider Settings View final; o estado do plano é projetado de forma independente.
**Resultado da implementação**: o Todo 32 foi concluído em `e01862000f`. Os detalhes de Team/Individual são resolvidos com precisão por `providerId` a partir da Provider Settings View; o estado do plano não controla mais se a área de configuração e a lista de modelos existem; `not-allocated` e `credential-unavailable` viraram estados explícitos de página.
**Veredito**: essa fronteira já virou fato vigente; a projeção de plano não pode voltar a ser a autoridade da configuração do Provider.

### C20. Endpoint/API Schema aparece na página de Account?

**Conflito histórico**: o design genérico de configurações exigia Endpoint/Schema do Built-in visíveis, porém somente-leitura; a decisão mais recente do Todo 32 determina ocultá-los nas páginas de Individual/Team Coding Plan.
**Veredito**: o Built-in em geral continua exibindo fatos de conexão somente-leitura; Individual/Team são exceção de exibição de produto. Os campos nunca foram removidos do Effective Config e continuam em uso pelo Runtime.

### C21. Posição do feedback nas configurações

**Conflito histórico**: o antigo `settings.md` chegou a descrever um Toast global no rodapé da página/viewport; o feedback posterior em dispositivo real exigiu claramente o rodapé da coluna de detalhes do Provider à direita, com estilo de banner e substituição do estado antigo pelo novo.
**Fato atual**: Bugfix/Todo recentes convergiram para o feedback na coluna de detalhes.
**Veredito**: o design central adota o banner no rodapé da coluna de detalhes do Provider; isso é apenas uma projeção de interação e não muda a autoridade da configuração.

### C22. `modelContextBudget.strategy` e a suposta Official Runtime Config

**Discussão histórica**: chegou-se a tentar incorporar todos os campos de `/client/configs` remoto ao Provider Config, ou criar uma Official Runtime Config.
**Decisão explícita**: esse campo pertence a parâmetros do Agent/graduação gradual de produto, não tem relação com a configuração estática de modelo, não é tratado nesta rodada e nenhum novo domínio de configuração é criado.
**Veredito**: não pertence ao Provider Refactor.

### C23. Remote Provisioning

**Plano histórico**: parte dos planos de fechamento listava a sincronização local para remoto, a edição remota e o login como itens não concluídos do refactor de Provider.
**Decisão explícita**: Remote Provisioning é uma capacidade de produto independente e não pertence a este refactor.
**Veredito**: o Provider apenas determina que cada Environment de execução tem sua própria fonte de fatos; este design não define como a configuração é distribuída entre Environments.

### C24. Quem responde pela integridade do Built-in

**Controvérsia histórica**: os Todo 18/19 discutiram a aplicação de muitos "integridade estática" gates no cliente; o usuário entendeu que as regras são difíceis de manter e que talvez devessem ficar com quem publica.
**Decisão explícita**: não estender a verificação de integridade por enquanto; a discussão histórica do Todo 19 está descartada, e, se houver necessidade no futuro, deve ser criada uma nova tarefa de gate de publicação.
**Fato atual**: Schema, Resolver e o built-in integrity test existente protegem o contrato executável atual; não há novo fluxo de trabalho de publicação remota.
**Veredito**: a integridade de execução existente é mantida; um gate de publicação mais forte não pode ser escrito como design vigente sem antes ser discutido.

### C25. Provider Start independente e semântica vigente de conexão única

**Formulação antiga conflitante**: Start/Individual/Team compartilhavam um único current, e a escolha de Start era mapeada pelo plano corrente. A discussão também chegou a propor uma entrada unificada virtual, mapeamento entre marcas, migração total de seleções, snapshot de conexão no upgrade, notificação global de invalidação de múltiplos Providers e verificação adicional de corrida de autenticação. Esses candidatos não podem ser contrato final.

**Decisão posterior do usuário (2026-09-16)**: manter os dois IDs de Start, o nome unificado e o logo de cada marca, colocando-os no agrupamento existente da Zhipu; nos detalhes, remover apenas conectar/desconectar. Manter o current e permitir que Start coexista com a conexão paga atual; Start é resolvido estritamente pela identidade original, e entre planos pagos o mapeamento é mantido; o JWT reaproveita o login, e a corrida de contas segue como está. O usuário foi explícito: "não migrar, adicionar uma otimização" — apenas recomendar, quando o usuário submete/cria e salva, um Start do mesmo modelo que tenha cota e seja compatível com reasoning; isso inclui o salvamento explícito de modelo do Subagent, com exclusão final de Run Now. A preferência vale entre entradas, após reinício e no celular do mesmo Host, sem sincronização nas nuvens da conta. Na invalidação, o feedback de cota é mantido, e a notificação global de conexão trata apenas de planos pagos.

**Fatos de código/testes antes da implementação**: current, mapeamento público de contas e autenticação de requisição do Start tinham antes uma restrição de conexão antiga, e a navegação de configurações tinha efeitos colaterais de conexão. Uma Session comum grava de volta a escolha atual ao iniciar a execução do envio, e o rascunho grava de volta após o accepted; portanto, "todas as sessões antigas retêm Start por muito tempo" não se sustenta. Automation apenas fixa o run, e a execução explícita de Subagent não altera a configuração de longo prazo; ausência de migração não significa que todo o comportamento válido antigo permanece idêntico. I27/MP-R03 injeta de fato Recent e a asserção faz fallback para Configured Default, de modo que a descrição Start→Team da matriz antiga não prova que uma Session comum precisa de migração. Ver [pesquisa](../research/todo154-start-plan-independence-impact.md).

**Veredito final**: o objetivo entra no Design V2 §4.5, e o escopo completo de implementação pertence ao [Todo154](../steps/todo-154-start-plan-independent-provider.md). Preservar os dados existentes e resolvê-los pela nova semântica; não criar mecanismo de migração, não reescrever histórico e não escolher secretamente um modelo pago por remover um mapeamento. A proposta ampliada acima fica retirada. O usuário autorizou depois, em 2026-09-16, a execução do Todo154 e uma revisão completa; o restante do Todo101 continua adiado. O comportamento formal é sincronizado na [especificação de Start](../../../zai-start-plan-provider.md).

**owner e condições de conclusão**: o Todo154 responde pela implementação e pelas regressões em desktop/celular/Worker de estado/autenticação/seleção de modelo/navegação, recomendação na submissão, preferência e feedback de invalidação. Os 17 testes anteriores à implementação servem apenas como evidência histórica. Já foram implementados current/JWT independentes, resolução de identidade precisa do Start, navegação independente e a recomendação na submissão nas quatro entradas; não há migração de dados. Os testes direcionados, a execução real via SSH no Electron do Pro admin e o resultado da revisão estão registrados de forma unificada no Todo154 §8, sem tratar simulação de tela estreita como verificação em aparelho físico.

### C26. A caixa de aprovação de acesso total pode alterar a permissão da fila já aceita?

**Formulação antiga**: [Todo71](../steps/todo-71-persistent-composer-draft-and-submission-state.md) e [Todo151](../steps/todo-151-independent-plan-state-draft.md) exigem que, após o Submission entrar na fila, a configuração original seja preservada, sem reescrita por causa do rascunho ou do resultado da aprovação.

**Decisão posterior (2026-09-17)**: o usuário especificou que apenas o "acesso total" recém-adicionado na caixa de aprovação de permissão sincroniza a tarefa atual, o Composer e todas as mensagens pendentes da fila com `mode=yolo`; cada `planEnabled` e os demais campos são mantidos. O menu comum do Composer ainda altera apenas o rascunho.

**Fato atual**: o comando de troca imediata ainda é usado pelo Bot, pela automação e por caminhos de compatibilidade; `app.setMode()` também grava a preferência de permissão do projeto, e passar apenas yolo desliga o Plan sem atualizar a fila nem responder a uma aprovação já existente. O desligamento do Plan pela função compartilhada de normalização foi reproduzido com execução mínima; o novo comportamento de aprovação ainda não foi implementado.

**Veredito final**: adicionar uma exceção explícita de atualização de permissão exclusiva da aprovação, sem derrubar o congelamento de seleção de modelo, a independência do Plan, o consumo de fila comum nem o owner do rascunho. O Agent coordena a permissão da tarefa, a fila-alvo completa e a resposta corrente, e o cliente sincroniza o rascunho correspondente de forma direcionada; não se herda o efeito colateral de escrita do padrão do projeto nem se altera globalmente a semântica antiga de normalização de requisições.

**Status de conclusão**: implementado conforme o veredito, com a aceitação ainda não totalmente consolidada; o owner é o [Todo158](../steps/todo-158-permission-dialog-full-access-and-queued-mode.md). As evidências de regressão de SQLite, Runtime, broker, V4 e Composer e as falhas de baseline estão na seção 9 dele; a cadeia completa shared-host do celular ainda não foi verificada e casos pendentes não são considerados admissão formal.

## 5. Nível de uso dos materiais antigos

### 5.1 Podem servir como evidência do design vigente

- a arquitetura de dois caminhos e os princípios centrais de `design/design.md`, enquanto não corrigidos por esta tabela;
- o contrato de campos atual de `design/registry/configuration.md`;
- `design/model/input-output-format.md`;
- `design/registry/model-membership-and-enablement.md`;
- os vereditos finais dos Todo 21, 23, 26, 28, 29 e 32;
- o Schema, Resolver, Registry, ModelFactory e os testes atuais.

### 5.2 Só podem servir como evidência histórica de implementação

- os documentos de implementação M1–M4 e o implementation log;
- os Todo 00–10, 12–14, 16–18, 20, 24, 25, 27, 30 e 31;
- os Bugfix 01–06;
- as revisões de MR de Provider e as revisões de conformidade de arquitetura;
- registros de Research e de dogfood.

Esses documentos podem explicar por que uma abstração foi removida, mas seus Schemas intermediários não podem sobrepor decisões posteriores.

### 5.3 Materiais-chave explicitamente substituídos

- Model visibility no Todo 03: substituído pelo Todo 21;
- `request-auth/accessId` em M4 e nos Todo 02, 07, 14 e 15: substituídos pelos Todo 24/26;
- `execution-provided + executionProtocol` no Todo 24: substituído pelo Todo 26;
- `Official Config`, capacidades achatadas antigas e a proposta de `accessId` no Research: substituídos pelo Todo 10, pelo design de formatos de entrada e saída e pelos Todo 24/26;
- documentos antigos de ModelRef/Capability do CLI v2: substituídos pela limpeza real feita nos Todo 00–16;
- Toast global no rodapé das configurações: substituído pelas decisões posteriores de interação em dispositivo real.

### 5.4 Ainda não podem entrar como fatos vigentes

- os candidatos antigos do Todo154: Provider virtual, mapeamento entre marcas, migração total e nova barreira de autenticação foram retirados; a implementação e a verificação atuais seguem o Todo154 §8;
- Todo 11: Draft;
- Todo 11A: pendente de execução;
- Todo 15: descartado, não é mais item de execução independente;
- Todo 19: descartado, não é mais item de execução independente;
- Todo 22: Draft;
- as extensões de fatos de modelo Built-in do relatório de Research que ainda não foram implementadas;
- itens ainda não concluídos na validação manual E2E, em contas reais, em pacotes oficiais e na verificação multiplataforma.

## 6. Evidências de conclusão e auditorias restantes

### 6.1 Evidências de conclusão do Todo 32

O Todo 32 foi concluído no commit `e01862000f`, com o status dos arquivos atualizado para "concluído". O registro de implementação prova que:

- o estado do plano não controla mais a existência da área de configuração de Provider/modelo;
- os modelos de Team/Individual vêm da Provider Settings View;
- os modelos de Team continuam suportando a ordenação existente, o liga/desliga e a edição do Personal Model Config;
- Endpoint/API Schema só é ocultado na UI de produto, sem alterar a configuração de runtime;
- loading, não atribuído explícito, credencial indisponível e falha de requisição não se deduzem mais uns dos outros pelo texto de exibição.

Os resultados de verificação registrados são 220 testes direcionados de UI de Provider aprovados, 1470 arquivos de teste unitário com 12480 testes aprovados em execução total, além de `typecheck`, `lint`, verificação de formatação dos arquivos alterados e `git diff --check` na raiz aprovados. Essa evidência mostra que a implementação foi implantada; a experiência com contas Team reais e pacotes oficiais continua sendo verificação de publicação e não altera o status do design.

### 6.2 Integração final com o staging

Atualmente há uma divergência grande em relação ao staging. Antes da merge final, os commits de Provider exclusivos do staging devem ser revisados como "migração de invariantes de produto", e não como "preservação de código antigo", verificando com prioridade:

1. a escolha explícita de Start/Individual/Team/API Key chega ao Account Overlay e à criação real de Model;
2. o teste de conexão não gera falsos negativos por causa de um orçamento de output token minúsculo;
3. entitlements pending/unknown não são reportados indevidamente como não atribuídos;
4. as novas funcionalidades de negócio/UI do staging não reintroduzem o antigo Provider Service, o family runtime filter, Capability DTO ou hardcode de modelos específicos.

### 6.3 Verificação de publicação

A automação existente já provou os principais contratos de domínio, mas os itens a seguir ainda são verificação de lançamento e não lacunas de design:

- requisições reais de API Key, Start, Individual, Team e Off-Peak;
- o caminho Built-in nos artefatos oficiais de Desktop/CLI;
- macOS, Windows, Linux e o importer histórico de Personal Config;
- atualização de Config, reinício de processo e cold start;
- validação manual E2E adiada e gates de ambiente em contêiner.

### 6.4 Campos semelhantes fora do Provider Config

Ainda é possível pesquisar em todo o repositório por nomes como `planKind`, `productId`, `modalities`, `supportsImages` e `ModelRef`. Não se pode declarar regressão apenas pela string:

- `planKind/productId` no protocolo de conta, Subscription e Usage são campos de negócio legítimos;
- `modalities` no legacy importer/test fixture é entrada de compatibilidade;
- `supportsImages` em helpers de conversão local do Adapter pode ser parâmetro de função, mas não pode virar uma segunda autoridade das capacidades do Active Model;
- `ModelRef` no design/trajectory histórico do CLI é resíduo documental, não interface de produção atual.

A zeragem mecânica precisa ficar restrita aos caminhos formais de Provider Config, Registry, Model e Runtime, para evitar apagar indevidamente conceitos legítimos de outras áreas.

## 7. Formato de manutenção futura

Ao adicionar uma contradição, acrescente um item `Cxx` documentando, no mínimo:

1. a formulação antiga conflitante;
2. a decisão explícita posterior;
3. o fato atual de código/testes;
4. o veredito final;
5. se não concluído, o Todo owner e as condições de verificação.

Documentos históricos não devem ser reescritos como se "na época já soubessem a resposta final". Preservar a trajetória original e manter as decisões neste documento é o que permite atender simultaneamente à clareza do design vigente e à credibilidade da auditoria histórica.